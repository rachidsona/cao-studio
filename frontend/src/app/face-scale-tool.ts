/**
 * « Déformer » (groupe Modifier, comme l'échelle centrée de SketchUp, Option · Ctrl) : un clic sur une face plane y pose
 * un cadre jaune et ses poignées vertes. Tirer un coin agrandit ou réduit la face dans les deux sens, tirer le milieu
 * d'un côté dans ce sens seulement, toujours depuis son centre (le point rouge) ; le champ « Échelle » la donne au
 * chiffre. Les côtés du corps vont droit de l'ancien bord au nouveau (features/face-scale.ts). OK ajoute la
 * déformation à l'historique ; elle se rouvre pour reprendre le cadre. Un clic sur une face d'un autre corps l'ajoute :
 * elle prend la même échelle (dans ses propres sens), une étape par corps, OK les faisant toutes en une seule annulation ;
 * Maj + clic sur un corps choisi le retire.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type FaceScale, type ModifierFeature, type Vec3 } from "../document/types";
import { freshFeatureIds, removing } from "./curic-common";
import { draggedScale, faceFrame, faceNormal, handlePoint, HANDLES, type Handle } from "../features/face-scale";
import type { FaceOutline } from "../geometry/protocol";
import { formatLength } from "../measurements/units";
import type { FacePick } from "../viewport/selection-layer";
import { Marks } from "./measure";
import { PanelTool, type ToolContext } from "./panel-tool";

const PICK_PX = 14;
const YELLOW = 0xfacc15;
const GREEN = 0x22c55e;
const RED = 0xdc2626;
const GREY = 0x9ca3af;

/** The frame of a flat face, from its outline. */
function frameOf(outline: FaceOutline): FaceScale {
  const points = outline.edges.flatMap((e): Vec3[] => (e.kind === "line" ? [e.a, e.b] : e.kind === "arc" ? [e.a, e.b, e.mid] : []));
  return faceFrame(outline.normal, points, outline.edges.flatMap((e) => (e.kind === "circle" ? [e] : [])));
}

export class FaceScaleTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private face: FaceScale | null = null;
  /** The faces of the other bodies chosen, scaled alike (their own frame), each a step made with this one. */
  private more: { target: string; face: FaceScale }[] = [];
  /** The handle being dragged. */
  private drag: Handle | null = null;
  private readonly marks = new Marks(this.ctx.viewport.scene);

  constructor(ctx: ToolContext, editing: ModifierFeature | null, pick: FacePick | null = null) {
    super(ctx, "Déformer", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Déformation");
    this.target = editing?.target;
    this.face = editing?.face ?? null;
    if (pick) void this.take(pick);
  }

  /**
   * The face clicked becomes the one scaled — of the first body, or of another one chosen; a face of a body not chosen
   * yet adds it, scaled alike; Maj + clic on a body chosen (or its preview) takes it off.
   */
  private async take(pick: FacePick, remove = false): Promise<void> {
    try {
      const all = [...(this.target && this.face ? [{ target: this.target, face: this.face }] : []), ...this.more];
      const own = all.findIndex((m) => m.target === pick.bodyId);
      const preview = this.ids().indexOf(featureOfBody(pick.bodyId));
      const at = own >= 0 ? own : preview < all.length ? preview : -1;
      if (remove && at >= 0 && !this.editing) all.splice(at, 1);
      else if (own < 0 && at >= 0) return; // A preview's faces have moved: not taken.
      else {
        const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
        if (outline.surface !== "PLANE") return this.ctx.notify("Cliquez une face plane.", "info");
        const face = { ...frameOf(outline), scale: this.face?.scale ?? ([1, 1] as [number, number]) };
        if (at >= 0) all[at] = { target: pick.bodyId, face };
        else if (this.editing || !all.length) all.splice(0, 1, { target: pick.bodyId, face });
        else all.push({ target: pick.bodyId, face });
      }
      const [first, ...rest] = all;
      this.target = first?.target;
      // The scale stays the one set, whichever face now carries the handles.
      this.face = first ? { ...first.face, scale: this.face?.scale ?? first.face.scale } : null;
      this.more = rest;
      this.render();
      this.schedulePreview();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** The frame where it is now, where it was (dashed), its handles and its centre. */
  private draw(): void {
    this.marks.clear();
    const face = this.face;
    if (!face) return;
    const corners: Handle[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach((c, i) => {
      const next = corners[(i + 1) % 4]!;
      this.marks.line(handlePoint(face, c), handlePoint(face, next), YELLOW, false);
      if (face.scale[0] !== 1 || face.scale[1] !== 1) this.marks.line(handlePoint({ ...face, scale: [1, 1] }, c), handlePoint({ ...face, scale: [1, 1] }, next), GREY, true);
    });
    for (const h of HANDLES) this.marks.dot(handlePoint(face, h), GREEN);
    this.marks.dot(face.center, RED);
    // The other faces chosen: their frame only, at the same scale.
    for (const m of this.more) corners.forEach((c, i) => this.marks.line(handlePoint({ ...m.face, scale: face.scale }, c), handlePoint({ ...m.face, scale: face.scale }, corners[(i + 1) % 4]!), YELLOW, false));
  }

  protected override render(): void {
    super.render();
    this.draw();
  }

  protected feature(): ModifierFeature | string {
    if (!this.target || !this.face) return "Cliquez la face à agrandir ou à réduire.";
    if (this.face.scale[0] === 1 && this.face.scale[1] === 1) return "Tirez une poignée verte, ou tapez l'échelle.";
    return this.made(this.id, this.name, this.target, this.face);
  }

  private made(id: string, name: string, target: string, face: FaceScale): ModifierFeature {
    return { id, type: "modifier", name, target, kind: "face-scale", amount: 0, face: { ...face, scale: this.face?.scale ?? face.scale } };
  }

  /** The steps of the other bodies chosen, ids after this one's. */
  private steps(): { id: string; name: string }[] {
    const doc = this.docBefore();
    const first = this.target && this.face ? [this.made(this.id, this.name, this.target, this.face)] : [];
    return freshFeatureIds({ ...doc, features: [...doc.features, ...first] }, "md", "Déformation", this.more.length);
  }

  private ids(): string[] {
    return [this.id, ...this.steps().map((n) => n.id)];
  }

  protected override companions(): ModifierFeature[] {
    return this.steps().map((n, i) => this.made(n.id, n.name, this.more[i]!.target, this.more[i]!.face));
  }

  protected override blocker(): string | null {
    for (const id of this.ids()) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "Le corps ne se déforme pas ainsi.";
    }
    return null;
  }

  /** The handle under the pointer. */
  private handleAt(event: PointerEvent): Handle | null {
    const face = this.face;
    if (!face) return null;
    let best: Handle | null = null;
    let nearest = PICK_PX;
    for (const h of HANDLES) {
      const d = this.ctx.viewport.screenDistance(event, handlePoint(face, h));
      if (d < nearest) [best, nearest] = [h, d];
    }
    return best;
  }

  /** Where the pointer's ray meets the plane of the face (none when the plane is seen edge on). */
  private onPlane(event: PointerEvent): Vec3 | null {
    const face = this.face!;
    const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
    const n = new THREE.Vector3(...faceNormal(face));
    const across = n.dot(new THREE.Vector3(...direction));
    if (Math.abs(across) < 0.02) return null;
    const t = n.dot(new THREE.Vector3(...face.center).sub(new THREE.Vector3(...origin))) / across;
    return t > 0 ? ([0, 1, 2].map((i) => origin[i]! + direction[i]! * t) as Vec3) : null;
  }

  override down(event: PointerEvent): boolean {
    this.drag = this.handleAt(event);
    return !!this.drag;
  }

  override move(event: PointerEvent): void {
    if (!this.drag) {
      this.ctx.viewport.renderer.domElement.style.cursor = this.handleAt(event) ? "grab" : "";
      return;
    }
    const point = this.onPlane(event);
    if (!point) return;
    this.face = { ...this.face!, scale: draggedScale(this.face!, this.drag, point) };
    this.draw();
    this.schedulePreview();
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.drag) {
      this.drag = null;
      this.render();
      this.schedulePreview();
      return true;
    }
    return super.up(event, isClick);
  }

  /** A click on a face takes it (or adds its body); not a body being deformed, whose faces have moved. */
  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (pick) void this.take(pick, removing(event));
  }

  protected override dispose(): void {
    this.ctx.viewport.renderer.domElement.style.cursor = "";
    this.marks.clear();
  }

  private setScale(scale: [number, number]): void {
    if (!this.face || !scale.every((k) => k > 0)) return;
    this.face = { ...this.face, scale };
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const face = this.face;
    if (!face || !this.target) return [this.info("Cliquez la face à agrandir ou à réduire.")];
    const unit = this.ctx.unit();
    const [ku, kv] = face.scale;
    const size = (k: [number, number]) => `${formatLength(face.size[0] * k[0], unit)} × ${formatLength(face.size[1] * k[1], unit)}`;
    return [
      this.info(`Face de « ${bodyLabel(this.ctx.doc(), this.target)} » : ${size([1, 1])}.`),
      this.more.length ? this.info(`Et ${this.more.length} autre${this.more.length > 1 ? "s" : ""} : ${this.more.map((m) => `« ${bodyLabel(this.ctx.doc(), m.target)} »`).join(", ")}, à la même échelle. Maj + clic sur un corps choisi le retire.`) : null,
      this.editing || this.more.length ? null : this.info("Cliquez une face d'un autre corps : elle est déformée de même, OK les fait toutes en une seule annulation."),
      ...(ku === kv
        ? [this.numberRow("Échelle", ku, "plain", (v) => this.setScale([v, v]))]
        : [this.numberRow("Échelle en longueur", ku, "plain", (v) => this.setScale([v, kv])), this.numberRow("Échelle en largeur", kv, "plain", (v) => this.setScale([ku, v]))]),
      ku !== 1 || kv !== 1 ? this.info(`Devient ${size(face.scale)}.`) : null,
      this.info("Tirez un coin vert pour agrandir dans les deux sens, le milieu d'un côté pour un seul sens : la face garde son centre, les côtés suivent bien droits."),
    ];
  }
}
