/**
 * Outils Coque, Vider un corps et Lissage (comme Fusion).
 * - Coque : cliquez les faces à laisser ouvertes (recliquez pour retirer), réglez l'épaisseur des parois ; les faces
 *   sont prises sur une copie du corps d'avant l'opération, l'aperçu ne change pas ce qu'on peut cliquer.
 * - Vider un corps : la même opération, prise par le corps — un clic le vide, quelle que soit sa forme, sans rien
 *   ouvrir ; on saisit l'épaisseur de ses côtés et on choisit s'ils restent joints (un seul corps creux) ou si chacun
 *   devient un corps (un panneau par côté plat, en onglet ou bout à bout ; la paroi d'un côté courbe). La face par
 *   laquelle on prend le corps est son devant : « Ouvertures » l'ouvre avec celle d'en face — un caisson, ses côtés
 *   autour, tous de la même épaisseur —, seule, ou laisse le corps fermé. Une face cliquée ensuite s'ouvre ou se
 *   referme. Un côté d'un corps déjà vidé ne se vide pas à son tour : son étape de l'historique le reprend.
 * - Lissage : cochez les esquisses à relier (dans l'ordre de l'historique), droit ou courbe entre elles.
 */
import * as THREE from "three";
import { bodyLabel, bodyOrigin, findFeature, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type BooleanOperation, type FaceRef, type LoftFeature, type ShellFeature, type SketchFeature } from "../document/types";
import { formatLength } from "../measurements/units";
import type { BodyMesh } from "../geometry/protocol";
import { operationChoices } from "../ui/feature-meta";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

const SIDES: [NonNullable<ShellFeature["sides"]>, string][] = [["joined", "Joints (un seul corps creux)"], ["separate", "Chaque côté seul (un corps par côté)"]];
const JOINTS: [NonNullable<ShellFeature["joint"]>, string][] = [["miter", "En onglet (tout angle)"], ["butt", "Bout à bout"]];
/** What is left open of a body taken by one of its faces (its front): it and the one behind, it alone, nothing. */
type Opening = "through" | "face" | "none";
const OPENINGS: [Opening, string][] = [["through", "Devant et derrière (caisson)"], ["face", "Le devant seul"], ["none", "Aucune (corps fermé)"]];
/** Kept for the session: how the last body was emptied. */
const LAST: { thickness: number; sides: NonNullable<ShellFeature["sides"]>; joint: NonNullable<ShellFeature["joint"]>; opening: Opening } = { thickness: 18, sides: "separate", joint: "butt", opening: "through" };

export class ShellTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private thickness: number;
  /** « Vider un corps »: the body is taken whole, and its sides are joined or apart. */
  private readonly hollow: boolean;
  private sides: NonNullable<ShellFeature["sides"]>;
  private joint: NonNullable<ShellFeature["joint"]>;
  /** « Vider un corps »: what is opened, and the face the body was taken by (its front). */
  private opening: Opening = LAST.opening;
  private front: number | null = null;
  private target: string | null = null;
  private selected: number[] = [];
  private refs: FaceRef[] = [];
  private mesh: BodyMesh | null = null;
  private group = new THREE.Group();
  private describing = 0;

  constructor(ctx: ToolContext, editing: ShellFeature | null, hollow = false) {
    // A body emptied says what its sides are: reopened, it is « Vider un corps » again.
    const emptying = editing ? editing.sides !== undefined : hollow;
    super(ctx, emptying ? "Vider un corps" : "Coque", editing);
    const doc = ctx.doc();
    this.hollow = emptying;
    this.id = editing?.id ?? uniqueId(doc, "sh");
    this.name = editing?.name ?? uniqueName(doc, emptying ? "Corps vidé" : "Coque");
    this.thickness = editing?.thickness ?? (emptying ? LAST.thickness : 3);
    this.sides = editing?.sides ?? LAST.sides;
    this.joint = editing?.joint ?? LAST.joint;
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
    } else if (first && this.hollow) {
      // A side of a body already emptied is not emptied in its turn.
      const made = this.sideOf(first.bodyId);
      if (made) {
        this.ctx.notify(`« ${bodyLabel(this.ctx.doc(), first.bodyId)} » est un côté de « ${made} », déjà vidé : pour l'ouvrir ou le régler, cliquez son étape dans l'Historique, puis « Modifier ».`, "info");
        this.target = this.mesh = null;
      } else if (first.faceIndex >= 0) {
        // Taken by a face: its front, opened as « Ouvertures » says.
        this.front = first.faceIndex;
        this.selected = this.opened();
        void this.describe();
      }
    } else if (first) {
      this.selected = preselected.filter((f) => f.bodyId === first.bodyId).map((f) => f.faceIndex);
      void this.describe();
    }
    this.redraw();
    this.start();
  }

  /** The emptied body this one is a side of, by its name; null for any other body. */
  private sideOf(bodyId: string): string | null {
    const doc = this.ctx.doc();
    const made = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
    return made?.type === "shell" && made.sides !== undefined ? made.name : null;
  }

  /** The outward normal of a flat face of the snapshot, and how far out it lies along it; null for a curved one. */
  private flat(face: number): { normal: THREE.Vector3; at: number } | null {
    const mesh = this.mesh;
    const group = mesh?.faceGroups[face];
    if (!mesh || !group) return null;
    let normal: THREE.Vector3 | null = null;
    let at = 0;
    for (let k = group.start; k < group.start + group.count; k++) {
      const i = mesh.indices[k]! * 3;
      const n = new THREE.Vector3(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!).normalize();
      if (!normal) [normal, at] = [n, n.x * mesh.vertices[i]! + n.y * mesh.vertices[i + 1]! + n.z * mesh.vertices[i + 2]!];
      else if (n.dot(normal) < 0.999) return null;
    }
    return normal ? { normal, at } : null;
  }

  /** The faces open for the front the body was taken by: it and the flat face behind it, it alone, or none. */
  private opened(): number[] {
    const front = this.front === null ? null : this.flat(this.front);
    if (this.front === null || !front || this.opening === "none") return [];
    if (this.opening === "face") return [this.front];
    // Behind it: the flat face turned the other way, the furthest one.
    let behind: { face: number; at: number } | null = null;
    this.mesh?.faceGroups.forEach((_, face) => {
      const other = face === this.front ? null : this.flat(face);
      if (other && other.normal.dot(front.normal) < -0.999 && (!behind || other.at > behind.at)) behind = { face, at: other.at };
    });
    return behind ? [this.front, (behind as { face: number }).face] : [this.front];
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
    if (!this.target) return this.hollow ? "Cliquez le corps à vider." : "Cliquez une face du corps à creuser (elle restera ouverte).";
    const shell: ShellFeature = { id: this.id, type: "shell", name: this.name, target: this.target, faces: this.refs, thickness: this.thickness };
    return this.hollow ? { ...shell, sides: this.sides, ...(this.sides === "separate" ? { joint: this.joint } : {}) } : shell;
  }

  /** « Vider un corps »: the thickness of its sides, and whether they are joined or each one a body. */
  private hollowRows(): (HTMLElement | null)[] {
    const changed = () => {
      Object.assign(LAST, { thickness: this.thickness, sides: this.sides, joint: this.joint, opening: this.opening });
      this.render();
      this.schedulePreview();
    };
    const open = this.selected.length;
    return [
      this.info(
        this.target
          ? open
            ? `${open} face(s) ouverte(s), sans côté : il reste les côtés autour, tous de la même épaisseur. Cliquez une face pour l'ouvrir ou la refermer.`
            : this.front === null && !this.editing && this.opening !== "none"
              ? "Cliquez la face de devant du corps : elle s'ouvre comme « Ouvertures » le dit."
              : "Le corps est vidé, tous ses côtés gardés. Cliquez une face pour l'ouvrir (elle n'aura pas de côté)."
          : "Cliquez le corps à vider par sa face de devant : sa base peut être un triangle, un carré, un cercle, ses côtés de biais.",
      ),
      // What the face it is taken by opens: with the one behind it, a caisson — the sides around, front and back open.
      this.editing
        ? null
        : this.selectRow("Ouvertures", this.opening, OPENINGS, (v) => {
            this.opening = v as Opening;
            if (this.front !== null) {
              this.selected = this.opened();
              this.redraw();
              void this.describe();
            }
            changed();
          }),
      this.numberRow("Épaisseur des côtés", this.thickness, this.ctx.unit(), (v) => {
        this.thickness = Math.abs(v);
        changed();
      }),
      this.selectRow("Côtés", this.sides, SIDES, (v) => {
        this.sides = v as typeof this.sides;
        changed();
      }),
      this.sides === "separate"
        ? this.selectRow("Assemblage", this.joint, JOINTS, (v) => {
            this.joint = v as typeof this.joint;
            changed();
          })
        : null,
      this.info(
        this.sides === "separate"
          ? `Chaque côté plat devient un panneau de ${formatLength(this.thickness, this.ctx.unit())}, pris vers l'intérieur ; un côté courbe (le tour d'un cylindre) garde sa paroi d'un seul corps.`
          : "Les côtés restent d'un seul corps, creux ; sans face ouverte, il est fermé.",
      ),
    ];
  }

  protected rows(): (HTMLElement | null)[] {
    if (this.hollow) return this.hollowRows();
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
    // « Vider un corps », the body chosen without a face (selected beforehand): the first face clicked is its front.
    if (this.hollow && !this.editing && this.front === null && !this.selected.length && this.opening !== "none") {
      this.front = face;
      this.selected = this.opened();
    } else this.selected = this.selected.includes(face) ? this.selected.filter((f) => f !== face) : [...this.selected, face];
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
