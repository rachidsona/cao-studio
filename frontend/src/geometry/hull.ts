/**
 * L'enveloppe convexe d'un nuage de points (quelques dizaines au plus : les coins de deux faces) : ses faces, chacune
 * un polygone dont les coins tournent dans le sens direct vu du dehors. « Prolonger élément », « Couvrir la face
 * d'arrivée » : le solide qui relie une face à toute la face d'arrivée (features/face-until.ts).
 */
import type { Vec3 } from "../document/types";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The corners of the convex polygon around 2D points, counterclockwise, points on its sides left out. */
function hull2d(points: [number, number, number][]): number[] {
  const order = points.map((_, i) => i).sort((a, b) => points[a]![0] - points[b]![0] || points[a]![1] - points[b]![1]);
  const turn = (o: number, a: number, b: number) => {
    const [p, q, r] = [points[o]!, points[a]!, points[b]!];
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  };
  const chain = (list: number[]) => {
    const out: number[] = [];
    for (const i of list) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, i) <= 1e-9) out.pop();
      out.push(i);
    }
    return out.slice(0, -1);
  };
  return [...chain(order), ...chain([...order].reverse())];
}

/** The faces of the convex hull of `points`; null when they are all in one plane (no volume). */
export function convexHull(points: readonly Vec3[]): Vec3[][] | null {
  const size = Math.max(1, ...points.flatMap((p) => p.map(Math.abs)));
  const eps = size * 1e-7;
  const pts = points.filter((p, i) => points.findIndex((q) => Math.hypot(...sub(p, q)) < eps) === i);
  const planes: { n: Vec3; d: number }[] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      for (let k = j + 1; k < pts.length; k++) {
        const raw = cross(sub(pts[j]!, pts[i]!), sub(pts[k]!, pts[i]!));
        if (Math.hypot(...raw) < eps * size) continue;
        let n = unit(raw);
        const s = pts.map((p) => dot(n, sub(p, pts[i]!)));
        if (Math.min(...s) >= -eps) n = [-n[0], -n[1], -n[2]];
        else if (Math.max(...s) > eps) continue;
        const d = dot(n, pts[i]!);
        if (!planes.some((p) => dot(p.n, n) > 1 - 1e-9 && Math.abs(p.d - d) < eps)) planes.push({ n, d });
      }
  if (planes.length < 4) return null;
  return planes.map(({ n, d }) => {
    const on = pts.filter((p) => Math.abs(dot(n, p) - d) < eps);
    // A frame of the plane, u × v = n: counterclockwise in it is seen from outside.
    const u = unit(cross(Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], n));
    const v = cross(n, u);
    return hull2d(on.map((p) => [dot(p, u), dot(p, v), 0])).map((i) => on[i]!);
  });
}
