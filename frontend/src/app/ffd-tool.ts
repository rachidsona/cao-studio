/**
 * « Déformer (FFD 3×3×3) » (groupe Modifier, comme la FFD de C. Phillips dans JHS PowerBar) : une grille de
 * 3 × 3 × 3 points orange se tend sur la boîte du corps choisi (sélectionné, ou cliqué). Un clic sur un point le
 * choisit (Maj + clic en ajoute), « Choisir » en prend une rangée ; les trois flèches X, Y, Z tirent tout le côté de ce
 * point, pour agrandir ou réduire la pièce en gardant ses faces droites, ou le point seul si on décoche « Tout le côté
 * suit » (leurs champs donnent le déplacement au millimètre) ; le corps suit en douceur (features/ffd.ts). Comme dans
 * JHS, Maj + glisser trace un rectangle qui prend les points dedans, et « Échelle » rapproche les points choisis de leur
 * centre (ou les écarte) : le dessus réduit de moitié fait d'un cylindre un obus. OK ajoute la déformation à
 * l'historique ; elle se rouvre pour reprendre la grille.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import type { ModifierFeature, Vec3 } from "../document/types";
import { latticeIndex, latticePoints, movedSides, type Box } from "../features/ffd";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import { ArrowHandle } from "../viewport/arrow-handle";
import { PanelTool, type ToolContext } from "./panel-tool";

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const PICK_PX = 14;
const ROWS: [string, string][] = [
  ["", "— choisir —"],
  ["top", "Les 9 du dessus"],
  ["bottom", "Les 9 du dessous"],
  ["middle", "Les 9 du milieu (hauteur)"],
  ["top-center", "Le milieu du dessus (dôme)"],
  ["center", "Le point du centre (intérieur)"],
  ["all", "Les 27"],
];

export class FfdTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private box: Box | null = null;
  private offsets: number[];
  private chosen = new Set<number>();
  private readonly group = new THREE.Group();
  private readonly arrows: ArrowHandle[];
  /** The arrow being dragged and how far it had moved the points. */
  private drag: { axis: number; applied: number } | null = null;
  /** Maj + drag: the rectangle that takes the points inside it (screen coordinates), drawn over the view. */
  private window: { x: number; y: number; box: HTMLElement } | null = null;
  /** Scale (%) of the chosen points about their centre. */
  private scale = 50;
  /** The arrows pull the whole side of the chosen points, not the points alone. */
  private together = true;

  constructor(ctx: ToolContext, editing: ModifierFeature | null, bodies: string[] = []) {
    super(ctx, "Déformer (FFD 3×3×3)", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Déformation");
    this.offsets = editing?.lattice ? [...editing.lattice] : new Array(81).fill(0);
    this.group.renderOrder = 30;
    ctx.viewport.scene.add(this.group);
    this.arrows = AXES.map(() => new ArrowHandle(ctx.viewport, () => this.panel.querySelector<HTMLInputElement>("input")?.focus()));
    if (editing) {
      this.target = editing.target;
      this.box = editing.frame ?? null;
    } else if (bodies[0]) this.setTarget(bodies[0]);
    this.draw();
  }

  private setTarget(id: string): void {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    if (!b) return;
    this.target = id;
    this.box = [[...b[0]] as Vec3, [...b[1]] as Vec3];
    this.offsets = new Array(81).fill(0);
    this.chosen.clear();
  }

  private points(): Vec3[] {
    return this.box ? latticePoints(this.box, this.offsets) : [];
  }

  /** The lattice (lines between neighbours, points: the chosen ones red) and the arrows on the chosen points. */
  private draw(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Points || child instanceof THREE.LineSegments) child.geometry.dispose();
    }
    const pts = this.points();
    if (!pts.length) return this.arrows.forEach((a) => (a.object.visible = false));
    const lines: number[] = [];
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++) {
          const p = pts[latticeIndex(i, j, k)]!;
          if (i < 2) lines.push(...p, ...pts[latticeIndex(i + 1, j, k)]!);
          if (j < 2) lines.push(...p, ...pts[latticeIndex(i, j + 1, k)]!);
          if (k < 2) lines.push(...p, ...pts[latticeIndex(i, j, k + 1)]!);
        }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    const grid = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.6, depthTest: false }));
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute(pts.flatMap((_, n) => (this.chosen.has(n) ? [0.86, 0.15, 0.15] : [0.98, 0.45, 0.09])), 3));
    const dots = new THREE.Points(pointGeometry, new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, vertexColors: true, depthTest: false }));
    for (const o of [grid, dots]) o.renderOrder = 30;
    this.group.add(grid, dots);
    if (!this.chosen.size) for (const a of this.arrows) a.object.visible = false;
    if (!this.chosen.size || this.drag) return;
    const centre = [0, 1, 2].map((a) => [...this.chosen].reduce((s, n) => s + pts[n]![a]!, 0) / this.chosen.size) as Vec3;
    this.arrows.forEach((arrow, a) => arrow.place(centre, AXES[a]!, 0, "XYZ"[a]!));
  }

  /** Where each control point is on the screen. */
  private screenPoints(): [number, number][] {
    const rect = this.ctx.viewport.renderer.domElement.getBoundingClientRect();
    return this.points().map((p) => {
      const v = new THREE.Vector3(...p).project(this.ctx.viewport.camera);
      return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
    });
  }

  /** The control point under the pointer (within a few pixels), or -1. */
  private pointAt(event: PointerEvent): number {
    let best = -1;
    let bestDistance = PICK_PX;
    this.screenPoints().forEach(([x, y], n) => {
      const d = Math.hypot(x - event.clientX, y - event.clientY);
      if (d < bestDistance) [best, bestDistance] = [n, d];
    });
    return best;
  }

  /** The chosen points brought towards their centre (or away from it), by `scale` %. */
  private applyScale(): void {
    const pts = this.points();
    const chosen = [...this.chosen];
    if (!chosen.length) return;
    const centre = [0, 1, 2].map((a) => chosen.reduce((s, n) => s + pts[n]![a]!, 0) / chosen.length);
    const k = this.scale / 100 - 1;
    for (const n of chosen) for (const a of [0, 1, 2]) this.offsets[n * 3 + a] = this.offsets[n * 3 + a]! + k * (pts[n]![a]! - centre[a]!);
    this.draw();
    this.render();
    this.schedulePreview();
  }

  protected feature(): ModifierFeature | string {
    if (!this.target || !this.box) return "Cliquez le corps à déformer.";
    return { id: this.id, type: "modifier", name: this.name, target: this.target, kind: "ffd", amount: 0, lattice: this.offsets.map((v) => Number(v.toFixed(3))), frame: this.box };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le corps ne se déforme pas ainsi.") : null;
  }

  override down(event: PointerEvent): boolean {
    const axis = this.chosen.size ? this.arrows.findIndex((a) => a.dragStart(event)) : -1;
    if (axis < 0 && event.shiftKey && this.box) {
      const box = el("div", { class: "pointer-events-none fixed z-40 border border-dashed border-orange-500 bg-orange-500/10" });
      document.body.append(box);
      this.window = { x: event.clientX, y: event.clientY, box };
      this.sizeWindow(event);
      return true;
    }
    if (axis < 0) return false;
    this.drag = { axis, applied: 0 };
    return true;
  }

  private sizeWindow(event: PointerEvent): void {
    if (!this.window) return;
    const { x, y, box } = this.window;
    Object.assign(box.style, { left: `${Math.min(x, event.clientX)}px`, top: `${Math.min(y, event.clientY)}px`, width: `${Math.abs(event.clientX - x)}px`, height: `${Math.abs(event.clientY - y)}px` });
  }

  /** The chosen points moved along an axis, with the whole of their side when it follows. */
  private push(axis: number, delta: number): void {
    if (this.together) this.offsets = movedSides(this.offsets, this.chosen, axis, delta);
    else for (const n of this.chosen) this.offsets[n * 3 + axis] = this.offsets[n * 3 + axis]! + delta;
  }

  override move(event: PointerEvent): void {
    if (this.window) return this.sizeWindow(event);
    if (!this.drag) return;
    const value = this.arrows[this.drag.axis]!.dragMove(event);
    if (value === null) return;
    this.push(this.drag.axis, value - this.drag.applied);
    this.drag.applied = value;
    this.draw();
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.window) {
      const { x, y, box } = this.window;
      box.remove();
      this.window = null;
      if (!isClick) {
        const [x0, x1, y0, y1] = [Math.min(x, event.clientX), Math.max(x, event.clientX), Math.min(y, event.clientY), Math.max(y, event.clientY)];
        this.screenPoints().forEach(([px, py], n) => {
          if (px >= x0 && px <= x1 && py >= y0 && py <= y1) this.chosen.add(n);
        });
        this.draw();
        this.render();
        return true;
      }
    }
    if (this.drag) {
      for (const a of this.arrows) a.dragEnd();
      this.drag = null;
      this.draw();
      this.render();
      this.schedulePreview();
      return true;
    }
    return super.up(event, isClick);
  }

  /** A click on a point chooses it (Maj: adds or removes it); elsewhere on a body, that body is the one deformed. */
  protected override click(event: PointerEvent): void {
    const n = this.pointAt(event);
    if (n >= 0) {
      if (!event.shiftKey) this.chosen = new Set([n]);
      else if (this.chosen.has(n)) this.chosen.delete(n);
      else this.chosen.add(n);
    } else {
      const face = this.ctx.viewport.pickFace(event);
      if (!face || face.bodyId === this.id || face.bodyId === this.target) return;
      this.setTarget(face.bodyId);
      this.schedulePreview();
    }
    this.draw();
    this.render();
  }

  private choose(row: string): void {
    const all = Array.from({ length: 27 }, (_, n) => n);
    const k = (n: number) => Math.floor(n / 9);
    const pick: Record<string, number[]> = {
      top: all.filter((n) => k(n) === 2),
      bottom: all.filter((n) => k(n) === 0),
      middle: all.filter((n) => k(n) === 1),
      "top-center": [latticeIndex(1, 1, 2)],
      center: [latticeIndex(1, 1, 1)],
      all,
    };
    this.chosen = new Set(pick[row] ?? []);
    this.draw();
    this.render();
  }

  protected override dispose(): void {
    this.window?.box.remove();
    for (const a of this.arrows) a.dispose();
    this.ctx.viewport.scene.remove(this.group);
  }

  /** « Échelle » of the chosen points about their centre, and the button that applies it. */
  private scaleRow(): HTMLElement {
    const apply = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, `Appliquer l'échelle (${this.scale} %)`);
    apply.addEventListener("click", () => this.applyScale());
    return el("div", { class: "space-y-1" }, this.numberRow("Échelle %", this.scale, "plain", (v) => ((this.scale = v), this.render())), apply);
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const first = [...this.chosen][0];
    const field = (axis: number) =>
      this.numberRow(`Décalage ${"XYZ"[axis]}`, first === undefined ? 0 : this.offsets[first * 3 + axis]!, unit, (v) => {
        if (first !== undefined) this.push(axis, v - this.offsets[first * 3 + axis]!);
        this.draw();
        this.schedulePreview();
      }, true);
    const moved = this.offsets.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    return [
      this.info(this.target ? `Corps : « ${bodyLabel(this.ctx.doc(), this.target)} ».` : "Cliquez le corps à déformer."),
      this.target ? this.selectRow("Choisir", "", ROWS, (v) => this.choose(v)) : null,
      this.target ? this.checkRow("Tout le côté suit (la face reste droite)", this.together, (v) => ((this.together = v), this.render())) : null,
      ...(this.chosen.size ? [0, 1, 2].map(field) : []),
      this.chosen.size > 1 ? this.scaleRow() : null,
      this.info(
        this.chosen.size
          ? `${this.chosen.size} point${this.chosen.size > 1 ? "s" : ""} choisi${this.chosen.size > 1 ? "s" : ""} : tirez une flèche, ou tapez le décalage${this.together ? " : tout le côté suit, pour agrandir ou réduire la pièce" : ""}. Maj + clic ajoute un point.`
          : this.target
            ? "Cliquez un point orange de la grille (Maj + clic pour en ajouter, Maj + glisser : tous ceux d'un rectangle)."
            : "",
      ),
      moved ? this.info(`Plus grand déplacement : ${formatLength(moved, unit)}. Le corps est refait en facettes fines.`) : null,
    ];
  }
}
