/**
 * Outils Coque et Lissage (comme Fusion).
 * - Coque : cliquez les faces à laisser ouvertes (recliquez pour retirer), réglez l'épaisseur des parois ; les faces
 *   sont prises sur une copie du corps d'avant l'opération, l'aperçu ne change pas ce qu'on peut cliquer.
 * - Lissage : cochez les esquisses à relier (dans l'ordre de l'historique), droit ou courbe entre elles.
 */
import * as THREE from "three";
import { uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, FaceRef, LoftFeature, ShellFeature, SketchFeature } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import { operationChoices } from "../ui/feature-meta";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

export class ShellTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private thickness: number;
  private target: string | null = null;
  private selected: number[] = [];
  private refs: FaceRef[] = [];
  private mesh: BodyMesh | null = null;
  private group = new THREE.Group();
  private describing = 0;

  constructor(ctx: ToolContext, editing: ShellFeature | null) {
    super(ctx, "Coque", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sh");
    this.name = editing?.name ?? uniqueName(doc, "Coque");
    this.thickness = editing?.thickness ?? 3;
    ctx.viewport.scene.add(this.group);
  }

  /** Opens on the body being edited, or on the face picked in the model, or waits for a click on a body. */
  async open(preselected: { bodyId: string; faceIndex: number }[] = []): Promise<void> {
    const editing = this.editing as ShellFeature | null;
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
      this.selected = this.mesh ? editing.faces.flatMap((ref) => this.faceNear(ref.center)) : [];
    } else if (first) {
      this.selected = preselected.filter((f) => f.bodyId === first.bodyId).map((f) => f.faceIndex);
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
    let bestDistance = Infinity;
    mesh.faceGroups.forEach((g, face) => {
      for (let k = g.start; k < g.start + g.count; k++) {
        const i = mesh.indices[k]! * 3;
        const d = Math.hypot(mesh.vertices[i]! - point[0], mesh.vertices[i + 1]! - point[1], mesh.vertices[i + 2]! - point[2]);
        if (d < bestDistance) [best, bestDistance] = [face, d];
      }
    });
    return best >= 0 ? [best] : [];
  }

  protected feature(): ShellFeature | string {
    if (!this.target) return "Cliquez une face du corps à creuser (elle restera ouverte).";
    return { id: this.id, type: "shell", name: this.name, target: this.target, faces: this.refs, thickness: this.thickness };
  }

  protected rows(): (HTMLElement | null)[] {
    return [
      this.info(this.target ? `${this.selected.length} face(s) ouverte(s) — cliquez d'autres faces, recliquez pour retirer` : "Cliquez une face du corps : elle restera ouverte."),
      this.numberRow("Épaisseur", this.thickness, this.ctx.unit(), (v) => {
        this.thickness = Math.abs(v);
        this.schedulePreview();
      }),
      this.info("Sans face ouverte, le corps devient creux et fermé."),
    ];
  }

  /** The snapshot body, its open faces in orange: also what clicks hit. */
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
      // No body yet: the face clicked on the model chooses it.
      const face = this.ctx.viewport.pickFace(event);
      if (!face) return;
      void this.open([{ bodyId: face.bodyId, faceIndex: face.faceIndex }]);
      return;
    }
    const [hit] = this.ctx.viewport.intersect(event, this.group.children);
    if (hit?.faceIndex === undefined || hit.faceIndex === null) return;
    const offset = hit.faceIndex * 3;
    const face = this.mesh.faceGroups.findIndex((g) => offset >= g.start && offset < g.start + g.count);
    if (face < 0) return;
    this.selected = this.selected.includes(face) ? this.selected.filter((f) => f !== face) : [...this.selected, face];
    this.redraw();
    void this.describe();
  }

  /** Persistent references of the open faces (kernel side). */
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

const OPERATIONS = operationChoices("new", "join", "cut");

export class LoftTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private profiles: string[];
  private ruled: boolean;
  private operation: BooleanOperation;
  private target: string | undefined;

  constructor(ctx: ToolContext, editing: LoftFeature | null, selected: string[] = []) {
    super(ctx, "Lissage", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "lo");
    this.name = editing?.name ?? uniqueName(doc, "Lissage");
    const closed = new Set(this.closed().map((s) => s.id));
    this.profiles = editing?.profiles ?? selected.filter((id) => closed.has(id));
    this.ruled = editing?.ruled ?? false;
    this.operation = editing?.operation ?? "new";
    this.target = editing?.target;
  }

  /** Sketches with a closed profile, in history order. */
  private closed(): SketchFeature[] {
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && this.ctx.status(f.id)?.sketch?.closed === true);
  }

  protected feature(): LoftFeature | string {
    if (this.profiles.length < 2) return "Cochez au moins deux esquisses fermées, dans des plans séparés.";
    if (this.operation !== "new" && !this.target) return "Choisissez le corps cible.";
    const order = this.closed().map((s) => s.id);
    return {
      id: this.id,
      type: "loft",
      name: this.name,
      profiles: [...this.profiles].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      ...(this.ruled ? { ruled: true } : {}),
      operation: this.operation,
      ...(this.operation === "new" ? {} : { target: this.target }),
    };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le lissage est impossible.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const list = this.closed().map((s) => {
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: this.profiles.includes(s.id) });
      box.addEventListener("change", () => {
        this.profiles = box.checked ? [...this.profiles, s.id] : this.profiles.filter((p) => p !== s.id);
        changed();
      });
      return el("label", { class: "flex items-center gap-2" }, box, s.name);
    });
    return [
      this.info("Esquisses à relier (dans l'ordre de l'historique) :"),
      list.length ? el("div", { class: "max-h-40 space-y-1 overflow-y-auto" }, ...list) : this.info("Aucune esquisse fermée."),
      this.checkRow("Droit entre les profils (sinon courbe)", this.ruled, (v) => {
        this.ruled = v;
        changed();
      }),
      this.selectRow("Opération", this.operation, OPERATIONS, (v) => {
        this.operation = v as BooleanOperation;
        if (this.operation !== "new") this.target ??= this.ctx.bodies().at(-1)?.id;
        changed();
      }),
      this.operation === "new"
        ? null
        : this.selectRow("Cible", this.target ?? "", this.ctx.bodies().filter((b) => b.id !== this.id).map((b): [string, string] => [b.id, b.name]), (v) => {
            this.target = v;
            changed();
          }),
    ];
  }
}
