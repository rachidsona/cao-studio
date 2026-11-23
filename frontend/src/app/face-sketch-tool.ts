/**
 * « Magie extrusion », les autres formes de l'esquisse dessinées sur une face (ou sur la grille, sans corps) : arc,
 * polygone, oblong, ovale, courbe, rectangle par le centre ou par 3 points, cercle par 2 ou 3 points, arc par 3
 * points — les outils de l'esquisse (sketcher/tools.ts) posés dans le plan de la face, sans ouvrir d'esquisse. Leurs
 * cotes s'affichent dans la vue pendant le tracé (Ø, R, longueurs) et dans la boîte du bas ; les mesures se tapent au
 * clavier puis Entrée (une distance depuis le dernier point, ou « largeur;hauteur », un rayon, un angle). Sur la grille,
 * le point s'accroche aux trois axes et au pas de la grille ; sur une face, au pas du zoom ; partout, aux coins des
 * corps et aux points posés. Une
 * forme fermée se tire ou se pousse ensuite, comme les autres tracés (« Puis tirer / pousser »).
 */
import { solveSketch } from "../constraints/solver";
import { uniqueId, uniqueName } from "../document/operations";
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import type { Feature, SketchFeature } from "../document/types";
import { evaluateTyped } from "../measurements/typed-expression";
import { formatLength, fromDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { addConstraint, findCurve } from "../sketcher/edit";
import { markedPoints, parseTyped } from "../sketcher/face-draw";
import { withTypedDimensions } from "../sketcher/typed-dims";
import { rayToSketch, toWorld } from "../sketcher/frame";
import { projectOutline } from "../sketcher/projection";
import { DrawingTool, type Preview, type ToolName } from "../sketcher/tools";
import { expressionKey } from "../ui/digit-keys";
import { ValueBox } from "../ui/value-box";
import { dragStep, roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import { coplanarCorners, loadFace, type LoadedFace } from "./face-strip-view";
import { axesRow, groundFace, groundRow, groundSnap, isGround, isStripTrace, MAGIC_EXTRUDE, pullAfter, rememberPull, rememberTrace, TRACES, type Trace } from "./magic-extrude";
import { Marks } from "./measure";
import { PanelTool, type ToolContext } from "./panel-tool";

type Vec2 = [number, number];

/** The shapes of the sketch this tool draws (the line, the rectangle and the circle are the other half's). */
export const SKETCH_SHAPES = ["arc", "polygon", "slot", "oval", "curve", "rectangle-center", "rectangle-3pt", "circle-2pt", "circle-3pt", "arc-3pt"] as const;
export type SketchShape = (typeof SKETCH_SHAPES)[number];
export const isSketchShape = (t: string): t is SketchShape => (SKETCH_SHAPES as readonly string[]).includes(t);

/** Open shapes: kept as a sketch, never pulled. */
const OPEN = new Set<string>(["arc", "arc-3pt"]);
const ORANGE = 0xf97316;
const GREEN = 0x63df0f;
const TYPING = /^[0-9.,;\- +*/()×÷]$/;

/** What the value typed means at this step, for the hint of the box. */
function typedHint(shape: SketchShape, step: number): string {
  if ((shape === "rectangle-center" || shape === "oval") && step === 1) return "Tapez « largeur;hauteur » (ou une seule pour un carré), puis Entrée.";
  if (shape === "arc" && step === 2) return "Tapez l'angle de l'arc (degrés, sens antihoraire), puis Entrée.";
  if ((shape === "slot" && step === 2) || (shape === "rectangle-3pt" && step === 2)) return "Tapez la largeur, puis Entrée.";
  if (step === 0) return "Cliquez le premier point.";
  return "Tapez la distance depuis le dernier point (« distance;angle » pour un angle), puis Entrée.";
}

export class FaceSketchTool extends PanelTool {
  private shape: SketchShape;
  private drawing: DrawingTool;
  private face: LoadedFace | null = null;
  private hoverFace: LoadedFace | null = null;
  /** The sketch being drawn: the face's outline projected, then the shape. */
  private base: SketchGeometry | null = null;
  private points: Vec2[] = [];
  private cursor: Vec2 | null = null;
  private held = false;
  private preview: Preview | null = null;
  private buffer: string | null = null;
  private lastEvent: PointerEvent | null = null;
  private done: SketchGeometry | null = null;
  /** The values typed at each step (mm; an angle in degrees): the shape's fixed dimensions. */
  private steps: TypedStep[] = [];
  private readonly marks: Marks;
  private readonly box: ValueBox;
  private readonly loaded = new Map<string, LoadedFace | null>();
  private readonly loading = new Set<string>();
  private readonly magnets = new Map<string, Vec2[]>();
  private readonly sketchId: string;
  private readonly sketchName: string;

  constructor(ctx: ToolContext, shape: SketchShape) {
    super(ctx, MAGIC_EXTRUDE, null);
    this.shape = shape;
    this.drawing = new DrawingTool(shape as Exclude<ToolName, "select">);
    const doc = ctx.doc();
    this.sketchId = uniqueId(doc, "sk");
    this.sketchName = uniqueName(doc, "Tracé");
    this.marks = new Marks(ctx.viewport.scene);
    this.box = new ValueBox(ctx.container);
    window.addEventListener("keydown", this.onKey, true);
    this.showValues();
  }

  // ---- the face and the pointer -----------------------------------------------------------------

  private faceOf(pick: FacePick): LoadedFace | null {
    const key = `${pick.bodyId}#${pick.faceIndex}`;
    if (this.loaded.has(key)) return this.loaded.get(key) ?? null;
    if (!this.loading.has(key)) {
      this.loading.add(key);
      void loadFace(this.ctx.geometry, key, pick).then((face) => {
        this.loaded.set(key, face);
        if (this.lastEvent) this.move(this.lastEvent);
      });
    }
    return null;
  }

  private world = (face: LoadedFace, p: Vec2) => toWorld(face.frame, p[0], p[1]);

  /** Where the pointer lands: a magnet (a corner, a point laid, a middle) within 14 px; on the grid, its axes and step. */
  private land(face: LoadedFace, raw: Vec2, event: PointerEvent): { point: Vec2; held: boolean } {
    const viewport = this.ctx.viewport;
    let best: { point: Vec2; d: number } | null = null;
    const magnets = this.magnets.get(face.key) ?? this.magnets.set(face.key, coplanarCorners(viewport, face)).get(face.key)!;
    for (const a of [...face.polygon, ...magnets, ...this.points, ...markedPoints(face.polygon).map((m) => m.point)]) {
      const d = viewport.screenDistance(event, this.world(face, a));
      if (d <= 14 && (!best || d < best.d)) best = { point: a, d };
    }
    const found = best as { point: Vec2 } | null;
    if (found) return { point: found.point, held: true };
    if (isGround(face)) {
      const s = groundSnap({ point: raw, kind: "free" }, viewport.gridStep, 10 * viewport.worldPerPixel());
      return { point: s.point, held: s.kind !== "free" };
    }
    // On a face: rounded to the step of the zoom (as the other traces).
    const step = dragStep(viewport.worldPerPixel());
    return { point: [roundTo(raw[0], step), roundTo(raw[1], step)], held: false };
  }

  override move(event: PointerEvent): void {
    this.lastEvent = event;
    const viewport = this.ctx.viewport;
    let face = this.face;
    if (!face) {
      const pick = viewport.pickFace(event);
      face = pick ? this.faceOf(pick) : groundFace();
      this.hoverFace = face;
      viewport.setHoverHighlight(pick ? { face: pick } : null);
    }
    const ray = viewport.rayFromEvent(event);
    const raw = face ? rayToSketch(face.frame, ray.origin, ray.direction) : null;
    if (face && raw) {
      const at = this.land(face, raw, event);
      [this.cursor, this.held] = [at.point, at.held];
      this.preview = this.base ? this.drawing.move(this.base, { pos: at.point }) : null;
    } else this.cursor = null;
    this.draw();
  }

  protected override click(): void {
    const face = this.face ?? this.hoverFace;
    if (face && this.cursor) this.place(face, this.cursor);
  }

  /** A point laid (clicked, or placed by the values typed): the shape goes on, or is done. */
  private place(face: LoadedFace, p: Vec2): void {
    if (!this.face) {
      this.face = face;
      this.base = projectOutline(face.outline, face.frame);
      this.ctx.viewport.setHoverHighlight(null);
    }
    const result = this.drawing.click(this.base!, { pos: p });
    this.points.push(p);
    if (result.kind === "commit") {
      this.base = result.geometry;
      if (result.done) {
        this.done = typedDimensions(result.geometry, this.shape, this.points, this.steps, result.created);
        return this.confirm();
      }
    }
    this.preview = this.drawing.move(this.base!, { pos: p });
    this.render();
    this.draw();
  }

  // ---- what is shown: the shape, its dimensions, the value box -------------------------------------

  private draw(): void {
    this.marks.clear();
    const face = this.face ?? this.hoverFace;
    if (face && this.cursor) {
      const at = (q: Vec2) => this.world(face, q);
      const unit = this.ctx.unit();
      const mm = (v: number) => formatLength(v, unit);
      const pv = this.preview;
      if (pv) {
        pv.lines.forEach(([a, b], i) => {
          this.marks.line(at(a), at(b), ORANGE, false);
          // Its length beside it (the first sides of a polygon only).
          if (i < 4) this.marks.label(at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), mm(Math.hypot(b[0] - a[0], b[1] - a[1])));
        });
        for (const c of pv.circles) {
          const ring = Array.from({ length: 49 }, (_, i): Vec2 => [c.center[0] + c.radius * Math.cos((i / 48) * 2 * Math.PI), c.center[1] + c.radius * Math.sin((i / 48) * 2 * Math.PI)]);
          ring.slice(1).forEach((q, i) => this.marks.line(at(ring[i]!), at(q), ORANGE, false));
          this.marks.label(at([c.center[0] + c.radius, c.center[1]]), `Ø ${mm(2 * c.radius)}`);
        }
        for (const a of pv.arcs) {
          let sweep = a.end - a.start;
          while (sweep <= 0) sweep += 2 * Math.PI;
          const arc = Array.from({ length: 33 }, (_, i): Vec2 => [a.center[0] + a.radius * Math.cos(a.start + (sweep * i) / 32), a.center[1] + a.radius * Math.sin(a.start + (sweep * i) / 32)]);
          arc.slice(1).forEach((q, i) => this.marks.line(at(arc[i]!), at(q), ORANGE, false));
          this.marks.label(at(arc[16]!), `R ${mm(a.radius)} · ${trim((sweep * 180) / Math.PI, 1)}°`);
        }
      }
      this.points.forEach((q) => this.marks.dot(at(q), GREEN));
      this.marks.dot(at(this.cursor), this.held ? GREEN : ORANGE);
    }
    this.showValues();
  }

  private showValues(): void {
    const face = this.face ?? this.hoverFace;
    const label = TRACES.find(([t]) => t === this.shape)?.[1] ?? "Forme";
    if (!face) this.box.show(label, "—", "Survolez une face d'un corps, ou la grille.");
    else {
      const last = this.points.at(-1);
      const c = this.cursor;
      const unit = this.ctx.unit();
      const reading = last && c ? `${formatLength(Math.hypot(c[0] - last[0], c[1] - last[1]), unit)} depuis le dernier point` : c ? `${formatLength(c[0], unit)} ; ${formatLength(c[1], unit)}` : "—";
      this.box.show(label, reading, `${this.drawing.step}. ${typedHint(this.shape, this.points.length)}`);
    }
    this.box.setTyped(this.buffer);
  }

  // ---- typing ----------------------------------------------------------------------------------------

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.closest("input, textarea, select, [contenteditable=true]") || event.ctrlKey || event.metaKey || event.altKey)) return;
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showValues();
    };
    const key = expressionKey(event) ?? event.key;
    if (TYPING.test(key) && this.points.length > 0) {
      if (key === " " && this.buffer === null) return;
      this.buffer = (this.buffer ?? "") + key;
      return consume();
    }
    if (this.buffer === null) return;
    if (event.key === "Backspace") {
      this.buffer = this.buffer.slice(0, -1) || null;
      return consume();
    }
    if (event.key === "Escape") {
      this.buffer = null;
      return consume();
    }
    if (event.key === "Enter") {
      this.applyTyped();
      return consume();
    }
  };

  /** The values typed: the next point placed from the last one, toward the pointer. */
  private applyTyped(): void {
    const text = this.buffer ?? "";
    this.buffer = null;
    const face = this.face;
    const last = this.points.at(-1);
    if (!face || !last) return;
    const values = parseTyped(text, (p) => evaluateTyped(p)).filter((v): v is number => v !== null && v !== undefined);
    if (!values.length) return this.ctx.notify(`« ${text} » n'est pas une mesure.`, "error");
    const mm = (v: number) => fromDisplay(v, this.ctx.unit());
    const p = typedPoint(this.shape, this.points, this.cursor ?? [last[0] + 1, last[1]], values, mm);
    if (!p) return this.ctx.notify("Cette mesure ne s'applique pas ici.", "info");
    // Kept as a fixed dimension of the sketch, as the sketch's tools do: lengths in mm, an angle in degrees.
    const pair = this.shape === "rectangle-center" || this.shape === "oval";
    this.steps.push({ at: this.points.length, values: [this.shape === "arc" && this.points.length === 2 ? values[0]! : mm(values[0]!), ...(values[1] === undefined ? [] : [pair ? mm(values[1]) : values[1]])] });
    this.place(face, p);
  }

  // ---- the result ------------------------------------------------------------------------------------

  protected feature(): Feature | string {
    const face = this.face;
    if (!face || !this.done) return this.drawing.step;
    const sketch: SketchFeature = { id: this.sketchId, type: "sketch", name: this.sketchName, plane: face.plane, offset: Number(face.offset.toFixed(6)), ...(face.slanted ? { frame: face.slanted } : {}), ...this.done, ...(isGround(face) ? {} : { support: face.pick.bodyId }) };
    return sketch;
  }

  override confirm(): void {
    // A curve ends where it is: as it is drawn.
    if (!this.done && this.shape === "curve" && this.base && this.points.length >= 2) this.done = this.base;
    const built = this.feature();
    if (typeof built === "string") return this.ctx.notify(built, "info");
    rememberPull(pullAfter());
    const doc = { ...this.ctx.doc(), features: [...this.ctx.doc().features, built] };
    const goOn = !OPEN.has(this.shape) && pullAfter() && !!this.ctx.extrude;
    this.close();
    this.ctx.commit(doc, built.id, goOn ? () => this.ctx.extrude?.() : undefined);
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      if (this.points.length) {
        this.restart();
        this.render();
        this.draw();
      } else this.cancel();
      return true;
    }
    if (event.key === "Enter" && this.shape === "curve") {
      this.confirm();
      return true;
    }
    return false;
  }

  private restart(): void {
    this.drawing.reset();
    [this.points, this.face, this.base, this.done, this.preview, this.buffer] = [[], null, null, null, null, null];
    this.steps = [];
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = UNIT_LABELS[this.ctx.unit()];
    return [
      this.selectRow("Tracé", this.shape, TRACES, (v) => {
        rememberTrace(v as Trace);
        if (!isSketchShape(v)) return this.ctx.switchTo?.(isStripTrace(v as Trace) ? "faceStrip" : "drawOnFace");
        const sides = this.drawing.sides;
        this.shape = v;
        this.drawing = new DrawingTool(v as Exclude<ToolName, "select">);
        this.drawing.sides = sides;
        this.restart();
        this.render();
        if (this.lastEvent) this.move(this.lastEvent);
      }),
      this.shape === "polygon" ? this.numberRow("Côtés", this.drawing.sides, "plain", (v) => (Number.isInteger(v) && v >= 3 && v <= 12 ? ((this.drawing.sides = v), this.lastEvent && this.move(this.lastEvent)) : undefined)) : null,
      this.info(`${this.drawing.step}.`),
      groundRow((l, v, o, f) => this.selectRow(l, v, o, f), () => this.lastEvent && this.move(this.lastEvent), (l, c, f) => this.checkRow(l, c, f), this.ctx.viewport),
      OPEN.has(this.shape) ? null : this.checkRow("Puis tirer / pousser", pullAfter(), (v) => rememberPull(v)),
      this.info(`Les cotes s'affichent dans la vue ; tapez une mesure au clavier (en ${unit}) puis Entrée. ${this.shape === "curve" ? "Entrée (ou recliquer le dernier point) finit la courbe. " : ""}Échap reprend le tracé.`),
    ];
  }

  protected override dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.box.dispose();
    this.marks.clear();
    this.ctx.viewport.setHoverHighlight(null);
  }
}

/**
 * The next point of a shape from the values typed (display unit → mm by `mm`; degrees for an angle), from its points
 * laid and the pointer (for the side). Null: not a value for this step. Pure.
 */
export function typedPoint(shape: SketchShape, points: readonly Vec2[], cursor: Vec2, values: readonly number[], mm: (v: number) => number): Vec2 | null {
  const last = points.at(-1);
  if (!last) return null;
  const [a, b] = values;
  const toward = (from: Vec2, d: number): Vec2 => {
    const l = Math.hypot(cursor[0] - from[0], cursor[1] - from[1]) || 1;
    return [from[0] + ((cursor[0] - from[0]) / l) * d, from[1] + ((cursor[1] - from[1]) / l) * d];
  };
  const side = (p: Vec2, q: Vec2, w: number): Vec2 => {
    // Square to p→q, on the pointer's side, `w` away from q.
    const d: Vec2 = [q[0] - p[0], q[1] - p[1]];
    const l = Math.hypot(...d) || 1;
    let n: Vec2 = [-d[1] / l, d[0] / l];
    if ((cursor[0] - q[0]) * n[0] + (cursor[1] - q[1]) * n[1] < 0) n = [-n[0], -n[1]];
    return [q[0] + n[0] * w, q[1] + n[1] * w];
  };
  if (a === undefined) return null;
  if ((shape === "rectangle-center" || shape === "oval") && points.length === 1) {
    const [w, h] = [mm(a), mm(b ?? a)];
    return [last[0] + Math.sign(cursor[0] - last[0] || 1) * (w / 2), last[1] + Math.sign(cursor[1] - last[1] || 1) * (h / 2)];
  }
  if (shape === "arc" && points.length === 2) {
    const [c, s] = points as [Vec2, Vec2];
    const turn = Math.atan2(s[1] - c[1], s[0] - c[0]) + (a * Math.PI) / 180;
    const r = Math.hypot(s[0] - c[0], s[1] - c[1]);
    return [c[0] + r * Math.cos(turn), c[1] + r * Math.sin(turn)];
  }
  if (shape === "slot" && points.length === 2) return side(points[0]!, points[1]!, mm(a) / 2);
  if (shape === "rectangle-3pt" && points.length === 2) return side(points[0]!, points[1]!, mm(a));
  if (b !== undefined) {
    const turn = (b * Math.PI) / 180;
    return [last[0] + mm(a) * Math.cos(turn), last[1] + mm(a) * Math.sin(turn)];
  }
  return toward(last, mm(a));
}

/** The values typed for the point `at` of a shape (mm; an angle in degrees). */
export interface TypedStep {
  at: number;
  values: number[];
}

/**
 * The shape drawn with a fixed dimension for each value typed, as the sketch's tools give: the width and height of a
 * rectangle by its centre, the diameter of a circle by two points, the width of a slot (its ends' radius), else the
 * distance between the two points the value placed. An angle orients without a dimension; an oval keeps its shape
 * without one (shortcut: its pieces carry none, a dimension on them would come later). A dimension the sketch cannot
 * take is left out: the shape stays as drawn. Pure.
 */
export function typedDimensions(g: SketchGeometry, shape: SketchShape, points: readonly Vec2[], steps: readonly TypedStep[], created: readonly string[]): SketchGeometry {
  let out = g;
  const pointAt = (p: Vec2 | undefined) => (p ? out.points.find((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 1e-6)?.id : undefined);
  const keep = (constraint: object) => {
    const added = addConstraint(out, constraint as Omit<SketchConstraint, "id">).geometry;
    try {
      if (solveSketch(added).state === "ok") out = added;
    } catch {
      // Left out.
    }
  };
  for (const { at, values } of steps) {
    const [a, b] = values as [number, number?];
    if (shape === "rectangle-center" && at === 1) out = withTypedDimensions(out, created, "rectangle-center", { w: a, h: b ?? a });
    else if (shape === "circle-2pt" && at === 1) out = withTypedDimensions(out, created, "circle-2pt", { c: a });
    else if (shape === "slot" && at === 2) {
      const arc = created.find((id) => findCurve(out, id)?.kind === "arc");
      if (arc) keep({ kind: "radius", curve: arc, value: a / 2 });
    } else if (shape !== "oval" && !(shape === "arc" && at === 2)) {
      const [p, q] = [pointAt(points[at - 1]), pointAt(points[at])];
      if (p && q && p !== q) keep({ kind: "distance", a: p, b: q, value: a });
    }
  }
  return out;
}

