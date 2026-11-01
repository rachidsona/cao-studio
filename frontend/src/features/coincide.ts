/**
 * « Coïncidence » dans le modèle : un point de ce qu'on déplace (une esquisse ou un corps) vient sur un point, ou sur
 * un trait (une ligne d'esquisse, une arête de corps). Sur un trait, au plus près (le point ne fait que le chemin le
 * plus court, comme la contrainte d'une esquisse), ou à l'endroit cliqué. Ou sur une face plane : au plus près (le long
 * de sa perpendiculaire, ce qu'on déplace vient dans son plan), ou à l'endroit cliqué. Et l'ajustement à la niche :
 * une pièce calée entre deux voisines (une étagère entre ses côtés) se recale, élargie ou raccourcie, entre celles de
 * l'endroit où elle arrive, avec les mêmes jeux. Pur.
 */
import type { Axis, Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

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
export function coincideMove(source: Vec3, target: { point: Vec3 } | { trait: Vec3[]; pairs?: boolean; clicked?: Vec3 } | { plane: Vec3; normal: Vec3; clicked?: Vec3 }): Vec3 {
  if ("plane" in target) {
    if (target.clicked) return sub(target.clicked, source);
    const n = target.normal;
    const d = dot(sub(target.plane, source), n) / (dot(n, n) || 1);
    // `+ 0` turns −0 into 0.
    return [n[0] * d + 0, n[1] * d + 0, n[2] * d + 0];
  }
  const onto = "point" in target ? target.point : (target.clicked ?? closestOnPolyline(source, target.trait, target.pairs) ?? source);
  return sub(onto, source);
}

/** Do two intervals overlap by more than half a millimetre? */
const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.5;

/**
 * The walls around a box along an axis: the nearest faces of the other boxes that face it on each side (they overlap
 * it across the two other axes), or null when a side is open. A box across its middle is no wall.
 */
export function wallsAround(box: Box, others: readonly Box[], axis: Axis): [number, number] | null {
  const across = ([0, 1, 2] as Axis[]).filter((i) => i !== axis);
  const middle = (box[0][axis] + box[1][axis]) / 2;
  let [low, high] = [-Infinity, Infinity];
  for (const o of others) {
    if (!across.every((i) => overlaps(box[0][i], box[1][i], o[0][i], o[1][i]))) continue;
    if (o[1][axis] <= middle) low = Math.max(low, o[1][axis]);
    else if (o[0][axis] >= middle) high = Math.min(high, o[0][axis]);
  }
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}

/** The axes along which a box is held between two walls (within `tolerance` mm on each side), with its gaps to them. */
export function snugAxes(box: Box, others: readonly Box[], tolerance = 2): { axis: Axis; gaps: [number, number] }[] {
  return ([0, 1, 2] as Axis[]).flatMap((axis) => {
    const walls = wallsAround(box, others, axis);
    if (!walls) return [];
    const gaps: [number, number] = [box[0][axis] - walls[0], walls[1] - box[1][axis]];
    return gaps.every((g) => g >= -0.01 && g <= tolerance) ? [{ axis, gaps }] : [];
  });
}

/**
 * Where a box comes along each axis it was held on, between the walls of where it now is, with the same gaps: its
 * interval from → to (only the axes where it changes).
 */
export function fitInNiche(box: Box, others: readonly Box[], snug: readonly { axis: Axis; gaps: [number, number] }[]): { axis: Axis; from: [number, number]; to: [number, number] }[] {
  return snug.flatMap(({ axis, gaps }) => {
    const walls = wallsAround(box, others, axis);
    if (!walls) return [];
    const to: [number, number] = [walls[0] + gaps[0], walls[1] - gaps[1]];
    const from: [number, number] = [box[0][axis], box[1][axis]];
    if (to[1] - to[0] < 1 || (Math.abs(to[0] - from[0]) < 1e-3 && Math.abs(to[1] - from[1]) < 1e-3)) return [];
    return [{ axis, from, to }];
  });
}
