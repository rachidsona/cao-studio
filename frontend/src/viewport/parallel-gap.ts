/**
 * The distance between two straight edges that are parallel (the two faces of a panel, a niche's width): the
 * perpendicular distance between their lines, with where to draw it (from the middle of the first edge, square to
 * the second). Pure.
 */
import * as THREE from "three";

export interface ParallelGap {
  distance: number;
  /** On the first edge (its middle). */
  from: THREE.Vector3;
  /** Its foot on the line of the second edge. */
  to: THREE.Vector3;
}

/** The direction of a tessellated edge when it is straight (all its points on one line), else null. */
function straight(points: THREE.Vector3[]): { start: THREE.Vector3; dir: THREE.Vector3; mid: THREE.Vector3 } | null {
  if (points.length < 2) return null;
  const start = points[0] as THREE.Vector3;
  // The farthest point from the start gives the line (the segments may come in any order).
  const end = points.reduce((far, p) => (p.distanceToSquared(start) > far.distanceToSquared(start) ? p : far), start);
  const length = end.distanceTo(start);
  if (length < 1e-9) return null;
  const dir = end.clone().sub(start).divideScalar(length);
  const off = (p: THREE.Vector3) => p.clone().sub(start).cross(dir).length();
  if (points.some((p) => off(p) > 1e-6 * Math.max(1, length))) return null;
  return { start, dir, mid: start.clone().lerp(end, 0.5) };
}

/** The gap between two edges, when both are straight and parallel and not on one line; else null. */
export function parallelGap(a: THREE.Vector3[], b: THREE.Vector3[]): ParallelGap | null {
  const la = straight(a);
  const lb = straight(b);
  if (!la || !lb) return null;
  if (la.dir.clone().cross(lb.dir).length() > 1e-6) return null;
  const to = lb.start.clone().addScaledVector(lb.dir, la.mid.clone().sub(lb.start).dot(lb.dir));
  const distance = la.mid.distanceTo(to);
  return distance < 1e-6 ? null : { distance, from: la.mid.clone(), to };
}
