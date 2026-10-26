/**
 * Drawing directly on a face of a body (as Curic DIO's Line and Rectangle): the maths of the "SnapDims" and of the
 * snapping. While the pointer moves over the face, the distances from the point to the nearest edges of the face,
 * along the face's two axes, are shown; the point snaps to the corners and the middles of the edges, else its
 * distances to those edges are rounded (so the numbers read round); typed distances place it exactly. Pure,
 * in the face's sketch coordinates.
 */
import type { Vec2 } from "./edit";
import { polygonEdges, sideDistances } from "./face-strip";

/** The distance from a point to the nearest edge of the face along one axis, with the point where it meets it. */
export interface SnapDim {
  /** 0: measured along X of the face (horizontal), 1: along Y. */
  axis: 0 | 1;
  from: Vec2;
  /** Where the measure meets the edge. */
  to: Vec2;
  distance: number;
  /** +1: the edge is ahead (toward +axis), −1: behind. */
  side: 1 | -1;
}

/** The two measures of a point: to the nearest edge left or right, and to the nearest edge up or down. */
export function snapDims(poly: Vec2[], p: Vec2): SnapDim[] {
  const out: SnapDim[] = [];
  for (const axis of [0, 1] as const) {
    const direction: Vec2 = axis === 0 ? [1, 0] : [0, 1];
    const { back, ahead } = sideDistances(poly, p, direction);
    const candidates = [
      ...(back === null ? [] : [{ distance: back, side: -1 as const }]),
      ...(ahead === null ? [] : [{ distance: ahead, side: 1 as const }]),
    ].sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    if (!nearest) continue;
    out.push({ axis, from: p, to: [p[0] + direction[0] * nearest.side * nearest.distance, p[1] + direction[1] * nearest.side * nearest.distance], distance: nearest.distance, side: nearest.side });
  }
  return out;
}

/** The coordinate on the dimension's axis for a point at `distance` from its edge (the edge side is kept). */
export function coordinateAt(dim: SnapDim, distance: number): number {
  return dim.to[dim.axis] - dim.side * distance;
}

export type SnapKind = "corner" | "middle" | "free";

const roundTo = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(6));

/**
 * Where a pointer position lands on the face: on a corner, or the middle of an edge, within `tolerance`; else the
 * position with its distances to the nearest edges rounded to `step`.
 */
export function snapOnFace(poly: Vec2[], p: Vec2, step: number, tolerance: number): { point: Vec2; kind: SnapKind } {
  let best: { point: Vec2; d: number; kind: SnapKind } | null = null;
  const consider = (point: Vec2, kind: SnapKind) => {
    const d = Math.hypot(point[0] - p[0], point[1] - p[1]);
    if (d <= tolerance && (!best || d < best.d)) best = { point, d, kind };
  };
  for (const { a, b } of polygonEdges(poly)) {
    consider(a, "corner");
    consider([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], "middle");
  }
  if (best) return { point: (best as { point: Vec2 }).point, kind: (best as { kind: SnapKind }).kind };
  const point: Vec2 = [...p];
  for (const dim of snapDims(poly, p)) point[dim.axis] = coordinateAt(dim, roundTo(dim.distance, step));
  return { point, kind: "free" };
}

/** The point with typed distances to the nearest edges (null: the pointer's own), measured from `p`'s edges. */
export function withTypedDistances(poly: Vec2[], p: Vec2, typed: { x?: number | null; y?: number | null }): Vec2 {
  const point: Vec2 = [...p];
  for (const dim of snapDims(poly, p)) {
    const value = dim.axis === 0 ? typed.x : typed.y;
    if (value !== null && value !== undefined) point[dim.axis] = coordinateAt(dim, value);
  }
  return point;
}

/** The point at `length` from `from` in the direction of `toward` (the pointer), or at `angle` degrees when given. */
export function pointAtLength(from: Vec2, toward: Vec2, length: number, angle?: number | null): Vec2 {
  const heading = angle === null || angle === undefined ? Math.atan2(toward[1] - from[1], toward[0] - from[0]) : (angle * Math.PI) / 180;
  return [from[0] + length * Math.cos(heading), from[1] + length * Math.sin(heading)];
}
