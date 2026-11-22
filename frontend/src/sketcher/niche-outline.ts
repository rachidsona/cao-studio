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

/** The lines of the walls' faces square to the sketch's plane, from their meshes (each face's first triangle). */
export function wallLines(frame: SketchFrame, meshes: readonly { vertices: ArrayLike<number>; indices: ArrayLike<number>; faceGroups: readonly { start: number; count: number }[] }[]): WallLine[] {
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
      const rel: Vec3 = [a[0] - frame.origin[0], a[1] - frame.origin[1], a[2] - frame.origin[2]];
      out.push({ p: [dot(rel, frame.u), dot(rel, frame.v)], n: [nu / k, nv / k] });
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
