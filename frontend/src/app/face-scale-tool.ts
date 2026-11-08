/**
 * « Déformer » (groupe Modifier, comme l'échelle centrée de SketchUp, Option · Ctrl) : un clic sur une face plane y pose
 * un cadre jaune et ses poignées vertes. Tirer un coin agrandit ou réduit la face dans les deux sens, tirer le milieu
 * d'un côté dans ce sens seulement, toujours depuis son centre (le point rouge) ; le champ « Échelle » la donne au
 * chiffre. Les côtés du corps vont droit de l'ancien bord au nouveau (features/face-scale.ts). OK ajoute la
 * déformation à l'historique ; elle se rouvre pour reprendre le cadre.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import type { FaceScale, ModifierFeature, Vec3 } from "../document/types";
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

  /** The face clicked becomes the one scaled. */
  private async take(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Cliquez une face plane.", "info");
      this.target = pick.bodyId;
      this.face = frameOf(outline);
      this.render();
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
  }

  protected override render(): void {
    super.render();
    this.draw();
  }

  protected feature(): ModifierFeature | string {
    if (!this.target || !this.face) return "Cliquez la face à agrandir ou à réduire.";
    if (this.face.scale[0] === 1 && this.face.scale[1] === 1) return "Tirez une poignée verte, ou tapez l'échelle.";
    return { id: this.id, type: "modifier", name: this.name, target: this.target, kind: "face-scale", amount: 0, face: this.face };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le corps ne se déforme pas ainsi.") : null;
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

  /** A click on a face takes it; not the body being deformed, whose faces have moved. */
  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (pick && pick.bodyId !== this.id) void this.take(pick);
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
      ...(ku === kv
        ? [this.numberRow("Échelle", ku, "plain", (v) => this.setScale([v, v]))]
        : [this.numberRow("Échelle en longueur", ku, "plain", (v) => this.setScale([v, kv])), this.numberRow("Échelle en largeur", kv, "plain", (v) => this.setScale([ku, v]))]),
      ku !== 1 || kv !== 1 ? this.info(`Devient ${size(face.scale)}.`) : null,
      this.info("Tirez un coin vert pour agrandir dans les deux sens, le milieu d'un côté pour un seul sens : la face garde son centre, les côtés suivent bien droits."),
    ];
  }
}
