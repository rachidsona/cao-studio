/**
 * « Panneaux sur faces » (groupe Modifier) : cliquez les faces planes ou cylindriques d'un volume qui deviennent des
 * panneaux (une face cylindrique : une planche cintrée) — un clic
 * prend aussi les faces pareilles (les côtés d'un seau à pans), recliquez pour les retirer — et réglez l'épaisseur et
 * l'assemblage : en onglet, à tout angle, ou bout à bout (la première face cliquée passe). Les faces non choisies
 * restent ouvertes (features/paneling.ts). OK ajoute l'opération à l'historique ; elle se rouvre pour la reprendre.
 * Les faces se prennent sur le volume d'avant l'opération, comme pour la Coque. Une face d'un autre volume cliquée
 * l'ajoute : ses faces se choisissent de même, une étape par volume pour un seul OK ; un volume dont on retire toutes
 * les faces n'est plus pris.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type FaceRef, type PanelingFeature } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import { el } from "../ui/dom";
import { faceTwins } from "./face-twins";
import { PanelTool, type ToolContext } from "./panel-tool";
import { freshFeatureIds } from "./curic-common";

const JOINTS: [PanelingFeature["joint"], string][] = [["miter", "En onglet (tout angle)"], ["butt", "Bout à bout"]];
/** A volume chosen: its snapshot, the faces taken on it (and their references, in the order taken). */
type Chosen = { target: string; mesh: BodyMesh; selected: number[]; refs: FaceRef[]; describing: number };
const BUTTON = "h-8 flex-1 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export class PanelingTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private thickness: number;
  private joint: PanelingFeature["joint"];
  /** A click takes the faces like the one clicked too. */
  private twins = true;
  /** The volumes chosen, the first one this step's, a step each for the others. */
  private bodies: Chosen[] = [];
  /** The volume clicked last: what « Toutes les faces » and « Aucune » act on. */
  private active = 0;
  private readonly group = new THREE.Group();

  constructor(ctx: ToolContext, editing: PanelingFeature | null) {
    super(ctx, "Panneaux sur faces", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "pn");
    this.name = editing?.name ?? uniqueName(doc, "Panneaux");
    this.thickness = editing?.thickness ?? 19;
    this.joint = editing?.joint ?? "miter";
    ctx.viewport.scene.add(this.group);
  }

  /** Opens on the body being edited, or on the faces picked in the model, or waits for a click on a body. */
  async open(preselected: { bodyId: string; faceIndex: number }[] = []): Promise<void> {
    const editing = this.editing as PanelingFeature | null;
    if (editing) {
      try {
        const body: Chosen = { target: editing.target, mesh: await this.ctx.geometry.mesh(editing.target), selected: [], refs: editing.faces, describing: 0 };
        body.selected = await this.facesOf(body, editing.faces);
        this.bodies = [body];
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    } else {
      // The faces picked beforehand, volume by volume.
      for (const bodyId of new Set(preselected.map((f) => f.bodyId))) this.add(bodyId, preselected.filter((f) => f.bodyId === bodyId).map((f) => f.faceIndex), false);
    }
    this.redraw();
    this.start();
  }

  /**
   * The faces of the snapshot the saved references name: a flat one by the triangles nearest its centre; a curved one
   * by asking the kernel (the centre of a drum is on its axis, as near the inside of a ring as its outside).
   */
  private async facesOf({ target, mesh }: Chosen, refs: readonly FaceRef[]): Promise<number[]> {
    let described: (FaceRef | null)[] | null = null;
    const out: number[] = [];
    for (const ref of refs) {
      if (ref.type === "PLANE") {
        out.push(...this.faceNear(mesh, ref.center));
        continue;
      }
      described ??= await Promise.all(mesh.faceGroups.map(async (_, f) => ((await this.ctx.geometry.describe(target, [], f).catch(() => null))?.face as FaceRef | undefined) ?? null));
      const same = (a: FaceRef) => a.type === ref.type && Math.hypot(...a.center.map((c, i) => c - ref.center[i]!)) < 0.5 && a.normal.reduce((s, c, i) => s + c * ref.normal[i]!, 0) > 0.999;
      const found = described.findIndex((d) => d !== null && same(d));
      if (found >= 0) out.push(found);
    }
    return out;
  }

  /** The face of the snapshot whose triangles pass nearest a point (to find saved faces again). */
  private faceNear(mesh: BodyMesh, point: [number, number, number]): number[] {
    let best = -1;
    let nearest = Infinity;
    mesh.faceGroups.forEach((g, face) => {
      for (let k = g.start; k < g.start + g.count; k++) {
        const i = mesh.indices[k]! * 3;
        const d = Math.hypot(mesh.vertices[i]! - point[0], mesh.vertices[i + 1]! - point[1], mesh.vertices[i + 2]! - point[2]);
        if (d < nearest) [best, nearest] = [face, d];
      }
    });
    return best >= 0 ? [best] : [];
  }

  /** Takes a face of a volume (and those like it), or gives it back when it is taken. */
  private toggle(body: Chosen, face: number, twins = this.twins): void {
    const faces = twins ? faceTwins(body.mesh, face) : [face];
    body.selected = body.selected.includes(face) ? body.selected.filter((f) => !faces.includes(f)) : [...body.selected, ...faces.filter((f) => !body.selected.includes(f))];
  }

  /** Another volume, with these faces taken, the one clicked last. */
  private add(bodyId: string, faces: number[], twins = this.twins): void {
    const mesh = this.ctx.viewport.bodyMesh(bodyId);
    if (!mesh) return;
    const body: Chosen = { target: bodyId, mesh, selected: [], refs: [], describing: 0 };
    for (const face of faces) this.toggle(body, face, twins);
    this.bodies = [...this.bodies, body];
    this.prune();
    this.active = this.bodies.indexOf(body);
    void this.describe(body);
  }

  /** A volume left without a face is no longer taken (the only one stays, to be clicked again). */
  private prune(): void {
    if (this.bodies.length > 1) this.bodies = this.bodies.filter((b) => b.selected.length);
    this.active = Math.min(this.active, Math.max(0, this.bodies.length - 1));
  }

  private made(id: string, name: string, body: Chosen): PanelingFeature {
    return { id, type: "paneling", name, target: body.target, faces: body.refs, thickness: this.thickness, joint: this.joint };
  }

  protected feature(): PanelingFeature | string {
    const first = this.bodies[0];
    if (!first) return "Cliquez une face du volume à mettre en panneaux.";
    if (!first.refs.length) return "Cliquez les faces qui deviennent des panneaux.";
    return this.made(this.id, this.name, first);
  }

  /** The other volumes whose faces are known, and their steps, ids after this one's. */
  private others(): { body: Chosen; id: string; name: string }[] {
    const doc = this.docBefore();
    const first = this.feature();
    const more = this.bodies.slice(1).filter((b) => b.refs.length);
    return freshFeatureIds({ ...doc, features: [...doc.features, ...(typeof first === "string" ? [] : [first])] }, "pn", "Panneaux", more.length).map((n, i) => ({ ...n, body: more[i]! }));
  }

  protected override companions(): PanelingFeature[] {
    return this.others().map((o) => this.made(o.id, o.name, o.body));
  }

  protected override blocker(): string | null {
    for (const id of [this.id, ...this.others().map((o) => o.id)]) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "Les panneaux ne se font pas.";
    }
    return null;
  }

  protected rows(): (HTMLElement | null)[] {
    const all = el("button", { type: "button", class: BUTTON }, "Toutes les faces");
    const body = this.bodies[this.active];
    all.addEventListener("click", () => {
      if (!body) return;
      body.selected = body.mesh.faceGroups.map((_, f) => f);
      this.redraw();
      void this.describe(body);
    });
    const none = el("button", { type: "button", class: BUTTON }, "Aucune");
    none.addEventListener("click", () => {
      if (!body) return;
      body.selected = [];
      this.prune();
      this.redraw();
      void this.describe(body);
    });
    const label = (b: Chosen) => `« ${bodyLabel(this.ctx.doc(), b.target)} »`;
    return [
      this.info(body ? `${body.selected.length} face(s) en panneaux${this.bodies.length > 1 ? ` sur ${label(body)}` : ""} : cliquez-en d'autres, recliquez pour retirer.` : "Cliquez une face du volume : elle devient un panneau."),
      this.bodies.length > 1 ? this.info(`${this.bodies.length} volumes : ${this.bodies.map(label).join(", ")}. Un volume dont on retire toutes les faces n'est plus pris.`) : null,
      body && !this.editing ? this.info("Cliquez une face d'un autre volume : il est mis en panneaux de même.") : null,
      this.numberRow("Épaisseur", this.thickness, this.ctx.unit(), (v) => {
        this.thickness = Math.abs(v);
        this.schedulePreview();
      }),
      this.selectRow("Assemblage", this.joint, JOINTS, (v) => {
        this.joint = v as PanelingFeature["joint"];
        this.render();
        this.schedulePreview();
      }),
      this.checkRow("Faces pareilles ensemble", this.twins, (v) => ((this.twins = v), this.render())),
      body ? el("div", { class: "flex gap-1.5" }, all, none) : null,
      this.info(this.joint === "miter" ? "En onglet : deux panneaux voisins se coupent à mi-angle, quel que soit l'angle." : "Bout à bout : la première face cliquée passe, les autres s'arrêtent contre elle."),
      this.info("Les panneaux sont pris dans le volume, vers l'intérieur ; les faces non choisies restent ouvertes. Une face cylindrique devient une planche cintrée, qui passe : sa voisine s'arrête contre elle si elle est prise après."),
    ];
  }

  /** The snapshots of the volumes, their chosen faces in orange: also what clicks hit. */
  private redraw(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material[]).forEach((m) => m.dispose());
      }
    }
    this.bodies.forEach(({ mesh, selected }, body) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      mesh.faceGroups.forEach((g, face) => geometry.addGroup(g.start, g.count, selected.includes(face) ? 1 : 0));
      const materials = [
        new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      ];
      const shown = new THREE.Mesh(geometry, materials);
      shown.renderOrder = 30;
      shown.userData.body = body;
      this.group.add(shown);
    });
  }

  protected override click(event: PointerEvent): void {
    if (!this.bodies.length) {
      const face = this.ctx.viewport.pickFace(event);
      if (face) void this.open([{ bodyId: face.bodyId, faceIndex: face.faceIndex }]);
      return;
    }
    const [hit] = this.ctx.viewport.intersect(event, this.group.children);
    const index = hit?.object.userData.body as number | undefined;
    const body = index === undefined ? undefined : this.bodies[index];
    if (!body || hit?.faceIndex === undefined || hit.faceIndex === null) {
      // Not on a volume taken: a face of another volume adds it (not these panels' preview).
      const pick = this.editing ? null : this.ctx.viewport.pickFace(event);
      if (!pick || this.bodies.some((b) => b.target === pick.bodyId) || [this.id, ...this.others().map((o) => o.id)].includes(featureOfBody(pick.bodyId))) return;
      this.add(pick.bodyId, [pick.faceIndex]);
      this.redraw();
      return;
    }
    const offset = hit.faceIndex * 3;
    const face = body.mesh.faceGroups.findIndex((g) => offset >= g.start && offset < g.start + g.count);
    if (face < 0) return;
    this.toggle(body, face);
    this.active = index!;
    this.prune();
    this.redraw();
    void this.describe(body);
  }

  /** Persistent references of the chosen faces (kernel side), in the order they were taken. */
  private async describe(body: Chosen): Promise<void> {
    const request = ++body.describing;
    try {
      const refs = await Promise.all(body.selected.map(async (face) => (await this.ctx.geometry.describe(body.target, [], face)).face as FaceRef));
      if (request !== body.describing) return;
      body.refs = refs;
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.bodies = [];
    this.redraw();
    this.ctx.viewport.scene.remove(this.group);
  }
}
