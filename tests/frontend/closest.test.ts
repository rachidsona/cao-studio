/** Mètre : plus courte distance entre points, arêtes, faces et corps, et angle de deux faces ou traits. */
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../frontend/src/document/types";
import { angleBetween, closestBetween, planeNormal, pointOnTriangle, segmentsClosest, type MeasureShape } from "../../frontend/src/measurements/closest";

const point = (p: Vec3): MeasureShape => ({ points: [p], segments: [], triangles: [] });
const segment = (a: Vec3, b: Vec3): MeasureShape => ({ points: [a, b], segments: [[a, b]], triangles: [] });
/** A rectangle in the plane z, from (x0, y0) to (x1, y1), as two triangles. */
function rect(x0: number, y0: number, x1: number, y1: number, z: number): MeasureShape {
  const [a, b, c, d]: [Vec3, Vec3, Vec3, Vec3] = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  return { points: [a, b, c, d], segments: [[a, b], [b, c], [c, d], [d, a]], triangles: [[a, b, c], [a, c, d]] };
}
/** A box as its 12 triangles and 12 edges. */
function box(lo: Vec3, hi: Vec3): MeasureShape {
  const p = (i: number): Vec3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const quads = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  const triangles = quads.flatMap(([a, b, c, d]) => [[p(a!), p(b!), p(c!)], [p(a!), p(c!), p(d!)]] as [Vec3, Vec3, Vec3][]);
  const segments: [Vec3, Vec3][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => [p(a!), p(b!)]);
  return { points: Array.from({ length: 8 }, (_, i) => p(i)), segments, triangles };
}

describe("plus courte distance", () => {
  it("point et point, point et triangle, deux segments", () => {
    expect(closestBetween(point([0, 0, 0]), point([3, 4, 0])).distance).toBe(5);
    pointOnTriangle([0.2, 0.2, 5], [0, 0, 0], [1, 0, 0], [0, 1, 0]).forEach((v, i) => expect(v).toBeCloseTo([0.2, 0.2, 0][i]!, 12));
    const [a, b] = segmentsClosest([0, 0, 0], [10, 0, 0], [5, -5, 3], [5, 5, 3]);
    expect(a).toEqual([5, 0, 0]);
    expect(b).toEqual([5, 0, 3]);
  });

  it("deux traits croisés à distance, deux traits parallèles", () => {
    expect(closestBetween(segment([0, 0, 0], [10, 0, 0]), segment([5, -5, 3], [5, 5, 3])).distance).toBe(3);
    expect(closestBetween(segment([0, 0, 0], [10, 0, 0]), segment([2, 7, 0], [8, 7, 0])).distance).toBe(7);
  });

  it("deux faces parallèles : leur écart ; décalées : la distance de leurs bords", () => {
    expect(closestBetween(rect(0, 0, 100, 100, 0), rect(20, 20, 80, 80, 18)).distance).toBe(18);
    expect(closestBetween(rect(0, 0, 100, 100, 0), rect(130, 0, 200, 100, 40)).distance).toBeCloseTo(50, 9);
  });

  it("deux corps : l'écart entre deux planches, zéro quand elles se touchent", () => {
    const side = box([0, 0, 0], [18, 560, 720]);
    const other = box([600, 0, 0], [618, 560, 720]);
    const near = closestBetween(side, other);
    expect(near.distance).toBe(582);
    expect(near.from[0]).toBe(18);
    expect(near.to[0]).toBe(600);
    expect(closestBetween(side, box([18, 0, 0], [582, 560, 18])).distance).toBe(0);
  });

  it("l'angle de deux faces planes", () => {
    const n1 = planeNormal(rect(0, 0, 1, 1, 0).triangles)!;
    const n2 = planeNormal([[[0, 0, 0], [0, 1, 0], [0, 0, 1]]])!;
    expect(angleBetween(n1, n2)).toBeCloseTo(90, 9);
    expect(angleBetween(n1, planeNormal(rect(0, 0, 1, 1, 5).triangles)!)).toBe(0);
    expect(planeNormal([...rect(0, 0, 1, 1, 0).triangles, [[0, 0, 0], [0, 1, 0], [0, 0, 1]]])).toBeNull();
  });
});
