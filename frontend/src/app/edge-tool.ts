/**
 * Fillet / chamfer tool: the user clicks edges (click again to deselect),
 * sets the radius or distance, and sees the kernel result live. Edges are
 * picked on a snapshot of the body *before* the operation, so the preview
 * never changes what can be selected. A fillet can have a variable radius
 * (start → end of each edge), a chamfer two distances (the face, the edge).
 */
import * as THREE from "three";
import { uniqueId, uniqueName } from "../document/operations";
import type { ChamferFeature, EdgeRef, FilletFeature } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import { el } from "../ui/dom";
import { edgeMidpoint } from "../viewport/edge-geometry";
import { PanelTool, type ToolContext } from "./panel-tool";

type EdgeFeature = FilletFeature | ChamferFeature;

const COLORS = { base: 0x64748b, hover: 0x0ea5e9, selected: 0xf59e0b };

/** Midpoint (by length) of each B-rep edge of a body mesh. */
function edgeMidpoints(mesh: BodyMesh): THREE.Vector3[] {
  return mesh.edgeGroups.map((_, i) => edgeMidpoint(mesh, i));
}

export class EdgeTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private value: number;
  /** The radius at the end of the edges (variable fillet), or the distance on the other face (chamfer); null: constant. */
  private second: number | null;
  private swap: boolean;
  private target: string | null = null;
  private selected: number[] = [];
  private refs: EdgeRef[] = [];
  private meshes = new Map<string, BodyMesh>();
  private group = new THREE.Group();
  private hovered: { body: string; edge: number } | null = null;
  private describing = 0;

  constructor(
    ctx: ToolContext,
    private readonly kind: "fillet" | "chamfer",
    editing: EdgeFeature | null,
  ) {
    super(ctx, kind === "fillet" ? "Congé" : "Chanfrein", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, kind === "fillet" ? "f" : "c");
    this.name = editing?.name ?? uniqueName(doc, kind === "fillet" ? "Congé" : "Chanfrein");
    this.value = editing ? (editing.type === "fillet" ? editing.radius : editing.distance) : kind === "fillet" ? 3 : 1;
    this.second = (editing?.type === "fillet" ? editing.radiusEnd : editing?.type === "chamfer" ? editing.distance2 : undefined) ?? null;
    this.swap = editing?.type === "chamfer" && editing.swap === true;
    ctx.viewport.scene.add(this.group);
  }

  /** Opens the tool, with edges already picked in the model when there are some. */
  async open(preselected: { bodyId: string; edgeIndex: number }[] = []): Promise<void> {
    const editing = this.editing as EdgeFeature | null;
    if (editing) {
      // The edited operation consumes its target: fetch the body as it was before it.
      this.target = editing.target;
      this.refs = editing.edges;
      try {
        const mesh = await this.ctx.geometry.mesh(editing.target);
        this.meshes.set(editing.target, mesh);
        const mids = edgeMidpoints(mesh);
        this.selected = editing.edges.flatMap((ref) => {
          const p = new THREE.Vector3(...ref.mid);
          let best = -1;
          let bestDistance = Infinity;
          mids.forEach((m, i) => {
            const d = m.distanceTo(p);
            if (d < bestDistance) [best, bestDistance] = [i, d];
          });
          return best >= 0 && bestDistance < 1 ? [best] : [];
        });
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    } else {
      for (const body of this.ctx.bodies()) {
        const mesh = this.ctx.viewport.bodyMesh(body.id);
        if (mesh) this.meshes.set(body.id, mesh);
      }
    }
    const [first] = preselected;
    if (!editing && first) {
      this.target = first.bodyId;
      this.selected = preselected.filter((e) => e.bodyId === first.bodyId).map((e) => e.edgeIndex);
    }
    this.redraw();
    this.start();
    if (this.selected.length && !editing) void this.describe();
  }

  protected feature(): EdgeFeature | string {
    if (!this.target || this.refs.length === 0) {
      return `Cliquez les arêtes ${this.kind === "fillet" ? "à arrondir" : "à chanfreiner"} (cliquez à nouveau pour retirer).`;
    }
    const base = { id: this.id, name: this.name, target: this.target, edges: this.refs };
    const second = this.second ?? undefined;
    return this.kind === "fillet"
      ? { ...base, type: "fillet", radius: this.value, ...(second !== undefined ? { radiusEnd: second } : {}) }
      : { ...base, type: "chamfer", distance: this.value, ...(second !== undefined ? { distance2: second, ...(this.swap ? { swap: true } : {}) } : {}) };
  }

  protected rows(): (HTMLElement | null)[] {
    const fillet = this.kind === "fillet";
    const twoValues = this.second !== null;
    const [onFace, onEdge] = this.swap ? ["Sur le chant", "Sur la face"] : ["Sur la face", "Sur le chant"];
    const label = fillet ? (twoValues ? "Rayon début" : "Rayon") : twoValues ? onFace : "Distance";
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const swap = el("button", { type: "button", class: "h-8 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, fillet ? "⇄ Inverser début et fin" : "⇄ Inverser les faces");
    swap.addEventListener("click", () => {
      if (fillet && this.second !== null) [this.value, this.second] = [this.second, this.value];
      else this.swap = !this.swap;
      changed();
    });
    return [
      this.info(this.target ? `${this.selected.length} arête(s) sélectionnée(s)` : "Aucune arête sélectionnée"),
      this.numberRow(label, this.value, this.ctx.unit(), (v) => {
        this.value = v;
        this.schedulePreview();
      }),
      this.checkRow(fillet ? "Rayon variable" : "Deux distances", twoValues, (on) => {
        this.second = on ? this.value * 2 : null;
        changed();
      }),
      twoValues
        ? this.numberRow(fillet ? "Rayon fin" : onEdge, this.second as number, this.ctx.unit(), (v) => {
            this.second = v;
            this.schedulePreview();
          })
        : null,
      twoValues ? swap : null,
      twoValues
        ? this.info(fillet ? "Le rayon passe de l'un à l'autre le long de chaque arête, de son début à sa fin." : `La première distance se prend sur ${this.swap ? "la plus petite" : "la plus grande"} des deux faces de chaque arête (${this.swap ? "le chant" : "la face"} d'une planche), la seconde sur l'autre.`)
        : null,
    ];
  }

  // ---- picking ----------------------------------------------------------------

  /** Edge lines of the snapshot bodies, coloured by state; also the pick targets. */
  private redraw(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const [bodyId, mesh] of this.meshes) {
      mesh.edgeGroups.forEach(({ start, count }, index) => {
        const selected = bodyId === this.target && this.selected.includes(index);
        const hovered = this.hovered?.body === bodyId && this.hovered.edge === index;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(mesh.edges.slice(start * 3, (start + count) * 3), 3));
        const color = selected ? COLORS.selected : hovered ? COLORS.hover : COLORS.base;
        const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: selected || hovered ? 1 : 0.35 });
        const lines = new THREE.LineSegments(geometry, material);
        lines.renderOrder = 30;
        lines.userData = { bodyId, edge: index };
        this.group.add(lines);
      });
    }
  }

  private hit(event: PointerEvent): { body: string; edge: number } | null {
    const [hit] = this.ctx.viewport.intersect(event, this.group.children, 7);
    if (!hit) return null;
    const { bodyId, edge } = hit.object.userData as { bodyId: string; edge: number };
    return { body: bodyId, edge };
  }

  override move(event: PointerEvent): void {
    const hit = this.hit(event);
    if (hit?.body !== this.hovered?.body || hit?.edge !== this.hovered?.edge) {
      this.hovered = hit;
      this.ctx.viewport.renderer.domElement.style.cursor = hit ? "pointer" : "";
      this.redraw();
    }
  }

  protected override click(event: PointerEvent): void {
    const hit = this.hit(event);
    if (!hit) return;
    if (hit.body !== this.target) {
      if (this.target && this.selected.length) this.ctx.notify("Les arêtes d'une même opération doivent appartenir au même corps.", "info");
      this.target = hit.body;
      this.selected = [hit.edge];
    } else if (this.selected.includes(hit.edge)) {
      this.selected = this.selected.filter((e) => e !== hit.edge);
    } else {
      this.selected = [...this.selected, hit.edge];
    }
    this.redraw();
    void this.describe();
  }

  /** Turns the selected edge indices into persistent references (kernel side). */
  private async describe(): Promise<void> {
    const request = ++this.describing;
    if (!this.target || this.selected.length === 0) {
      this.refs = [];
      this.render();
      this.schedulePreview();
      return;
    }
    try {
      const { edges } = await this.ctx.geometry.describe(this.target, this.selected);
      if (request !== this.describing) return;
      this.refs = edges;
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.hovered = null;
    this.meshes.clear();
    this.redraw();
    this.ctx.viewport.scene.remove(this.group);
    this.ctx.viewport.renderer.domElement.style.cursor = "";
  }
}
