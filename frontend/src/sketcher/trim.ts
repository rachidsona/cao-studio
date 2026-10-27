/**
 * "Couper" (Trim) of the sketch, as in Fusion: the part of a line, an arc or a circle under the pointer, between
 * the two curves that cross it, is removed. With no crossing on one side the part runs to the end of the curve;
 * with none at all the whole curve goes. A new end lies on the curve that cut it (an existing point when the cut
 * is at one, else a new point kept on that curve by a point-on-curve constraint). A line cut in the middle becomes
 * two lines, an arc two arcs, a circle cut between two crossings the arc that remains. Pure functions on the
 * geometry; the sketch mode solves and stores the result.
 */
import { constraintRefs, curvePoints, isDimension, type SketchConstraint, type SketchCurve, type SketchGeometry } from "../document/sketch";
import { crossings, NODE_TOLERANCE, paramOf, pointAt, primOf, type Prim } from "./arrangement";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Preview } from "./tools";

const EPS = 1e-9;
const TWO_PI = 2 * Math.PI;

/** A place where another curve crosses the one being cut. */
export interface Cut {
  /** Parameter along the curve: t in [0, 1] for a line, the angle from the start for an arc or a circle. */
  param: number;
  at: Vec2;
  /** The curve that crosses. */
  by: string;
}

export interface Trim {
  curveId: string;
  /** What is cut away, between two cuts (null: the curve's own end), as parameters along the curve. */
  from: Cut | null;
  to: Cut | null;
  /** The whole curve goes (nothing crosses it). */
  whole: boolean;
  preview: Preview;
}

/** Every crossing of the curve with the others (construction curves left out), sorted along the curve. */
function cutsOf(g: SketchGeometry, curve: SketchCurve, prim: Prim): Cut[] {
  const cuts: Cut[] = [];
  for (const other of g.curves) {
    if (other.id === curve.id || other.construction) continue;
    for (const at of crossings(prim, primOf(g, other))) {
      const param = paramOf(at, prim);
      if (!cuts.some((c) => Math.abs(c.param - param) < 1e-9)) cuts.push({ param, at, by: other.id });
    }
  }
  return cuts.sort((a, b) => a.param - b.param);
}

/** The trim of the curve under `cursor`, or a reason (string) when it cannot be cut, or null when it is not a curve to cut. */
export function findTrim(g: SketchGeometry, curveId: string, cursor: Vec2): Trim | string | null {
  const curve = g.curves.find((c) => c.id === curveId);
  if (!curve || curve.construction) return null;
  if (curve.projected) return "Cette courbe est projetée d'un corps : elle ne se coupe pas.";
  const prim = primOf(g, curve);
  const cuts = cutsOf(g, curve, prim);
  const t = paramOf(cursor, prim);
  const empty: Preview = { lines: [], circles: [], arcs: [] };

  if (prim.kind === "circle") {
    if (cuts.length === 0) return { curveId, from: null, to: null, whole: true, preview: { lines: [], circles: [{ center: prim.c, radius: prim.r }], arcs: [] } };
    if (cuts.length === 1) return "Un cercle se coupe entre deux croisements : celui-ci n'en a qu'un.";
    // The cuts either side of the cursor, going round the circle.
    const before = [...cuts].reverse().find((c) => c.param <= t) ?? (cuts[cuts.length - 1] as Cut);
    const after = cuts.find((c) => c.param > t) ?? (cuts[0] as Cut);
    const end = after.param > before.param ? after.param : after.param + TWO_PI;
    return { curveId, from: before, to: after, whole: false, preview: { ...empty, arcs: [{ center: prim.c, radius: prim.r, start: before.param, end }] } };
  }

  const length = prim.kind === "line" ? 1 : prim.sweep;
  const inner = cuts.filter((c) => c.param > EPS && c.param < length - EPS);
  const before = [...inner].reverse().find((c) => c.param <= t) ?? null;
  const after = inner.find((c) => c.param > t) ?? null;
  const [a, b] = [before?.param ?? 0, after?.param ?? length];
  const preview: Preview =
    prim.kind === "line" ? { ...empty, lines: [[pointAt(prim, a), pointAt(prim, b)]] } : { ...empty, arcs: [{ center: prim.c, radius: prim.r, start: prim.a0 + a, end: prim.a0 + b }] };
  return { curveId, from: before, to: after, whole: !before && !after, preview };
}

// ---- applying -------------------------------------------------------------------------------

/** Whether anything but `ignore` still refers to the point (a curve, or a constraint). */
function pointInUse(g: SketchGeometry, id: string, ignore: ReadonlySet<string> = new Set()): boolean {
  return g.curves.some((c) => !ignore.has(c.id) && curvePoints(c).includes(id)) || g.constraints.some((c) => !ignore.has(c.id) && constraintRefs(c).includes(id));
}

/** A point at `at` for a new end: an existing one there, else a new one kept on the curve that cut (if any). */
export function endPoint(g: SketchGeometry, cut: Cut): string {
  const near = g.points.find((p) => Math.hypot(p.x - cut.at[0], p.y - cut.at[1]) <= NODE_TOLERANCE);
  if (near) return near.id;
  const id = nextId(g, "p");
  g.points.push({ id, x: Number(cut.at[0].toFixed(9)), y: Number(cut.at[1].toFixed(9)) });
  g.constraints.push({ id: nextId(g, "c"), kind: "pointOnCurve", point: id, curve: cut.by } as SketchConstraint);
  return id;
}

/** Drops what cannot hold after a curve is cut: its dimensions (the value is no longer the curve's), constraints of removed points. */
function tidy(g: SketchGeometry, curveIds: ReadonlySet<string>, removedPoints: ReadonlySet<string>): void {
  g.constraints = g.constraints.filter((c) => {
    const refs = constraintRefs(c);
    if (refs.some((r) => removedPoints.has(r))) return false;
    return !(isDimension(c) && refs.some((r) => curveIds.has(r)));
  });
}

export function applyTrim(g: SketchGeometry, trim: Trim): SketchGeometry {
  const next = cloneGeometry(g);
  const curve = next.curves.find((c) => c.id === trim.curveId);
  if (!curve) return g;
  const ends = curvePoints(curve);

  if (trim.whole) {
    next.curves = next.curves.filter((c) => c.id !== curve.id);
    next.constraints = next.constraints.filter((c) => !constraintRefs(c).includes(curve.id));
    // Points only this curve used go with it (a fixed point, or one a constraint still holds, stays).
    for (const id of new Set(ends)) {
      const point = next.points.find((p) => p.id === id);
      if (point && !point.fixed && !pointInUse(next, id)) next.points = next.points.filter((p) => p.id !== id);
    }
    return next;
  }

  const removed = new Set<string>();
  const dropPoint = (id: string) => {
    if (!pointInUse(next, id, new Set<string>())) removed.add(id);
  };
  // Points tied to the curve that lie in the part cut away are no longer on it.
  const prim = primOf(g, curve);
  const [a, b] = [trim.from?.param ?? 0, trim.to?.param ?? (prim.kind === "line" ? 1 : prim.kind === "arc" ? prim.sweep : TWO_PI)];
  const within = (id: string) => {
    const t = paramOf(pointPos(g, id), prim);
    return prim.kind === "circle" ? (a <= b ? t > a + EPS && t < b - EPS : t > a + EPS || t < b - EPS) : t > a + EPS && t < b - EPS;
  };
  next.constraints = next.constraints.filter((c) => !(c.kind === "pointOnCurve" && c.curve === curve.id && within(c.point)));

  if (curve.kind === "line") {
    const first = trim.from ? endPoint(next, trim.from) : null;
    const second = trim.to ? endPoint(next, trim.to) : null;
    const [p1, p2] = [curve.p1, curve.p2];
    if (first && second) {
      // Cut in the middle: this line keeps the start, a new line takes the end.
      const twin: SketchCurve = { id: nextId(next, "l"), kind: "line", p1: second, p2, ...(curve.construction ? { construction: true } : {}) };
      curve.p2 = first;
      next.curves.push(twin);
      for (const c of g.constraints) if ((c.kind === "horizontal" || c.kind === "vertical") && c.line === curve.id) next.constraints.push({ ...c, id: nextId(next, "c"), line: twin.id } as SketchConstraint);
    } else if (first) {
      curve.p2 = first;
      dropPoint(p2);
    } else if (second) {
      curve.p1 = second;
      dropPoint(p1);
    }
  } else if (curve.kind === "arc") {
    const first = trim.from ? endPoint(next, trim.from) : null;
    const second = trim.to ? endPoint(next, trim.to) : null;
    const [start, end] = [curve.startAngle, curve.endAngle];
    if (first && second) {
      next.curves.push({ ...curve, id: nextId(next, "a"), start: second, end: curve.end, startAngle: start + (trim.to as Cut).param, endAngle: end, projected: undefined } as SketchCurve);
      curve.end = first;
      curve.endAngle = start + (trim.from as Cut).param;
    } else if (first) {
      dropPoint(curve.end);
      curve.end = first;
      curve.endAngle = start + (trim.from as Cut).param;
    } else if (second) {
      dropPoint(curve.start);
      curve.start = second;
      curve.startAngle = start + (trim.to as Cut).param;
    }
  } else {
    // A circle cut between two crossings: the arc that remains, counter-clockwise from the second cut to the first.
    const first = endPoint(next, trim.from as Cut);
    const second = endPoint(next, trim.to as Cut);
    const startAngle = (trim.to as Cut).param;
    let endAngle = (trim.from as Cut).param;
    if (endAngle <= startAngle) endAngle += TWO_PI;
    const index = next.curves.findIndex((c) => c.id === curve.id);
    next.curves[index] = { id: curve.id, kind: "arc", center: curve.center, start: second, end: first, radius: curve.radius, startAngle, endAngle, ...(curve.construction ? { construction: true } : {}) } as SketchCurve;
  }
  for (const id of removed) next.points = next.points.filter((p) => p.id !== id);
  tidy(next, new Set([curve.id]), removed);
  return next;
}
