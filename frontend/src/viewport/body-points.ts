/** Points of a tessellated body that can be picked: the corners (B-rep vertices) where its edges start and end. */
import type { BodyMesh } from "../geometry/protocol";

export type Point3 = [number, number, number];

/** Two corners closer than this (mm) are one point. */
export const SAME_POINT = 1e-3;

export function samePoint(a: Point3, b: Point3): boolean {
  return Math.abs(a[0] - b[0]) < SAME_POINT && Math.abs(a[1] - b[1]) < SAME_POINT && Math.abs(a[2] - b[2]) < SAME_POINT;
}

/** Adds `p` to `into` unless a point at the same place is already there. */
export function addDistinct(into: Point3[], p: Point3): void {
  if (!into.some((q) => samePoint(q, p))) into.push(p);
}

/** End points of every edge of the body, merged by position (a full circle has one, at its seam). */
export function bodyVertices(mesh: BodyMesh): Point3[] {
  const points: Point3[] = [];
  const at = (index: number): Point3 => [mesh.edges[index * 3] as number, mesh.edges[index * 3 + 1] as number, mesh.edges[index * 3 + 2] as number];
  for (const group of mesh.edgeGroups) {
    if (group.count < 1) continue;
    addDistinct(points, at(group.start));
    addDistinct(points, at(group.start + group.count - 1));
  }
  return points;
}
