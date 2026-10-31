/**
 * « Coïncidence » dans le modèle : un point de ce qu'on déplace (une esquisse ou un corps) vient sur un point, ou sur
 * un trait (une ligne d'esquisse, une arête de corps). Sur un trait, au plus près (le point ne fait que le chemin le
 * plus court, comme la contrainte d'une esquisse), ou à l'endroit cliqué. Pur.
 */
import type { Vec3 } from "../document/types";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (a: Vec3, d: Vec3, t: number): Vec3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

/** The point of the segment a–b nearest to p. */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const d = sub(b, a);
  const len = dot(d, d);
  if (len < 1e-12) return [...a];
  return at(a, d, Math.min(1, Math.max(0, dot(sub(p, a), d) / len)));
}

/** The point of a polyline (consecutive segments, or pairs when `pairs`) nearest to p. */
export function closestOnPolyline(p: Vec3, points: Vec3[], pairs = false): Vec3 | null {
  let best: Vec3 | null = null;
  let distance = Infinity;
  for (let i = 0; i + 1 < points.length; i += pairs ? 2 : 1) {
    const q = closestOnSegment(p, points[i]!, points[i + 1]!);
    const d = Math.hypot(...sub(q, p));
    if (d < distance) [best, distance] = [q, d];
  }
  return best;
}

/** The point of the segment a–b nearest to a ray (from `origin` along `direction`): where the pointer meets a trait. */
export function segmentNearRay(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3): Vec3 {
  const u = sub(b, a);
  const w = sub(a, origin);
  const [uu, uv, vv, uw, vw] = [dot(u, u), dot(u, direction), dot(direction, direction), dot(u, w), dot(direction, w)];
  const det = uu * vv - uv * uv;
  // Parallel: any point; the start.
  const s = det < 1e-12 ? 0 : (uv * vw - vv * uw) / det;
  return at(a, u, Math.min(1, Math.max(0, s)));
}

/** The move that brings `source` onto a point, or onto a trait (nearest, or the point clicked on it). */
export function coincideMove(source: Vec3, target: { point: Vec3 } | { trait: Vec3[]; pairs?: boolean; clicked?: Vec3 }): Vec3 {
  const onto = "point" in target ? target.point : (target.clicked ?? closestOnPolyline(source, target.trait, target.pairs) ?? source);
  return sub(onto, source);
}
