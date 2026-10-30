/**
 * Distance minimale entre deux éléments du modèle (points, arêtes, faces, corps), donnés par leurs points, segments
 * et triangles (le maillage du noyau) : la plus courte distance entre deux maillages est atteinte entre un sommet et
 * un triangle, ou entre deux segments ; on retient aussi les deux points les plus proches, pour tracer la cote.
 * Algorithmes de C. Ericson, « Real-Time Collision Detection » (point-segment, segment-segment, point-triangle).
 */
import type { Vec3 } from "../document/types";

export interface MeasureShape {
  points: Vec3[];
  segments: [Vec3, Vec3][];
  triangles: [Vec3, Vec3, Vec3][];
}

export interface Closest {
  distance: number;
  from: Vec3;
  to: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function pointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const len = dot(ab, ab);
  return len < 1e-12 ? a : add(a, mul(ab, clamp(dot(sub(p, a), ab) / len)));
}

/** The closest points of two segments. */
export function segmentsClosest(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): [Vec3, Vec3] {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;
  if (a < 1e-12 && e < 1e-12) return [p1, p2];
  if (a < 1e-12) {
    s = 0;
    t = clamp(f / e);
  } else {
    const c = dot(d1, r);
    if (e < 1e-12) {
      t = 0;
      s = clamp(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  return [add(p1, mul(d1, s)), add(p2, mul(d2, t))];
}

/** The point of triangle abc closest to p. */
export function pointOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}

/** The shortest distance between two shapes, and where it is (from a point of `a` to a point of `b`). */
export function closestBetween(a: MeasureShape, b: MeasureShape): Closest {
  let best: Closest = { distance: Infinity, from: a.points[0] ?? [0, 0, 0], to: b.points[0] ?? [0, 0, 0] };
  const keep = (from: Vec3, to: Vec3) => {
    const d = dist(from, to);
    if (d < best.distance) best = { distance: d, from, to };
  };
  const pointTo = (p: Vec3, shape: MeasureShape, reversed: boolean) => {
    const pair = (q: Vec3) => (reversed ? keep(q, p) : keep(p, q));
    for (const q of shape.points) pair(q);
    for (const [s, e] of shape.segments) pair(pointOnSegment(p, s, e));
    for (const [x, y, z] of shape.triangles) pair(pointOnTriangle(p, x, y, z));
  };
  for (const p of a.points) pointTo(p, b, false);
  for (const p of b.points) pointTo(p, a, true);
  for (const [p1, q1] of a.segments) {
    for (const [p2, q2] of b.segments) {
      const [x, y] = segmentsClosest(p1, q1, p2, q2);
      keep(x, y);
    }
  }
  return { ...best, distance: best.distance < 1e-6 ? 0 : best.distance };
}

/** The unit normal of a flat set of triangles, or null when they are not all in one plane. */
export function planeNormal(triangles: [Vec3, Vec3, Vec3][]): Vec3 | null {
  let normal: Vec3 | null = null;
  for (const [a, b, c] of triangles) {
    const u = sub(b, a);
    const v = sub(c, a);
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n);
    if (l < 1e-9) continue;
    const unit = mul(n, 1 / l);
    if (!normal) normal = unit;
    else if (Math.abs(dot(normal, unit)) < 0.9999) return null;
  }
  return normal;
}

/** The angle between two directions, as lines (0 to 90°). */
export function angleBetween(u: Vec3, v: Vec3): number {
  const c = Math.abs(dot(u, v)) / ((Math.hypot(...u) || 1) * (Math.hypot(...v) || 1));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}
