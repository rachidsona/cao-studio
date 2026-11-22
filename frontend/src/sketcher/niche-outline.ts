/**
 * La niche d'un corps aménagé, vue comme elle est : un rectangle de la Répartition qui touche le bord de l'ouverture
 * va jusqu'aux parois du corps, même en biais (features/within-walls.ts fait de même pour ce qui y est posé). Les
 * parois sont les lignes où leurs faces coupent le plan de l'esquisse ; la niche est le rectangle prolongé de ce côté,
 * recoupé par chacune. Pur.
 */
import type { SketchFrame } from "./frame";
import type { NicheBox } from "./shelves";

type Vec2 = [number, number];
type Vec3 = [number, number, number];
/** A wall's face in the sketch's plane: a point of its line and its normal (both in u, v). */
export interface WallLine {
  p: Vec2;
  n: Vec2;
}

/** Closer than this to the edge of the opening, a side of the niche is on it (mm). */
const TOUCH = 0.5;
/** How far a side on the opening is drawn out before the walls cut it (mm). */
const FAR = 1e5;

/** How long the segment from `a` to `b` runs inside the box (u0, v0, u1, v1), widened by TOUCH (Liang–Barsky). */
function lengthInside(a: Vec2, b: Vec2, [u0, v0, u1, v1]: readonly [number, number, number, number]): number {
  let [t0, t1] = [0, 1];
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [[-d[0], a[0] - (u0 - TOUCH)], [d[0], u1 + TOUCH - a[0]], [-d[1], a[1] - (v0 - TOUCH)], [d[1], v1 + TOUCH - a[1]]] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(...d) : 0;
}

/**
 * The lines of the walls' faces square to the sketch's plane, from their meshes. `box`: the opening — only faces that
 * run along it count (not a mitre at a corner, nor the end of a board: their lines would cut across the niche).
 */
export function wallLines(frame: SketchFrame, meshes: readonly { vertices: ArrayLike<number>; indices: ArrayLike<number>; faceGroups: readonly { start: number; count: number }[] }[], box?: readonly [number, number, number, number]): WallLine[] {
  const dot = (a: Vec3, b: readonly number[]) => a[0] * b[0]! + a[1] * b[1]! + a[2] * b[2]!;
  const out: WallLine[] = [];
  for (const m of meshes) {
    const at = (k: number): Vec3 => [0, 1, 2].map((i) => m.vertices[3 * m.indices[k]! + i]!) as Vec3;
    for (const g of m.faceGroups) {
      if (g.count < 3) continue;
      const [a, b, c] = [at(g.start), at(g.start + 1), at(g.start + 2)];
      const e: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const f: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: Vec3 = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
      const l = Math.hypot(...n);
      if (l < 1e-9 || Math.abs(dot(n, frame.normal)) / l > 0.1) continue;
      const nu = dot(n, frame.u) / l;
      const nv = dot(n, frame.v) / l;
      const k = Math.hypot(nu, nv);
      const uv = (q: Vec3): Vec2 => {
        const rel: Vec3 = [q[0] - frame.origin[0], q[1] - frame.origin[1], q[2] - frame.origin[2]];
        return [dot(rel, frame.u), dot(rel, frame.v)];
      };
      const line: WallLine = { p: uv(a), n: [nu / k, nv / k] };
      if (box) {
        // The face's extent along its line, in the sketch's plane.
        const along: Vec2 = [-line.n[1], line.n[0]];
        const ts = Array.from({ length: g.count }, (_, i) => uv(at(g.start + i))).map((q) => (q[0] - line.p[0]) * along[0] + (q[1] - line.p[1]) * along[1]);
        const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
        const end = (t: number): Vec2 => [line.p[0] + along[0] * t, line.p[1] + along[1] * t];
        if (lengthInside(end(t0), end(t1), box) < 1) continue;
      }
      out.push(line);
    }
  }
  return out;
}

/** The polygon kept on the side of `line` where `inside` is (Sutherland–Hodgman, one edge). */
function clip(polygon: Vec2[], line: WallLine, inside: Vec2): Vec2[] {
  const side = (q: Vec2) => (q[0] - line.p[0]) * line.n[0] + (q[1] - line.p[1]) * line.n[1];
  const sign = side(inside) >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const [sa, sb] = [sign * side(a), sign * side(b)];
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return out;
}

/**
 * The niche as it is between the walls: its sides on the opening drawn out and cut by them; null when it touches
 * none (a rectangle, as it is) or nothing is left.
 */
export function nicheOutline(box: NicheBox, [u0, v0, u1, v1]: readonly [number, number, number, number], lines: readonly WallLine[]): Vec2[] | null {
  const ends = { x0: Math.abs(box.x0 - u0) < TOUCH, x1: Math.abs(box.x1 - u1) < TOUCH, y0: Math.abs(box.y0 - v0) < TOUCH, y1: Math.abs(box.y1 - v1) < TOUCH };
  if (!Object.values(ends).some(Boolean) || !lines.length) return null;
  const [x0, x1] = [ends.x0 ? box.x0 - FAR : box.x0, ends.x1 ? box.x1 + FAR : box.x1];
  const [y0, y1] = [ends.y0 ? box.y0 - FAR : box.y0, ends.y1 ? box.y1 + FAR : box.y1];
  const middle: Vec2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  let polygon: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (const line of lines) {
    polygon = clip(polygon, line, middle);
    if (polygon.length < 3) return null;
  }
  // Still drawn out far: a side with no wall to stop it, the rectangle then.
  return polygon.some(([u, v]) => Math.abs(u) > FAR / 2 || Math.abs(v) > FAR / 2) ? null : polygon;
}

/**
 * The lines of a body furnished's sketch as they are between its walls: those on the edge of the opening (or out of
 * it) left out — the walls are there —, the others drawn out from an end on that edge and cut by the walls (a
 * shelf's line meets the slanted side). Other curves (arcs, texts) as they are.
 */
export function linesBetweenWalls<C extends { points: Vec2[] }>(curves: readonly C[], [u0, v0, u1, v1]: readonly [number, number, number, number], lines: readonly WallLine[]): C[] {
  if (!lines.length) return [...curves];
  const out = (p: Vec2) => [p[0] <= u0 + TOUCH, p[0] >= u1 - TOUCH, p[1] <= v0 + TOUCH, p[1] >= v1 - TOUCH];
  return curves.flatMap((curve) => {
    if (curve.points.length !== 2) return [curve];
    const [a, b] = curve.points as [Vec2, Vec2];
    // On the edge of the opening, or past it: the wall stands there.
    const [oa, ob] = [out(a), out(b)];
    if (oa.some((o, i) => o && ob[i])) return [];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) return [curve];
    const d: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    // Drawn out from each end on the edge, then kept on the inside of every wall (the side of its middle).
    let [t0, t1] = [oa.some(Boolean) ? -FAR : 0, ob.some(Boolean) ? length + FAR : length];
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const line of lines) {
      const side = (q: Vec2) => (q[0] - line.p[0]) * line.n[0] + (q[1] - line.p[1]) * line.n[1];
      const sign = side(middle) >= 0 ? 1 : -1;
      const s0 = sign * side(a);
      const rate = sign * (d[0] * line.n[0] + d[1] * line.n[1]);
      if (Math.abs(rate) < 1e-12) continue;
      // Where the line's side changes along the curve: past it, the wall.
      const t = -s0 / rate;
      if (rate > 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (t1 - t0 < 1e-6 || t0 < -FAR / 2 || t1 > length + FAR / 2) return [curve];
    return [{ ...curve, points: [[a[0] + d[0] * t0, a[1] + d[1] * t0], [a[0] + d[0] * t1, a[1] + d[1] * t1]] }];
  });
}

/**
 * The areas of a body furnished's sketch as they are between its walls: those out in the walls (the band round the
 * opening) left out, a rectangle on the edge of the opening drawn to the walls as its niche (`nicheOutline`); the
 * others as they are.
 */
export function regionsBetweenWalls(regions: readonly { outer: Vec2[]; holes: Vec2[][] }[], box: readonly [number, number, number, number], lines: readonly WallLine[]): { outer: Vec2[]; holes: Vec2[][] }[] {
  if (!lines.length) return [...regions];
  const [u0, v0, u1, v1] = box;
  return regions.flatMap((region) => {
    const us = region.outer.map((p) => p[0]);
    const vs = region.outer.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    // Out in the walls: they are there.
    if (x0 < u0 - TOUCH || x1 > u1 + TOUCH || y0 < v0 - TOUCH || y1 > v1 + TOUCH) return [];
    const square = region.outer.length === 4 && !region.holes.length && region.outer.every(([u, v]) => (Math.abs(u - x0) < 1e-6 || Math.abs(u - x1) < 1e-6) && (Math.abs(v - y0) < 1e-6 || Math.abs(v - y1) < 1e-6));
    const outline = square ? nicheOutline({ x0, y0, x1, y1 }, box, lines) : null;
    return [outline ? { outer: outline, holes: [] } : region];
  });
}
