/**
 * Congé et chanfrein d'un coin d'esquisse, comme dans Fusion : au point où deux lignes se rejoignent, les lignes
 * sont raccourcies et reliées par un arc tangent (congé, coté par son rayon) ou par une ligne (chanfrein, coté par
 * sa distance au coin). Le coin d'origine reste comme « coin virtuel », tenu sur les deux lignes prolongées : les
 * cotes qui le visaient continuent de valoir (une longueur de ligne devient la distance du coin à l'autre bout),
 * et l'esquisse garde le même nombre de degrés de liberté. Fonctions pures ; le mode esquisse résout et enregistre.
 */
import type { LineCurve, SketchConstraint, SketchGeometry } from "../document/sketch";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";

export interface Corner {
  point: string;
  /** The two lines meeting there, and their other ends. */
  lines: [LineCurve, LineCurve];
  others: [string, string];
}

/** The corner at a point: exactly two lines (not construction, not projected) end there. */
export function cornerAt(g: SketchGeometry, pointId: string): Corner | null {
  const lines = g.curves.filter((c): c is LineCurve => c.kind === "line" && !c.construction && !c.projected && (c.p1 === pointId || c.p2 === pointId));
  if (lines.length !== 2 || g.curves.some((c) => c.kind !== "line" && "center" in c && (c.kind === "arc" ? c.start === pointId || c.end === pointId : false))) return null;
  const [a, b] = lines as [LineCurve, LineCurve];
  return { point: pointId, lines: [a, b], others: [a.p1 === pointId ? a.p2 : a.p1, b.p1 === pointId ? b.p2 : b.p1] };
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (v: Vec2) => Math.hypot(v[0], v[1]);
const unit = (v: Vec2): Vec2 => [v[0] / len(v), v[1] / len(v)];
const round = (v: number) => Number(v.toFixed(9));

/** The ends of the cut on each line, at `d` from the corner, or a reason when the lines are too short or in line. */
function cutPoints(g: SketchGeometry, corner: Corner, d: (angle: number) => number): { t1: Vec2; t2: Vec2; u1: Vec2; u2: Vec2; angle: number; d: number } | string {
  const p = pointPos(g, corner.point);
  const [a, b] = corner.others.map((id) => pointPos(g, id)) as [Vec2, Vec2];
  const u1 = unit(sub(a, p));
  const u2 = unit(sub(b, p));
  const angle = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (angle < 1e-6 || Math.PI - angle < 1e-6) return "Les deux lignes sont alignées : il n'y a pas de coin.";
  const distance = d(angle);
  if (!(distance > 1e-6)) return "La valeur doit être positive.";
  if (distance >= len(sub(a, p)) - 1e-6 || distance >= len(sub(b, p)) - 1e-6) return "Trop grand pour ce coin : une des lignes serait entièrement mangée.";
  return { t1: [p[0] + u1[0] * distance, p[1] + u1[1] * distance], t2: [p[0] + u2[0] * distance, p[1] + u2[1] * distance], u1, u2, angle, d: distance };
}

/** The common part: the lines shortened to new ends, the corner kept on both lines, their length dimensions moved to it. */
function cut(g: SketchGeometry, corner: Corner, t1: Vec2, t2: Vec2): { next: SketchGeometry; e1: string; e2: string } {
  const next = cloneGeometry(g);
  const add = (at: Vec2) => {
    const id = nextId(next, "p");
    next.points.push({ id, x: round(at[0]), y: round(at[1]) });
    return id;
  };
  const e1 = add(t1);
  const e2 = add(t2);
  const [l1, l2] = corner.lines.map((l) => next.curves.find((c) => c.id === l.id) as LineCurve);
  for (const [line, end] of [[l1!, e1], [l2!, e2]] as const) {
    if (line.p1 === corner.point) line.p1 = end;
    else line.p2 = end;
  }
  const constraint = (c: Omit<SketchConstraint, "id">) => next.constraints.push({ ...c, id: nextId(next, c.kind === "radius" || c.kind === "distance" ? "d" : "c") } as SketchConstraint);
  // The length of a cut line is now measured from the virtual corner.
  next.constraints = next.constraints.map((c) => {
    if (c.kind !== "length" || (c.line !== l1!.id && c.line !== l2!.id)) return c;
    const other = c.line === l1!.id ? corner.others[0] : corner.others[1];
    const { line: _line, ...rest } = c;
    return { ...rest, kind: "distance", a: corner.point, b: other } as SketchConstraint;
  });
  constraint({ kind: "pointOnCurve", point: corner.point, curve: l1!.id } as never);
  constraint({ kind: "pointOnCurve", point: corner.point, curve: l2!.id } as never);
  return { next, e1, e2 };
}

/** Rounds the corner with an arc of `radius`, tangent to both lines. */
export function filletCorner(g: SketchGeometry, pointId: string, radius: number): SketchGeometry | string {
  const corner = cornerAt(g, pointId);
  if (!corner) return "Cliquez un coin où deux lignes se rejoignent.";
  if (!(radius > 1e-6)) return "Le rayon doit être positif.";
  const found = cutPoints(g, corner, (angle) => radius / Math.tan(angle / 2));
  if (typeof found === "string") return found;
  const { next, e1, e2 } = cut(g, corner, found.t1, found.t2);
  const p = pointPos(g, pointId);
  const bisector = unit([found.u1[0] + found.u2[0], found.u1[1] + found.u2[1]]);
  const reach = radius / Math.sin(found.angle / 2);
  const centre: Vec2 = [p[0] + bisector[0] * reach, p[1] + bisector[1] * reach];
  const c = nextId(next, "p");
  next.points.push({ id: c, x: round(centre[0]), y: round(centre[1]) });
  const angleOf = (q: Vec2) => Math.atan2(q[1] - centre[1], q[0] - centre[0]);
  const [a1, a2] = [angleOf(found.t1), angleOf(found.t2)];
  // Counter-clockwise the short way round: from the end where the arc turns left.
  const ccw = (((a2 - a1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const [start, end, sa, ea] = ccw < Math.PI ? [e1, e2, a1, a1 + ccw] : [e2, e1, a2, a2 + (2 * Math.PI - ccw)];
  const arc = nextId(next, "a");
  next.curves.push({ id: arc, kind: "arc", center: c, start, end, radius: round(radius), startAngle: sa, endAngle: ea });
  // Tangency as a radius perpendicular to each line: "tangent" on an arc ending on the line is degenerate for the solver.
  for (const [line, end] of [[corner.lines[0], e1], [corner.lines[1], e2]] as const) {
    const radiusLine = nextId(next, "l");
    next.curves.push({ id: radiusLine, kind: "line", p1: c, p2: end, construction: true });
    next.constraints.push({ id: nextId(next, "c"), kind: "perpendicular", a: radiusLine, b: line.id });
  }
  next.constraints.push({ id: nextId(next, "d"), kind: "radius", curve: arc, value: round(radius) } as SketchConstraint);
  return next;
}

/** Cuts the corner with a line, its ends at `distance` from the corner on each line. */
export function chamferCorner(g: SketchGeometry, pointId: string, distance: number): SketchGeometry | string {
  const corner = cornerAt(g, pointId);
  if (!corner) return "Cliquez un coin où deux lignes se rejoignent.";
  const found = cutPoints(g, corner, () => distance);
  if (typeof found === "string") return found;
  const { next, e1, e2 } = cut(g, corner, found.t1, found.t2);
  next.curves.push({ id: nextId(next, "l"), kind: "line", p1: e1, p2: e2 });
  for (const end of [e1, e2]) next.constraints.push({ id: nextId(next, "d"), kind: "distance", a: pointId, b: end, value: round(distance) } as SketchConstraint);
  return next;
}

/** A value to start from: a fifth of the shorter line. */
export function suggestedCornerValue(g: SketchGeometry, pointId: string): number {
  const corner = cornerAt(g, pointId);
  if (!corner) return 5;
  const p = pointPos(g, pointId);
  const shorter = Math.min(...corner.others.map((id) => len(sub(pointPos(g, id), p))));
  return Number(Math.max(0.5, shorter / 5).toPrecision(2));
}
