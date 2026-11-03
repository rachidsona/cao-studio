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

/**
 * The faces (their indices) along an edge: those whose mesh has both its ends among its corners — two, as a rule —,
 * the smaller first (the end of a board before its side).
 */
export function edgeFaces(mesh: BodyMesh, edgeIndex: number): number[] {
  const group = mesh.edgeGroups[edgeIndex];
  if (!group || group.count < 1) return [];
  const at = (index: number): Point3 => [mesh.edges[index * 3] as number, mesh.edges[index * 3 + 1] as number, mesh.edges[index * 3 + 2] as number];
  const ends = [at(group.start), at(group.start + group.count - 1)];
  const vertex = (i: number): Point3 => [mesh.vertices[i * 3] as number, mesh.vertices[i * 3 + 1] as number, mesh.vertices[i * 3 + 2] as number];
  const area = (face: { start: number; count: number }) => {
    let sum = 0;
    for (let k = face.start; k + 2 < face.start + face.count; k += 3) {
      const [a, b, c] = [0, 1, 2].map((t) => vertex(mesh.indices[k + t] as number)) as [Point3, Point3, Point3];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      sum += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
    }
    return sum;
  };
  return mesh.faceGroups
    .flatMap((face, f) => {
      const found = ends.map(() => false);
      for (let k = face.start; k < face.start + face.count; k++) {
        const p = vertex(mesh.indices[k] as number);
        ends.forEach((end, e) => (found[e] ||= samePoint(p, end)));
      }
      return found.every(Boolean) ? [{ f, area: area(face) }] : [];
    })
    .sort((a, b) => a.area - b.area)
    .map(({ f }) => f);
}

/** The middle of an edge (the point halfway along its polyline). */
export function edgeMiddle(mesh: BodyMesh, edgeIndex: number): Point3 | null {
  const group = mesh.edgeGroups[edgeIndex];
  if (!group || group.count < 1) return null;
  const i = group.start + Math.floor((group.count - 1) / 2);
  const j = group.start + Math.ceil((group.count - 1) / 2);
  return [0, 1, 2].map((c) => ((mesh.edges[i * 3 + c] as number) + (mesh.edges[j * 3 + c] as number)) / 2) as Point3;
}

/** The box of one face of the body (from its triangles), or null. */
export function faceBox(mesh: BodyMesh, faceIndex: number): [Point3, Point3] | null {
  const group = mesh.faceGroups[faceIndex];
  if (!group || group.count < 1) return null;
  const min: Point3 = [Infinity, Infinity, Infinity];
  const max: Point3 = [-Infinity, -Infinity, -Infinity];
  for (let k = group.start; k < group.start + group.count; k++) {
    const v = mesh.indices[k] as number;
    for (const c of [0, 1, 2]) {
      min[c] = Math.min(min[c]!, mesh.vertices[v * 3 + c] as number);
      max[c] = Math.max(max[c]!, mesh.vertices[v * 3 + c] as number);
    }
  }
  return [min, max];
}
