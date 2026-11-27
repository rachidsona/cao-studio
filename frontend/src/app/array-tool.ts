/**
 * "Réseau" (as Fusion's patterns, Curic's arrays, DIO's "*n" and "/n"): copies of the chosen bodies and sketches.
 * Linear: repeated along X, Y or Z. Rectangular: a grid over two directions, each with its own axis, quantity and
 * step. Circular: turned around an axis. With a step, copy k is moved by k × step (a shelf every 32 cm); spread over
 * a distance, the copies are evenly spaced up to it (3 copies over 60 cm: one every 20 cm). The originals stay; a
 * sketch's copies are new sketches; one undo step. A click on a body or a sketch adds it, or removes it.
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import { arrayOffsets, type ArrayFeature, type Axis, type Feature, type Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import { moveSketchPlane } from "../sketcher/move";
import { sketchBox } from "../sketcher/sketch-transform";
import { el } from "../ui/dom";
import { AXIS_OPTIONS, boxOfBodies, freshFeatureIds, unionBox } from "./curic-common";
import { edgePicked, facePicked } from "./measure-shapes";
import { PanelTool, type ToolContext } from "./panel-tool";

const COUNTS: [string, string][] = Array.from({ length: 30 }, (_, i): [string, string] => [String(i + 1), String(i + 1)]);
/** Quantities of a rectangular direction, the original included (1: nothing in that direction). */
const QUANTITIES: [string, string][] = Array.from({ length: 31 }, (_, i): [string, string] => [String(i + 1), String(i + 1)]);
const TYPES: [string, string][] = [
  ["line", "Linéaire (une direction)"],
  ["rect", "Rectangulaire (deux directions)"],
  ["circle", "Circulaire (autour d'un axe)"],
];

type Kind = "line" | "rect" | "circle";

/** One direction of a pattern: the axis, how many copies, and the step or the distance covered. */
interface Direction {
  axis: Axis;
  count: number;
  step: number;
  distance: number;
}

const dominantAxis = (v: Vec3): Axis => v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs))) as Axis;

/**
 * How far the last copy goes for it to arrive at `at` along the axis (mm): past the far side of what is copied, that
 * side there; before its near side (or its middle), its near side there — the other way.
 */
export function arrivalOffset(box: [Vec3, Vec3], axis: Axis, at: number): number {
  const [lo, hi] = [box[0][axis] as number, box[1][axis] as number];
  return Number((at >= (lo + hi) / 2 ? at - hi : at - lo).toFixed(4));
}

export class ArrayTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private targets: string[];
  private sketches: string[];
  private kind: Kind;
  private place: "step" | "spread" = "step";
  private d1: Direction;
  private d2: Direction;
  /** Circular array: turn between copies (degrees), whole circle or typed, and a pivot kept from an edited array. */
  private angle = 90;
  private fullCircle = true;
  private pivot: Vec3 | null = null;
  /** The direction whose last copy arrives where the next click is (a corner, an edge, a face). */
  private arriving: Direction | null = null;

  constructor(ctx: ToolContext, editing: ArrayFeature | null, selected: string[], sketches: string[] = [], kind: Kind = "line") {
    super(ctx, kind === "rect" ? "Réseau rectangulaire" : "Réseau", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "ar");
    this.name = editing?.name ?? uniqueName(doc, kind === "rect" ? "Réseau rectangulaire" : "Réseau");
    const last = ctx.bodies().at(-1)?.id;
    this.sketches = editing ? [] : [...sketches];
    this.targets = editing?.targets ?? (selected.length || sketches.length ? [...selected] : last ? [last] : []);
    this.kind = kind;
    // An edited array: its axis is the step's main direction.
    const axis = editing ? dominantAxis(editing.step) : 0;
    this.d1 = { axis, count: editing?.count ?? 2, step: 0, distance: 0 };
    this.d2 = { axis: axis === 0 ? 1 : 0, count: 1, step: 0, distance: 0 };
    if (editing?.around) {
      this.kind = "circle";
      this.d1.axis = editing.around.axis;
      this.angle = editing.around.angle;
      this.pivot = editing.around.center;
      this.fullCircle = Math.abs(editing.around.angle * (editing.count + 1) - 360) < 1e-6;
    } else if (editing?.second) {
      this.kind = "rect";
      this.d2 = { axis: dominantAxis(editing.second.step), count: editing.second.count, step: 0, distance: 0 };
      this.d2.step = Number((editing.second.step[this.d2.axis] as number).toFixed(4));
    }
    // A new array starts with the copies side by side: the step is the size of what is copied along the axis.
    this.d1.step = editing && !editing.around ? Number((editing.step[axis] as number).toFixed(4)) : this.extent(this.d1.axis);
    if (!editing?.second) this.d2.step = this.extent(this.d2.axis);
    this.d1.distance = this.d1.step * this.d1.count;
    this.d2.distance = this.d2.step * this.d2.count;
  }

  /** The box round what is copied, bodies and sketches. */
  private box(): [Vec3, Vec3] | null {
    const doc = this.ctx.doc();
    return unionBox([boxOfBodies(this.ctx.viewport, this.targets), ...this.sketches.map((id) => findFeature(doc, id)).map((f) => (f?.type === "sketch" ? sketchBox(f) : null))]);
  }

  /** Size of what is copied along an axis (mm). */
  private extent(axis: Axis): number {
    const box = this.box();
    return box ? Number(Math.max((box[1][axis] as number) - (box[0][axis] as number), 1).toFixed(4)) : 100;
  }

  private vector(d: Direction): Vec3 {
    const length = this.place === "step" ? d.step : d.distance / Math.max(d.count, 1);
    const v: Vec3 = [0, 0, 0];
    v[d.axis] = Number(length.toFixed(6));
    return v;
  }

  /** The directions that make copies: one for a linear array, one or two for a rectangular one. */
  private directions(): Direction[] {
    return this.kind === "rect" ? [this.d1, this.d2].filter((d) => d.count > 0) : [this.d1];
  }

  /** The step and counts of the array, or null when there is nothing to repeat. */
  private grid(): Pick<ArrayFeature, "step" | "count" | "second"> | null {
    const [a, b] = this.directions();
    if (!a) return null;
    return { step: this.vector(a), count: a.count, ...(b ? { second: { step: this.vector(b), count: b.count } } : {}) };
  }

  /** Pivot of a circular array: the one kept, else the centre of what is copied. */
  private center(): Vec3 {
    if (this.pivot) return this.pivot;
    const box = boxOfBodies(this.ctx.viewport, this.targets);
    return box ? ([0, 1, 2].map((i) => Number((((box[0][i] as number) + (box[1][i] as number)) / 2).toFixed(4))) as Vec3) : [0, 0, 0];
  }

  private turn(): number {
    return Number((this.fullCircle ? 360 / (this.d1.count + 1) : this.angle).toFixed(6));
  }

  /** The copies: one array for the bodies, and new sketches for each sketch's copies. */
  private features(): Feature[] {
    const doc = this.ctx.doc();
    const list: Feature[] = [];
    if (this.kind === "circle") {
      if (this.targets.length) list.push({ id: this.id, type: "array", name: this.name, targets: [...this.targets], step: [0, 0, 0], count: this.d1.count, around: { axis: this.d1.axis, center: this.center(), angle: this.turn() } });
      return list; // a sketch is copied by translation only: a circular array turns bodies
    }
    const grid = this.grid();
    if (!grid) return list;
    if (this.targets.length) list.push({ id: this.id, type: "array", name: this.name, targets: [...this.targets], ...grid });
    const offsets = arrayOffsets(grid);
    const slots = freshFeatureIds(doc, "sk", "Esquisse", this.sketches.length * offsets.length);
    this.sketches.forEach((id, i) => {
      const sketch = findFeature(doc, id);
      if (sketch?.type !== "sketch") return;
      const { support: _support, offsets: _offsets, ...rest } = sketch;
      offsets.forEach((offset, k) => {
        const slot = slots[i * offsets.length + k]!;
        list.push(moveSketchPlane({ ...rest, id: slot.id, name: `${sketch.name} (copie ${k + 1})` }, offset));
      });
    });
    return list;
  }

  protected feature(): Feature | string {
    if (this.targets.length === 0 && this.sketches.length === 0) return "Cliquez les corps ou les esquisses à répéter.";
    if (this.kind === "circle") return this.targets.length ? (this.features()[0] ?? "Rien à copier.") : "Un réseau circulaire copie des corps : cliquez-en un.";
    if (this.directions().length === 0) return "Mettez une quantité de 2 ou plus dans au moins une direction.";
    if (this.directions().some((d) => Math.abs(this.place === "step" ? d.step : d.distance) < 1e-3)) return "Donnez le pas ou la distance.";
    return this.features()[0] ?? "Rien à copier.";
  }

  protected override companions(): Feature[] {
    return this.features().slice(1);
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le réseau est impossible.") : null;
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  /** The rows of one direction: axis, how many, and the step or the distance. */
  private directionRows(title: string | null, d: Direction, others: Axis[]): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const rect = this.kind === "rect";
    const axes = AXIS_OPTIONS.filter(([v]) => !others.includes(Number(v) as Axis));
    const length = this.vector(d)[d.axis] as number;
    return [
      title ? el0(title) : null,
      this.selectRow("Axe", String(d.axis), axes, (v) => {
        d.axis = Number(v) as Axis;
        d.step = this.extent(d.axis);
        d.distance = d.step * d.count;
        this.changed();
      }),
      rect
        ? this.selectRow("Quantité", String(d.count + 1), QUANTITIES, (v) => {
            d.count = Number(v) - 1;
            this.changed();
          })
        : this.selectRow("Copies", String(d.count), COUNTS, (v) => {
            d.count = Number(v);
            this.changed();
          }),
      this.place === "step"
        ? this.numberRow("Pas", d.step, unit, (v) => ((d.step = v), this.changed()), true)
        : this.numberRow("Distance", d.distance, unit, (v) => ((d.distance = v), this.changed()), true),
      this.arrivalButton(d),
      this.place === "spread" && d.count > 0 ? this.info(`Une copie tous les ${formatLength(Math.abs(length), unit)}.`) : null,
    ];
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const names = [...this.targets.map((id) => bodyLabel(doc, id)), ...this.sketches.map((id) => findFeature(doc, id)?.name ?? id)];
    const grid = this.kind === "circle" ? null : this.grid();
    const total = grid ? arrayOffsets(grid).length : 0;
    return [
      this.info(names.length ? `Répétés (${names.length}) : ${names.join(", ")}` : "Rien de choisi."),
      this.selectRow("Type", this.kind, TYPES, (v) => {
        this.kind = v as Kind;
        if (this.kind === "circle" && !this.editing) this.d1.axis = 2;
        if (this.kind === "rect") {
          // The second direction is another axis, with one copy to start with.
          if (this.d2.axis === this.d1.axis) this.d2.axis = this.d1.axis === 0 ? 1 : 0;
          if (this.d2.count === 0) this.d2.count = 1;
          this.d2.step = this.extent(this.d2.axis);
          this.d2.distance = this.d2.step * this.d2.count;
        }
        this.changed();
      }),
      ...(this.kind === "circle"
        ? this.circleRows()
        : [
            this.selectRow(
              "Placement",
              this.place,
              [
                ["step", "Un pas entre copies (*n)"],
                ["spread", "Réparties sur une distance (/n)"],
              ],
              (v) => {
                this.place = v as "step" | "spread";
                this.changed();
              },
            ),
            ...this.directionRows(this.kind === "rect" ? "Direction 1" : null, this.d1, this.kind === "rect" ? [this.d2.axis] : []),
            ...(this.kind === "rect" ? this.directionRows("Direction 2", this.d2, [this.d1.axis]) : []),
            this.kind === "rect" ? this.info(total ? `${total} copie${total > 1 ? "s" : ""} au total (la grille avec l'original : ${total + 1}).` : "Aucune copie : mettez 2 ou plus en quantité.") : null,
          ]),
      this.info("Cliquez un corps ou une esquisse dans la vue pour l'ajouter ou le retirer. Pas négatif : vers l'autre côté."),
    ];
  }

  private circleRows(): (HTMLElement | null)[] {
    return [
      this.selectRow("Axe", String(this.d1.axis), AXIS_OPTIONS, (v) => {
        this.d1.axis = Number(v) as Axis;
        this.changed();
      }),
      this.selectRow("Copies", String(this.d1.count), COUNTS, (v) => {
        this.d1.count = Number(v);
        this.changed();
      }),
      this.checkRow("Cercle complet (copies à égale distance)", this.fullCircle, (v) => {
        this.fullCircle = v;
        this.changed();
      }),
      this.fullCircle ? this.info(`Une copie tous les ${this.turn()}°.`) : this.numberRow("Angle entre copies", this.angle, "deg", (v) => ((this.angle = v), this.changed()), true),
      this.info("L'axe passe par le centre de ce qui est copié ; les esquisses ne se copient pas en cercle."),
    ];
  }

  /** « Jusqu'à… »: the next click in the view, a corner, an edge or a face, is where the last copy arrives. */
  private arrivalButton(d: Direction): HTMLElement {
    const on = this.arriving === d;
    const button = el("button", { type: "button", class: `h-8 border px-2 text-xs ${on ? "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-100" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}`, "aria-pressed": String(on), "data-array-arrival": "" }, on ? "Cliquez un point, une arête ou une face…" : "Jusqu'à… (point, arête ou face)");
    button.addEventListener("click", () => {
      this.arriving = on ? null : d;
      this.render();
    });
    return button;
  }

  /** Where along the axis the corner, the edge or the face under the pointer is (not a copy being shown). */
  private arrivalAt(event: PointerEvent, axis: Axis): number | null {
    const viewport = this.ctx.viewport;
    const copy = (id: string) => id.startsWith(`${this.id}#`);
    const vertex = viewport.pickVertex(event);
    if (vertex && !copy(vertex.bodyId)) return vertex.point[axis] as number;
    const edge = viewport.pickEdge(event);
    const face = edge && !copy(edge.bodyId) ? null : viewport.pickFace(event, copy);
    const mesh = viewport.bodyMesh(edge && !copy(edge.bodyId) ? edge.bodyId : (face?.bodyId ?? ""));
    const picked = mesh ? (edge && !copy(edge.bodyId) ? edgePicked(mesh, edge.edgeIndex) : face ? facePicked(mesh, face.faceIndex) : null) : null;
    if (!picked) return null;
    const along = picked.outline.flat().map((p) => p[axis] as number);
    const [lo, hi] = [Math.min(...along), Math.max(...along)];
    // Square to the axis: where it is; else where it was clicked (a face), or its middle (an edge).
    return hi - lo < 0.01 ? lo : face ? (face.point.toArray()[axis] as number) : (lo + hi) / 2;
  }

  protected override click(event: PointerEvent): void {
    if (this.arriving) {
      const d = this.arriving;
      const at = this.arrivalAt(event, d.axis);
      const box = this.box();
      if (at === null || !box) return;
      const offset = arrivalOffset(box, d.axis, at);
      this.arriving = null;
      if (this.place === "spread") d.distance = offset;
      else d.step = Number((offset / Math.max(d.count, 1)).toFixed(4));
      this.changed();
      return;
    }
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (!target) return;
    if (target.kind === "sketch" && this.editing) return;
    if (target.kind === "body" && target.id.startsWith(`${this.id}#`)) return; // a copy of the preview
    const list = target.kind === "sketch" ? this.sketches : this.targets;
    const i = list.indexOf(target.id);
    if (i >= 0) list.splice(i, 1);
    else list.push(target.id);
    this.changed();
  }
}

/** A small heading inside the panel. */
function el0(text: string): HTMLElement {
  const h = document.createElement("h3");
  h.className = "pt-1 text-2xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400";
  h.textContent = text;
  return h;
}
