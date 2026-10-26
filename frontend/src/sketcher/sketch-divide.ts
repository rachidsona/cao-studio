/**
 * "Linéaire dans un rectangle" of the sketch: a line (or a few elements) is repeated at equal distances between the
 * two opposite sides of a rectangle of the sketch — shelves, dividers, drawer fronts. n lines make n + 1 equal
 * spaces. A horizontal or vertical line can be tied to the rectangle: each copy is a new line whose ends lie on the
 * two sides (point-on-curve), so it follows the rectangle when this is resized. Pure.
 */
import type { SketchConstraint, SketchCurve, SketchGeometry } from "../document/sketch";
import type { PanelDefaults } from "../document/panel-defaults";
import type { DisplayUnit } from "../document/types";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import { formatValue, type Annotation } from "./annotations";
import { contourOf } from "./move";
import { copiedElements, copyAtOffsets, MAX_COPIES, type ArrayOutcome } from "./sketch-array";
import type { Preview } from "./tools";

/** Positions closer than this (mm) are the same. */
const TOLERANCE = 1e-6;

/** An axis-aligned rectangle of four lines. */
export interface SketchRectangle {
  /** The four sides, by id. */
  sides: { left: string; right: string; bottom: string; top: string };
  min: Vec2;
  max: Vec2;
}

const sideIds = (r: SketchRectangle) => Object.values(r.sides);

/** The rectangle a contour makes (four connected horizontal and vertical lines closing up), or null. */
function rectangleOfContour(g: SketchGeometry, ids: string[]): SketchRectangle | null {
  if (ids.length !== 4) return null;
  const lines = ids.map((id) => g.curves.find((c) => c.id === id)).filter((c): c is Extract<SketchCurve, { kind: "line" }> => c?.kind === "line");
  if (lines.length !== 4) return null;
  const ends = lines.map((l) => [pointPos(g, l.p1), pointPos(g, l.p2)] as [Vec2, Vec2]);
  const xs = ends.flat().map((p) => p[0]);
  const ys = ends.flat().map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 - x0 < TOLERANCE || y1 - y0 < TOLERANCE) return null;
  const near = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;
  const found: Partial<SketchRectangle["sides"]> = {};
  lines.forEach((line, i) => {
    const [[ax, ay], [bx, by]] = ends[i] as [Vec2, Vec2];
    if (near(ax, bx) && near(ax, x0) && !near(ay, by)) found.left = line.id;
    else if (near(ax, bx) && near(ax, x1) && !near(ay, by)) found.right = line.id;
    else if (near(ay, by) && near(ay, y0) && !near(ax, bx)) found.bottom = line.id;
    else if (near(ay, by) && near(ay, y1) && !near(ax, bx)) found.top = line.id;
  });
  const { left, right, bottom, top } = found;
  return left && right && bottom && top ? { sides: { left, right, bottom, top }, min: [x0, y0], max: [x1, y1] } : null;
}

/** The rectangle having this curve as one of its sides, or null. */
export function rectangleOfCurve(g: SketchGeometry, curveId: string): SketchRectangle | null {
  const curve = g.curves.find((c) => c.id === curveId);
  if (!curve || curve.kind !== "line" || curve.construction) return null;
  return rectangleOfContour(g, contourOf(g, curveId));
}

/** Every rectangle of the sketch. */
export function rectanglesOf(g: SketchGeometry): SketchRectangle[] {
  const seen = new Set<string>();
  const out: SketchRectangle[] = [];
  for (const c of g.curves) {
    if (c.kind !== "line" || c.construction || seen.has(c.id)) continue;
    const r = rectangleOfCurve(g, c.id);
    if (r) {
      for (const id of sideIds(r)) seen.add(id);
      out.push(r);
    }
  }
  return out;
}

/** The smallest rectangle that holds all the selected elements (on its sides or inside), or null. */
export function rectangleAround(g: SketchGeometry, selection: ReadonlySet<string>): SketchRectangle | null {
  const { points } = copiedElements(g, selection);
  if (points.length === 0) return null;
  const at = points.map((id) => pointPos(g, id));
  const [x0, x1] = [Math.min(...at.map((p) => p[0])), Math.max(...at.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...at.map((p) => p[1])), Math.max(...at.map((p) => p[1]))];
  const holds = (r: SketchRectangle) => x0 >= r.min[0] - TOLERANCE && x1 <= r.max[0] + TOLERANCE && y0 >= r.min[1] - TOLERANCE && y1 <= r.max[1] + TOLERANCE;
  const area = (r: SketchRectangle) => (r.max[0] - r.min[0]) * (r.max[1] - r.min[1]);
  return rectanglesOf(g).filter(holds).sort((a, b) => area(a) - area(b))[0] ?? null;
}

/** Along which axis the lines are spread: perpendicular to a vertical or a horizontal selected line (X for a vertical one). */
export function spreadAxis(g: SketchGeometry, selection: ReadonlySet<string>): 0 | 1 {
  const lines = g.curves.filter((c): c is Extract<SketchCurve, { kind: "line" }> => c.kind === "line" && selection.has(c.id));
  const first = lines[0];
  if (!first) return 0;
  const [a, b] = [pointPos(g, first.p1), pointPos(g, first.p2)];
  return Math.abs(b[1] - a[1]) >= Math.abs(b[0] - a[0]) ? 0 : 1;
}

/** The n positions that cut [from, to] into n + 1 equal spaces. */
export function equalCuts(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, k) => from + ((k + 1) * (to - from)) / (count + 1));
}

/** Boards that will stand on the lines: their thickness, and the side of the outline the outer ones lie on. */
export type BoardSpec = Pick<PanelDefaults, "thickness" | "align">;

/**
 * Where the lines go so that the openings between the boards are equal. The outer boards lie inside, centred on, or
 * outside the outline; the boards on the lines are centred on them. n lines make n + 1 openings of the same width;
 * null when the boards leave no room.
 */
export function openingCuts(from: number, to: number, count: number, board: BoardSpec): number[] | null {
  const t = board.thickness;
  const edge = board.align === "inside" ? t : board.align === "center" ? t / 2 : 0;
  const [a, b] = [from + edge, to - edge];
  const opening = (b - a - count * t) / (count + 1);
  if (!(opening > TOLERANCE)) return null;
  return Array.from({ length: count }, (_, k) => a + (k + 1) * opening + k * t + t / 2);
}

/** The n + 1 clear openings between the boards, as [start, end] along the spread axis (outer boards included). */
export function openingSpans(from: number, to: number, count: number, board: BoardSpec): [number, number][] {
  const t = board.thickness;
  const edge = board.align === "inside" ? t : board.align === "center" ? t / 2 : 0;
  const cuts = openingCuts(from, to, count, board) ?? [];
  const starts = [from + edge, ...cuts.map((c) => c + t / 2)];
  const ends = [...cuts.map((c) => c - t / 2), to - edge];
  return starts.map((s, i): [number, number] => [s, ends[i] as number]);
}

export interface DivideOptions {
  count: number;
  /** Boards that will stand on the lines: the openings between them are made equal (else the lines are). */
  board?: BoardSpec | null;
  /** 0: lines at equal distances along X (vertical lines), 1: along Y (horizontal lines). */
  axis: 0 | 1;
  /** Copies of a horizontal or vertical line run from side to side of the rectangle and are tied to the sides. */
  attach: boolean;
}

export function divideRectangle(g: SketchGeometry, selection: ReadonlySet<string>, rect: SketchRectangle, options: DivideOptions): ArrayOutcome {
  const { count, axis, attach } = options;
  if (!(count >= 1)) return { ok: false, reason: "Mettez au moins une ligne." };
  if (count > MAX_COPIES) return { ok: false, reason: `Trop de lignes (${MAX_COPIES} au plus).` };
  const { curves, points } = copiedElements(g, selection);
  if (curves.length === 0 && points.length === 0) return { ok: false, reason: "Cliquez la ligne à répartir." };
  const cuts = options.board ? openingCuts(rect.min[axis], rect.max[axis], count, options.board) : equalCuts(rect.min[axis], rect.max[axis], count);
  if (!cuts) return { ok: false, reason: "Les panneaux sont trop épais pour ce rectangle : il ne reste pas d'ouverture." };

  const straight = curves.length > 0 && curves.every((c) => c.kind === "line" && isStraight(g, c, axis));
  if (!attach || !straight) {
    // Plain copies: the selection centred on each cut.
    const at = points.map((id) => pointPos(g, id));
    const middle = (Math.min(...at.map((p) => p[axis])) + Math.max(...at.map((p) => p[axis]))) / 2;
    const offsets = cuts.map((t): Vec2 => (axis === 0 ? [t - middle, 0] : [0, t - middle]));
    return copyAtOffsets(g, selection, offsets);
  }

  // Tied copies: a new line per cut and per selected line, its ends on the two opposite sides.
  const work = cloneGeometry(g);
  const preview: Preview = { lines: [], circles: [], arcs: [] };
  const [low, high] = axis === 0 ? [rect.sides.bottom, rect.sides.top] : [rect.sides.left, rect.sides.right];
  const across = axis === 0 ? 1 : 0;
  for (const t of cuts) {
    for (const seed of curves) {
      const ends: [Vec2, Vec2] = axis === 0 ? [[t, rect.min[across]], [t, rect.max[across]]] : [[rect.min[across], t], [rect.max[across], t]];
      const p1 = nextId(work, "p");
      work.points.push({ id: p1, x: Number(ends[0][0].toFixed(6)), y: Number(ends[0][1].toFixed(6)) });
      const p2 = nextId(work, "p");
      work.points.push({ id: p2, x: Number(ends[1][0].toFixed(6)), y: Number(ends[1][1].toFixed(6)) });
      const line = nextId(work, "l");
      work.curves.push({ id: line, kind: "line", p1, p2, ...(seed.construction ? { construction: true } : {}) });
      const constraint = (c: Omit<SketchConstraint, "id">) => work.constraints.push({ ...c, id: nextId(work, "c") } as SketchConstraint);
      constraint({ kind: "pointOnCurve", point: p1, curve: low } as Omit<SketchConstraint, "id">);
      constraint({ kind: "pointOnCurve", point: p2, curve: high } as Omit<SketchConstraint, "id">);
      constraint({ kind: axis === 0 ? "vertical" : "horizontal", line } as Omit<SketchConstraint, "id">);
      preview.lines.push(ends);
    }
  }
  return { ok: true, geometry: work, copies: cuts.length * curves.length, preview };
}

/** A line that runs across the spread: vertical when the lines are spread along X, horizontal along Y. */
function isStraight(g: SketchGeometry, line: Extract<SketchCurve, { kind: "line" }>, axis: 0 | 1): boolean {
  const [a, b] = [pointPos(g, line.p1), pointPos(g, line.p2)];
  const across = axis === 0 ? 1 : 0;
  return Math.abs(a[axis] - b[axis]) < TOLERANCE && Math.abs(a[across] - b[across]) > TOLERANCE;
}

/**
 * The measure of every space between the sides of the rectangle and the lines spread in it (n lines: n + 1 spaces),
 * as preview dimensions drawn just inside the rectangle's bottom (or left) edge, so the spacing can be read before confirming.
 */
export function gapAnnotations(rect: SketchRectangle, axis: 0 | 1, count: number, unit: DisplayUnit, board?: BoardSpec | null): Annotation[] {
  // With boards: the width of each opening between them; else the space between the lines.
  const spans: [number, number][] = board
    ? openingSpans(rect.min[axis], rect.max[axis], count, board)
    : [rect.min[axis], ...equalCuts(rect.min[axis], rect.max[axis], count), rect.max[axis]].slice(1).map((end, i, all) => [i === 0 ? rect.min[axis] : (all[i - 1] as number), end]);
  const across = axis === 0 ? 1 : 0;
  // On the low edge of the other axis (bottom, or left), away from the panel docked at the top right, the
  // dimension line is drawn 30 px inside (normal pointing in).
  const at = rect.min[across];
  const normal: Vec2 = axis === 0 ? [0, 1] : [1, 0];
  const point = (t: number): Vec2 => (axis === 0 ? [t, at] : [at, t]);
  return spans.map(([start, end], i): Annotation => {
    const value = end - start;
    return { key: `preview:gap:${i}`, role: "preview", shape: { kind: "linear", p1: point(start), p2: point(end), normal }, value, angle: false, text: formatValue(value, false, unit) };
  });
}
