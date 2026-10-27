/**
 * Drawing directly on a face of a body (as Curic DIO's Line and Rectangle): the maths of the "SnapDims" and of the
 * snapping. While the pointer moves over the face, the distances from the point to the nearest edges of the face,
 * along the face's two axes, are shown; the point snaps to the corners and the middles of the edges, else its
 * distances to those edges are rounded (so the numbers read round); typed distances place it exactly. Pure,
 * in the face's sketch coordinates.
 */
import type { Vec2 } from "./edit";
import { inwardDistance, nearestEdge, polygonEdges, sideDistances } from "./face-strip";

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

// ---- typed values (the value box at the bottom, as SketchUp's) ------------------------------------

/**
 * What was typed in the value box: numbers separated by « ; » or spaces, an empty one left to the pointer
 * ("120;" sets the first, ";45" the second). Decimal comma or point; null for what is not a number.
 */
export function parseTyped(text: string, parse: (s: string) => number | null): (number | null)[] {
  const t = text.trim();
  if (t === "") return [];
  return t.split(/\s*;\s*|\s+/).map((p) => (p === "" ? null : parse(p)));
}

// ---- offset of a contour ----------------------------------------------------------------------

const cross2 = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];

function signedArea(poly: Vec2[]): number {
  return poly.reduce((s, p, i) => s + cross2(p, poly[(i + 1) % poly.length] as Vec2), 0) / 2;
}

function crosses(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1: Vec2 = [p2[0] - p1[0], p2[1] - p1[1]];
  const d2: Vec2 = [p4[0] - p3[0], p4[1] - p3[1]];
  const den = cross2(d1, d2);
  if (Math.abs(den) < 1e-12) return false;
  const w: Vec2 = [p3[0] - p1[0], p3[1] - p1[1]];
  const t = cross2(w, d2) / den;
  const u = cross2(w, d1) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/**
 * The polygon moved by `distance` (mm): inward when positive, outward when negative, corners mitred (the offset lines
 * of neighbouring edges meet). Null when the result is not a proper polygon any more: the distance is too large for
 * the shape, or it makes the outline cross itself.
 */
export function offsetPolygon(poly: Vec2[], distance: number): Vec2[] | null {
  const n = poly.length;
  if (n < 3 || !Number.isFinite(distance)) return null;
  if (Math.abs(distance) < 1e-9) return poly.map((p) => [...p] as Vec2);
  const ccw = signedArea(poly) > 0;
  // Offset line of each edge: a point on it and its direction; the inward normal is on the left for a counter-clockwise polygon.
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n] as Vec2;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) return null;
    const dir: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const left: Vec2 = [-dir[1], dir[0]];
    const inward: Vec2 = ccw ? left : [-left[0], -left[1]];
    return { point: [a[0] + inward[0] * distance, a[1] + inward[1] * distance] as Vec2, dir };
  });
  if (lines.some((l) => l === null)) return null;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i + n - 1) % n]!;
    const next = lines[i]!;
    const den = cross2(prev.dir, next.dir);
    if (Math.abs(den) < 1e-9) {
      // Collinear neighbours: the vertex slides along the shifted line.
      out.push([...next.point] as Vec2);
      continue;
    }
    const w: Vec2 = [next.point[0] - prev.point[0], next.point[1] - prev.point[1]];
    const t = cross2(w, next.dir) / den;
    out.push([prev.point[0] + prev.dir[0] * t, prev.point[1] + prev.dir[1] * t]);
  }
  // A proper result keeps its orientation, has an area, and does not cross itself.
  const area = signedArea(out);
  if (Math.abs(area) < 1e-6 || area > 0 !== ccw) return null;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1) && crosses(out[i] as Vec2, out[(i + 1) % n] as Vec2, out[j] as Vec2, out[(j + 1) % n] as Vec2)) return null;
  return out.map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))] as Vec2);
}

/** How far the point is from the nearest edge of the face, positive inside and negative outside: the offset the pointer asks for. */
export function pointerOffset(poly: Vec2[], p: Vec2): number {
  const near = nearestEdge(poly, p);
  return near ? inwardDistance(poly, near.edge, p) : 0;
}
