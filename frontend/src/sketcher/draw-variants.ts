/**
 * D'autres façons de tracer, en géométrie pure : le rectangle par son centre et un coin, ou par trois points (un côté
 * à n'importe quel angle, puis la largeur) ; le cercle par deux points (un diamètre) ou par trois points ; l'arc par
 * trois points (le départ, la fin, un point par où il passe) et l'arc tangent, qui prolonge un trait ou un arc depuis
 * son bout sans cassure. Chaque forme garde ses relations : le rectangle ses angles droits (et son centre), les points
 * cliqués restent sur le cercle ou l'arc, l'arc tangent reste tangent à ce qu'il prolonge.
 */
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import { addRectangle, cloneGeometry, findCurve, nextId, pointPos, type Added, type Vec2 } from "./edit";

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);

function push(g: SketchGeometry, c: Omit<SketchConstraint, "id">): void {
  g.constraints.push({ ...c, id: nextId(g, "value" in c ? "d" : "c") } as SketchConstraint);
}

function point(g: SketchGeometry, at: Vec2): string {
  const id = nextId(g, "p");
  g.points.push({ id, x: at[0], y: at[1] });
  return id;
}

/** The circle through three points; null when they are in a line. */
export function circleThrough(a: Vec2, b: Vec2, c: Vec2): { center: Vec2; radius: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9 * Math.max(1, len(sub(b, a)) * len(sub(c, a)))) return null;
  const sq = (p: Vec2) => p[0] * p[0] + p[1] * p[1];
  const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  return { center: [x, y], radius: len(sub(a, [x, y])) };
}

/** The four corners of a rectangle from a side (a to b) and a point giving its width, on either side. */
export function threePointCorners(a: Vec2, b: Vec2, p: Vec2): [Vec2, Vec2, Vec2, Vec2] | null {
  const side = sub(b, a);
  const l = len(side);
  if (l < 1e-9) return null;
  const n: Vec2 = [-side[1] / l, side[0] / l];
  const h = dot(sub(p, a), n);
  if (Math.abs(h) < 1e-9) return null;
  return [a, b, [b[0] + n[0] * h, b[1] + n[1] * h], [a[0] + n[0] * h, a[1] + n[1] * h]];
}

/** A rectangle centred on `center` (a point of the sketch), a corner where clicked: its two diagonals' ends symmetric about it. */
export function addCenterRectangle(base: SketchGeometry, center: string, corner: Vec2, construction = false): Added {
  const g = cloneGeometry(base);
  const c = pointPos(g, center);
  const far = point(g, corner);
  const near = point(g, [2 * c[0] - corner[0], 2 * c[1] - corner[1]]);
  const made = addRectangle(g, { pointId: near }, { pointId: far }, construction);
  push(made.geometry, { kind: "symmetric", a: near, b: far, axis: center } as Omit<SketchConstraint, "id">);
  return { ...made, created: [...made.created] };
}

/** A rectangle at any angle: a side from `a` to `b` (points of the sketch), its width to `p`. */
export function addThreePointRectangle(base: SketchGeometry, a: string, b: string, p: Vec2, construction = false): Added {
  const g = cloneGeometry(base);
  const corners = threePointCorners(pointPos(g, a), pointPos(g, b), p);
  if (!corners) throw new Error("Le rectangle doit avoir une largeur : cliquez à côté du premier côté.");
  const ids = [a, b, point(g, corners[2]), point(g, corners[3])];
  const lines = ids.map((p1, i) => {
    const id = nextId(g, "l");
    g.curves.push({ id, kind: "line", p1, p2: ids[(i + 1) % 4]!, ...(construction ? { construction: true } : {}) });
    return id;
  });
  // Right angles: the first side square to the second, each side parallel to the one opposite.
  push(g, { kind: "perpendicular", a: lines[0]!, b: lines[1]! } as Omit<SketchConstraint, "id">);
  push(g, { kind: "parallel", a: lines[0]!, b: lines[2]! } as Omit<SketchConstraint, "id">);
  push(g, { kind: "parallel", a: lines[1]!, b: lines[3]! } as Omit<SketchConstraint, "id">);
  return { geometry: g, created: lines, lastPoint: ids[2]! };
}

/** A circle through points of the sketch: two (a diameter's ends) or three; they stay on it. */
export function addCircleThrough(base: SketchGeometry, through: string[], construction = false): Added {
  const g = cloneGeometry(base);
  const at = through.map((id) => pointPos(g, id));
  let circle: { center: Vec2; radius: number } | null;
  if (at.length === 2) circle = { center: [(at[0]![0] + at[1]![0]) / 2, (at[0]![1] + at[1]![1]) / 2], radius: len(sub(at[1]!, at[0]!)) / 2 };
  else circle = circleThrough(at[0]!, at[1]!, at[2]!);
  if (!circle || !(circle.radius > 1e-9)) throw new Error(at.length === 2 ? "Les deux points du diamètre sont confondus." : "Trois points en ligne ne font pas de cercle.");
  const center = point(g, circle.center);
  const id = nextId(g, "k");
  g.curves.push({ id, kind: "circle", center, radius: circle.radius, ...(construction ? { construction: true } : {}) });
  // The two ends of a diameter: the first on the circle, the other symmetric to it about the centre (so on it too).
  for (const p of through.length === 2 ? through.slice(0, 1) : through) push(g, { kind: "pointOnCurve", point: p, curve: id } as Omit<SketchConstraint, "id">);
  if (through.length === 2) push(g, { kind: "symmetric", a: through[0]!, b: through[1]!, axis: center } as Omit<SketchConstraint, "id">);
  return { geometry: g, created: [id], lastPoint: center };
}

/** An arc from `start` to `end` (counter-clockwise or not, whichever passes by `via`): the arc as the sketch keeps it. */
function arcCurve(g: SketchGeometry, center: Vec2, start: string, end: string, ccw: boolean, construction: boolean): string {
  const c = point(g, center);
  // The sketch's arcs turn counter-clockwise from their start to their end.
  const [s, e] = ccw ? [start, end] : [end, start];
  const [ps, pe] = [pointPos(g, s), pointPos(g, e)];
  const startAngle = Math.atan2(ps[1] - center[1], ps[0] - center[0]);
  let endAngle = Math.atan2(pe[1] - center[1], pe[0] - center[0]);
  if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  const id = nextId(g, "a");
  g.curves.push({ id, kind: "arc", center: c, start: s, end: e, radius: len(sub(ps, center)), startAngle, endAngle, ...(construction ? { construction: true } : {}) });
  return id;
}

/** Whether going counter-clockwise from `a` reaches `via` before `b`, about `center`. */
export function passesCcw(center: Vec2, a: Vec2, b: Vec2, via: Vec2): boolean {
  const angle = (p: Vec2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const turn = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return turn(angle(a), angle(via)) < turn(angle(a), angle(b));
}

/** An arc through three points: from the first to the second, by the third. */
export function addThreePointArc(base: SketchGeometry, start: string, end: string, via: Vec2, construction = false): Added {
  const g = cloneGeometry(base);
  const [a, b] = [pointPos(g, start), pointPos(g, end)];
  const circle = circleThrough(a, b, via);
  if (!circle) throw new Error("Trois points en ligne ne font pas d'arc : cliquez le troisième à côté.");
  const id = arcCurve(g, circle.center, start, end, passesCcw(circle.center, a, b, via), construction);
  return { geometry: g, created: [id], lastPoint: end };
}

/** The direction a curve leaves its end `at` (a point of it), going on beyond it; null when `at` is not one of its ends. */
export function tangentOut(g: SketchGeometry, curveId: string, at: string): Vec2 | null {
  const curve = findCurve(g, curveId);
  if (!curve) return null;
  const unit = (v: Vec2): Vec2 => {
    const l = len(v) || 1;
    return [v[0] / l, v[1] / l];
  };
  if (curve.kind === "line") {
    if (curve.p2 === at) return unit(sub(pointPos(g, curve.p2), pointPos(g, curve.p1)));
    if (curve.p1 === at) return unit(sub(pointPos(g, curve.p1), pointPos(g, curve.p2)));
    return null;
  }
  if (curve.kind === "arc") {
    const c = pointPos(g, curve.center);
    const r = unit(sub(pointPos(g, at), c));
    // Counter-clockwise from start to end: at the end it goes on counter-clockwise, at the start clockwise.
    if (curve.end === at) return [-r[1], r[0]];
    if (curve.start === at) return [r[1], -r[0]];
  }
  return null;
}

/** The curves that end at a point (lines and arcs): what a tangent arc may go on from. */
export function curvesEndingAt(g: SketchGeometry, at: string): string[] {
  return g.curves.filter((c) => (c.kind === "line" && (c.p1 === at || c.p2 === at)) || (c.kind === "arc" && (c.start === at || c.end === at))).map((c) => c.id);
}

/** The circle of an arc leaving `start` along `direction` and reaching `end`; null when `end` is straight ahead. */
export function tangentCircle(start: Vec2, direction: Vec2, end: Vec2): { center: Vec2; radius: number; ccw: boolean } | null {
  const d = sub(end, start);
  const n: Vec2 = [-direction[1], direction[0]];
  const side = dot(d, n);
  if (Math.abs(side) < 1e-9 * Math.max(1, len(d))) return null;
  // The centre on the normal: equally far from the start and the end.
  const t = dot(d, d) / (2 * side);
  return { center: [start[0] + n[0] * t, start[1] + n[1] * t], radius: Math.abs(t), ccw: side > 0 };
}

/** An arc going on from the end of a curve, tangent to it, to `end` (a point of the sketch). */
export function addTangentArc(base: SketchGeometry, from: string, curve: string, end: string, construction = false): Added {
  const g = cloneGeometry(base);
  const direction = tangentOut(g, curve, from);
  if (!direction) throw new Error("Commencez l'arc tangent au bout d'un trait ou d'un arc.");
  const circle = tangentCircle(pointPos(g, from), direction, pointPos(g, end));
  if (!circle) throw new Error("La fin est droit devant : ce serait un trait, pas un arc.");
  const id = arcCurve(g, circle.center, from, end, circle.ccw, construction);
  // Tangency as a radius to the start square to the line, or in line with the radius of the arc it goes on from:
  // « tangent » on an arc ending on the curve is degenerate for the solver (as the sketch fillet, corner.ts).
  const arc = findCurve(g, id);
  const before = findCurve(g, curve);
  if (arc?.kind === "arc") {
    const radius = nextId(g, "l");
    g.curves.push({ id: radius, kind: "line", p1: arc.center, p2: from, construction: true });
    if (before?.kind === "line") push(g, { kind: "perpendicular", a: radius, b: curve } as Omit<SketchConstraint, "id">);
    else if (before?.kind === "arc") push(g, { kind: "pointOnCurve", point: before.center, curve: radius } as Omit<SketchConstraint, "id">);
  }
  return { geometry: g, created: [id], lastPoint: end };
}

/** Whether three points turn left (for the previews' arcs). */
export const turnsLeft = (a: Vec2, b: Vec2, c: Vec2) => cross(sub(b, a), sub(c, a)) > 0;
