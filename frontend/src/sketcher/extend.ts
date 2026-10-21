/**
 * "Prolonger" (Extend) of the sketch, as in Fusion: the end of a line or an
 * arc nearest the pointer is lengthened, along the line or around the arc's
 * circle, up to the first curve it meets (a line, a circle, an arc, including
 * construction and projected geometry). The end then lies on that curve, and
 * a point-on-curve constraint keeps it there.
 *
 * An end shared with another curve (a corner), or tied to one by a
 * coincidence, is extended too, as in Fusion: the extended curve gets an end
 * point of its own, and the other curve keeps the corner where it was. Pure
 * functions on the geometry; the sketch mode solves and stores the result.
 */
import { curvePoints, type ArcCurve, type SketchConstraint, type SketchCurve, type SketchGeometry } from "../document/sketch";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Preview } from "./tools";

const EPS = 1e-6;
const TWO_PI = 2 * Math.PI;

export interface Extension {
  curveId: string;
  /** The end point that moves. */
  pointId: string;
  to: Vec2;
  /** Curve the end reaches. */
  target: string;
  /** For an arc: its new start or end angle (radians). */
  angle?: { which: "startAngle" | "endAngle"; value: number };
  /** The end is shared with (or tied to) another curve: it is detached, the other curve keeps the old point. */
  detach: boolean;
  preview: Preview;
}

const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Whether `angle` lies on the arc (counter-clockwise from its start to its end). */
function onArc(arc: ArcCurve, angle: number): boolean {
  const sweep = norm(arc.endAngle - arc.startAngle) || TWO_PI;
  return norm(angle - arc.startAngle) <= sweep + 1e-9;
}

/** Points where the circle (c, r) meets the curve `other`. */
function circleHits(g: SketchGeometry, c: Vec2, r: number, other: SketchCurve): Vec2[] {
  if (other.kind === "line") {
    const a = pointPos(g, other.p1);
    const b = pointPos(g, other.p2);
    const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const f: Vec2 = [a[0] - c[0], a[1] - c[1]];
    const A = d[0] * d[0] + d[1] * d[1];
    const B = 2 * (f[0] * d[0] + f[1] * d[1]);
    const C = f[0] * f[0] + f[1] * f[1] - r * r;
    const disc = B * B - 4 * A * C;
    if (A < EPS || disc < 0) return [];
    const roots = disc === 0 ? [-B / (2 * A)] : [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)];
    return roots.filter((s) => s >= -1e-9 && s <= 1 + 1e-9).map((s) => [a[0] + s * d[0], a[1] + s * d[1]] as Vec2);
  }
  const c2 = pointPos(g, other.center);
  const d = dist(c, c2);
  if (d < EPS || d > r + other.radius + 1e-9 || d < Math.abs(r - other.radius) - 1e-9) return [];
  const a = (r * r - other.radius * other.radius + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const m: Vec2 = [c[0] + (a * (c2[0] - c[0])) / d, c[1] + (a * (c2[1] - c[1])) / d];
  const pts: Vec2[] = [
    [m[0] + (h * (c2[1] - c[1])) / d, m[1] - (h * (c2[0] - c[0])) / d],
    [m[0] - (h * (c2[1] - c[1])) / d, m[1] + (h * (c2[0] - c[0])) / d],
  ];
  return other.kind === "circle" ? pts : pts.filter((p) => onArc(other, Math.atan2(p[1] - c2[1], p[0] - c2[0])));
}

/** Smallest t > 0 where the ray from `o` along `d` (unit) meets the curve `other`, or null. */
function rayHit(g: SketchGeometry, o: Vec2, d: Vec2, other: SketchCurve): number | null {
  let best: number | null = null;
  const keep = (t: number) => {
    if (t > EPS && (best === null || t < best)) best = t;
  };
  if (other.kind === "line") {
    const a = pointPos(g, other.p1);
    const b = pointPos(g, other.p2);
    const e: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const denom = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(denom) < 1e-12) return null; // parallel: never met
    const w: Vec2 = [a[0] - o[0], a[1] - o[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / denom;
    const s = (w[0] * d[1] - w[1] * d[0]) / denom;
    if (s >= -1e-9 && s <= 1 + 1e-9) keep(t);
    return best;
  }
  const c = pointPos(g, other.center);
  const f: Vec2 = [o[0] - c[0], o[1] - c[1]];
  const B = 2 * (f[0] * d[0] + f[1] * d[1]);
  const C = f[0] * f[0] + f[1] * f[1] - other.radius * other.radius;
  const disc = B * B - 4 * C;
  if (disc < 0) return null;
  for (const t of [(-B - Math.sqrt(disc)) / 2, (-B + Math.sqrt(disc)) / 2]) {
    if (other.kind === "arc") {
      const p: Vec2 = [o[0] + t * d[0], o[1] + t * d[1]];
      if (!onArc(other, Math.atan2(p[1] - c[1], p[0] - c[0]))) continue;
    }
    keep(t);
  }
  return best;
}

/** Why the end `pointId` cannot be extended (a fixed, projected point), or null. */
function fixedEnd(g: SketchGeometry, pointId: string): string | null {
  return g.points.find((p) => p.id === pointId)?.fixed ? "Cette extrémité est fixe (géométrie projetée) : elle ne peut pas être prolongée." : null;
}

/** Whether the end is shared with another curve or tied to one by a coincidence. */
function connected(g: SketchGeometry, curveId: string, pointId: string): boolean {
  return (
    g.curves.some((c) => c.id !== curveId && curvePoints(c).includes(pointId)) ||
    g.constraints.some((c: SketchConstraint) => c.kind === "coincident" && (c.a === pointId || c.b === pointId))
  );
}

/**
 * The extension of the end of `curveId` nearest `cursor` up to the first curve it meets; a reason (string)
 * when that end cannot be extended or meets nothing; null for a curve that has no end (a circle).
 */
export function findExtension(g: SketchGeometry, curveId: string, cursor: Vec2): Extension | string | null {
  const curve = g.curves.find((c) => c.id === curveId);
  if (!curve || curve.kind === "circle") return null;
  const others = g.curves.filter((c) => c.id !== curveId);

  if (curve.kind === "line") {
    const a = pointPos(g, curve.p1);
    const b = pointPos(g, curve.p2);
    const atStart = dist(cursor, a) < dist(cursor, b);
    const [from, end, pointId] = atStart ? [b, a, curve.p1] : [a, b, curve.p2];
    const reason = fixedEnd(g, pointId);
    if (reason) return reason;
    const len = dist(from, end);
    if (len < EPS) return null;
    const d: Vec2 = [(end[0] - from[0]) / len, (end[1] - from[1]) / len];
    let best: { t: number; target: string } | null = null;
    for (const other of others) {
      const t = rayHit(g, end, d, other);
      if (t !== null && (!best || t < best.t)) best = { t, target: other.id };
    }
    if (!best) return "Aucune courbe à atteindre dans le prolongement de cette ligne.";
    const to: Vec2 = [end[0] + best.t * d[0], end[1] + best.t * d[1]];
    return { curveId, pointId, to, target: best.target, detach: connected(g, curveId, pointId), preview: { lines: [[end, to]], circles: [], arcs: [] } };
  }

  // Arc: extend around its circle, past its end (counter-clockwise) or before its start (clockwise).
  const c = pointPos(g, curve.center);
  const atStart = dist(cursor, pointPos(g, curve.start)) < dist(cursor, pointPos(g, curve.end));
  const pointId = atStart ? curve.start : curve.end;
  const reason = fixedEnd(g, pointId);
  if (reason) return reason;
  const sweep = norm(curve.endAngle - curve.startAngle) || TWO_PI;
  const room = TWO_PI - sweep; // beyond that, the arc would overlap itself
  let best: { delta: number; target: string; at: Vec2 } | null = null;
  for (const other of others) {
    for (const p of circleHits(g, c, curve.radius, other)) {
      const phi = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const delta = atStart ? norm(curve.startAngle - phi) : norm(phi - curve.endAngle);
      if (delta > EPS && delta < room - EPS && (!best || delta < best.delta)) best = { delta, target: other.id, at: p };
    }
  }
  if (!best) return "Aucune courbe à atteindre dans le prolongement de cet arc.";
  const value = atStart ? curve.startAngle - best.delta : curve.endAngle + best.delta;
  const span = atStart ? { start: value, end: curve.startAngle } : { start: curve.endAngle, end: value };
  return {
    curveId,
    pointId,
    to: best.at,
    target: best.target,
    angle: { which: atStart ? "startAngle" : "endAngle", value },
    detach: connected(g, curveId, pointId),
    preview: { lines: [], circles: [], arcs: [{ center: c, radius: curve.radius, start: span.start, end: span.end }] },
  };
}

/** The geometry with the extension made: the end moved onto the target curve, and kept there by a constraint. */
export function applyExtension(g: SketchGeometry, ext: Extension): SketchGeometry {
  const next = cloneGeometry(g);
  let pointId = ext.pointId;
  if (ext.detach) {
    // A new end for the extended curve; the corner stays with the other curve.
    pointId = nextId(next, "p");
    next.points.push({ id: pointId, x: ext.to[0], y: ext.to[1] });
    const curve = next.curves.find((c) => c.id === ext.curveId);
    if (curve?.kind === "line") {
      if (curve.p1 === ext.pointId) curve.p1 = pointId;
      else curve.p2 = pointId;
    } else if (curve?.kind === "arc") {
      if (ext.angle?.which === "startAngle") curve.start = pointId;
      else curve.end = pointId;
    }
  } else {
    const point = next.points.find((p) => p.id === ext.pointId);
    if (point) [point.x, point.y] = ext.to;
  }
  if (ext.angle) {
    const arc = next.curves.find((c) => c.id === ext.curveId);
    if (arc?.kind === "arc") {
      arc[ext.angle.which] = ext.angle.value;
      // Keep the angles in the solver's convention: end after start, less than a full turn apart.
      if (arc.endAngle <= arc.startAngle) arc.endAngle += TWO_PI;
    }
  }
  let n = 1;
  const used = new Set(next.constraints.map((c) => c.id));
  while (used.has(`c${n}`)) n++;
  next.constraints.push({ id: `c${n}`, kind: "pointOnCurve", point: pointId, curve: ext.target });
  return next;
}
