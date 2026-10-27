/**
 * "Couper" (Break) of the sketch, as in Fusion: the line, arc or circle under the pointer is cut into pieces where
 * the curves round the pointer cross it, and nothing is removed. The part under the pointer, between the two
 * crossings either side of it (or the curve's own end), becomes a curve of its own: a line or an arc gives up to
 * three pieces, a circle two arcs. The pieces share their end points, each kept on the curve that crosses there.
 * Pure functions on the geometry; the sketch mode solves and stores the result.
 */
import { constraintRefs, isDimension, type SketchConstraint, type SketchCurve, type SketchGeometry } from "../document/sketch";
import { paramOf, primOf } from "./arrangement";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Preview } from "./tools";
import { endPoint, findTrim, type Cut } from "./trim";

const EPS = 1e-9;
const TWO_PI = 2 * Math.PI;

export interface Break {
  curveId: string;
  /** The crossings either side of the pointer (null: the curve's own end). */
  from: Cut | null;
  to: Cut | null;
  /** Where the curve will be cut (the red crosses shown before the click). */
  marks: Vec2[];
  /** The piece under the pointer. */
  preview: Preview;
}

/** The break of the curve under `cursor`, or a reason (string) when it cannot be cut, or null when it is not a curve to cut. */
export function findBreak(g: SketchGeometry, curveId: string, cursor: Vec2): Break | string | null {
  const trim = findTrim(g, curveId, cursor);
  if (trim === null || typeof trim === "string") return trim;
  if (trim.whole) return "Aucune courbe ne croise celle-ci : il n'y a pas d'endroit où la couper.";
  return { curveId, from: trim.from, to: trim.to, marks: [trim.from, trim.to].filter((c): c is Cut => c !== null).map((c) => c.at), preview: trim.preview };
}

/** Pieces of a curve after a break: the piece's end points and, for an arc, its angles. */
interface Piece {
  from: string;
  to: string;
  /** Parameters along the original curve (arc: angle from its start; circle: absolute angle). */
  a: number;
  b: number;
}

export function applyBreak(g: SketchGeometry, cut: Break): SketchGeometry {
  const next = cloneGeometry(g);
  const curve = next.curves.find((c) => c.id === cut.curveId);
  if (!curve) return g;
  const prim = primOf(g, curve);
  const construction = curve.construction ? { construction: true } : {};
  const first = cut.from ? endPoint(next, cut.from) : null;
  const second = cut.to ? endPoint(next, cut.to) : null;

  let pieces: Piece[];
  if (curve.kind === "circle") {
    if (!first || !second || !cut.from || !cut.to) return g;
    const [a, b] = [cut.from.param, cut.to.param > cut.from.param ? cut.to.param : cut.to.param + TWO_PI];
    // The piece under the pointer, then the rest of the circle.
    pieces = [
      { from: first, to: second, a, b },
      { from: second, to: first, a: b, b: a + TWO_PI },
    ];
  } else {
    const [start, end] = curve.kind === "line" ? [curve.p1, curve.p2] : [curve.start, curve.end];
    const length = prim.kind === "line" ? 1 : prim.kind === "arc" ? prim.sweep : TWO_PI;
    const stops = [
      { id: start, t: 0 },
      ...(first && cut.from ? [{ id: first, t: cut.from.param }] : []),
      ...(second && cut.to ? [{ id: second, t: cut.to.param }] : []),
      { id: end, t: length },
    ];
    pieces = stops.slice(1).map((s, i) => ({ from: (stops[i] as { id: string }).id, to: s.id, a: (stops[i] as { t: number }).t, b: s.t }));
  }

  // The first piece keeps the curve's id; the others are new curves.
  const ids: string[] = [];
  pieces.forEach((piece, i) => {
    let made: SketchCurve;
    if (curve.kind === "line") made = { id: i === 0 ? curve.id : nextId(next, "l"), kind: "line", p1: piece.from, p2: piece.to, ...construction };
    else {
      const base = curve.kind === "arc" ? curve.startAngle : 0;
      made = { id: i === 0 ? curve.id : nextId(next, "a"), kind: "arc", center: curve.center, radius: curve.radius, start: piece.from, end: piece.to, startAngle: base + piece.a, endAngle: base + piece.b, ...construction } as SketchCurve;
    }
    ids.push(made.id);
    if (i === 0) next.curves[next.curves.findIndex((c) => c.id === curve.id)] = made;
    else next.curves.push(made);
  });

  const ends = new Set(pieces.flatMap((p) => [p.from, p.to]));
  const pieceOf = (pointId: string): string | undefined => {
    const t = paramOf(pointPos(g, pointId), prim);
    const index = pieces.findIndex((p) => (t >= p.a - EPS && t <= p.b + EPS) || (t + TWO_PI >= p.a - EPS && t + TWO_PI <= p.b + EPS));
    return index >= 0 ? ids[index] : undefined;
  };
  const kept: SketchConstraint[] = [];
  const copies: SketchConstraint[] = [];
  for (const c of next.constraints) {
    const refs = constraintRefs(c);
    if (!refs.includes(curve.id)) {
      kept.push(c);
      continue;
    }
    // A dimension or an equality measured the whole curve: it no longer holds for one piece.
    if (isDimension(c) || c.kind === "equal") continue;
    if (c.kind === "pointOnCurve") {
      // A point on the curve stays on the piece it lies on; a point that became an end needs nothing more.
      if (ends.has(c.point)) continue;
      const piece = pieceOf(c.point);
      if (piece) kept.push({ ...c, curve: piece });
      continue;
    }
    kept.push(c);
    // Every piece of a horizontal or vertical line keeps its direction.
    if (c.kind === "horizontal" || c.kind === "vertical") for (const id of ids.slice(1)) copies.push({ ...c, line: id });
  }
  next.constraints = kept;
  for (const copy of copies) next.constraints.push({ ...copy, id: nextId(next, "c") });
  return next;
}
