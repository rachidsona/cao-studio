/**
 * « Panneaux sur faces » (groupe Modifier) : cliquez les faces planes d'un volume qui deviennent des panneaux — un clic
 * prend aussi les faces pareilles (les côtés d'un seau à pans), recliquez pour les retirer — et réglez l'épaisseur et
 * l'assemblage : en onglet, à tout angle, ou bout à bout (la première face cliquée passe). Les faces non choisies
 * restent ouvertes (features/paneling.ts). OK ajoute l'opération à l'historique ; elle se rouvre pour la reprendre.
 * Les faces se prennent sur le volume d'avant l'opération, comme pour la Coque.
 */
import * as THREE from "three";
import { uniqueId, uniqueName } from "../document/operations";
import type { FaceRef, PanelingFeature } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import { el } from "../ui/dom";
import { faceMeasure, faceTwins } from "./face-twins";
import { PanelTool, type ToolContext } from "./panel-tool";

const JOINTS: [PanelingFeature["joint"], string][] = [["miter", "En onglet (tout angle)"], ["butt", "Bout à bout"]];
const BUTTON = "h-8 flex-1 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export class PanelingTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private thickness: number;
  private joint: PanelingFeature["joint"];
  /** A click takes the faces like the one clicked too. */
  private twins = true;
  private target: string | null = null;
  private selected: number[] = [];
  private refs: FaceRef[] = [];
  private mesh: BodyMesh | null = null;
  private readonly group = new THREE.Group();
  private describing = 0;

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
    const first = preselected[0];
    this.target = editing?.target ?? first?.bodyId ?? null;
    if (this.target) {
      try {
        this.mesh = editing ? await this.ctx.geometry.mesh(this.target) : (this.ctx.viewport.bodyMesh(this.target) ?? null);
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
    if (editing) {
      this.refs = editing.faces;
      this.selected = editing.faces.flatMap((ref) => this.faceNear(ref.center));
    } else if (first) {
      for (const f of preselected) if (f.bodyId === first.bodyId) this.toggle(f.faceIndex, false);
      void this.describe();
    }
    this.redraw();
    this.start();
  }

  /** The face of the snapshot whose triangles pass nearest a point (to find saved faces again). */
  private faceNear(point: [number, number, number]): number[] {
    const mesh = this.mesh;
    if (!mesh) return [];
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

  /** Takes a face (and those like it), or gives it back when it is taken. */
  private toggle(face: number, twins = this.twins): void {
    const faces = twins && this.mesh ? faceTwins(this.mesh, face) : [face];
    this.selected = this.selected.includes(face) ? this.selected.filter((f) => !faces.includes(f)) : [...this.selected, ...faces.filter((f) => !this.selected.includes(f))];
  }

  protected feature(): PanelingFeature | string {
    if (!this.target) return "Cliquez une face du volume à mettre en panneaux.";
    if (!this.refs.length) return "Cliquez les faces qui deviennent des panneaux.";
    return { id: this.id, type: "paneling", name: this.name, target: this.target, faces: this.refs, thickness: this.thickness, joint: this.joint };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Les panneaux ne se font pas.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const all = el("button", { type: "button", class: BUTTON }, "Toutes les faces planes");
    all.addEventListener("click", () => {
      const mesh = this.mesh;
      if (!mesh) return;
      this.selected = mesh.faceGroups.flatMap((_, f) => (faceMeasure(mesh, f).flat ? [f] : []));
      this.redraw();
      void this.describe();
    });
    const none = el("button", { type: "button", class: BUTTON }, "Aucune");
    none.addEventListener("click", () => {
      this.selected = [];
      this.redraw();
      void this.describe();
    });
    return [
      this.info(this.target ? `${this.selected.length} face(s) en panneaux : cliquez-en d'autres, recliquez pour retirer.` : "Cliquez une face du volume : elle devient un panneau."),
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
      this.target ? el("div", { class: "flex gap-1.5" }, all, none) : null,
      this.info(this.joint === "miter" ? "En onglet : deux panneaux voisins se coupent à mi-angle, quel que soit l'angle." : "Bout à bout : la première face cliquée passe, les autres s'arrêtent contre elle."),
      this.info("Les panneaux sont pris dans le volume, vers l'intérieur ; les faces non choisies restent ouvertes."),
    ];
  }

  /** The snapshot body, its chosen faces in orange: also what clicks hit. */
  private redraw(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material[]).forEach((m) => m.dispose());
      }
    }
    const mesh = this.mesh;
    if (!mesh) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    mesh.faceGroups.forEach((g, face) => geometry.addGroup(g.start, g.count, this.selected.includes(face) ? 1 : 0));
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    ];
    const shown = new THREE.Mesh(geometry, materials);
    shown.renderOrder = 30;
    this.group.add(shown);
  }

  protected override click(event: PointerEvent): void {
    if (!this.mesh) {
      const face = this.ctx.viewport.pickFace(event);
      if (face) void this.open([{ bodyId: face.bodyId, faceIndex: face.faceIndex }]);
      return;
    }
    const [hit] = this.ctx.viewport.intersect(event, this.group.children);
    if (hit?.faceIndex === undefined || hit.faceIndex === null) return;
    const offset = hit.faceIndex * 3;
    const face = this.mesh.faceGroups.findIndex((g) => offset >= g.start && offset < g.start + g.count);
    if (face < 0) return;
    if (!faceMeasure(this.mesh, face).flat) return this.ctx.notify("Seules les faces planes deviennent des panneaux.", "info");
    this.toggle(face);
    this.redraw();
    void this.describe();
  }

  /** Persistent references of the chosen faces (kernel side), in the order they were taken. */
  private async describe(): Promise<void> {
    const request = ++this.describing;
    const target = this.target;
    if (!target) return;
    try {
      const refs = await Promise.all(this.selected.map(async (face) => (await this.ctx.geometry.describe(target, [], face)).face as FaceRef));
      if (request !== this.describing) return;
      this.refs = refs;
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.mesh = null;
    this.redraw();
    this.ctx.viewport.scene.remove(this.group);
  }
}
