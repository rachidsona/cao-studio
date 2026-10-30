/** Helpers on tessellated B-rep edges (BodyMesh.edges / edgeGroups). */
import * as THREE from "three";
import type { BodyMesh } from "../geometry/protocol";

/** Vertices of one B-rep edge (pairs of segment end points). */
export function edgePoints(mesh: BodyMesh, edgeIndex: number): THREE.Vector3[] {
  const group = mesh.edgeGroups[edgeIndex];
  if (!group) return [];
  const pts: THREE.Vector3[] = [];
  for (let i = group.start; i < group.start + group.count; i++) pts.push(new THREE.Vector3().fromArray(mesh.edges, i * 3));
  return pts;
}

/** Point halfway along an edge (by length). */
export function edgeMidpoint(mesh: BodyMesh, edgeIndex: number): THREE.Vector3 {
  const pts = edgePoints(mesh, edgeIndex);
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 2) {
    const l = (pts[i] as THREE.Vector3).distanceTo(pts[i - 1] as THREE.Vector3);
    lengths.push(l);
    total += l;
  }
  let walked = 0;
  for (let k = 0; k < lengths.length; k++) {
    const l = lengths[k] as number;
    if (walked + l >= total / 2) {
      const t = l > 0 ? (total / 2 - walked) / l : 0;
      return (pts[2 * k] as THREE.Vector3).clone().lerp(pts[2 * k + 1] as THREE.Vector3, t);
    }
    walked += l;
  }
  return pts[0]?.clone() ?? new THREE.Vector3();
}

/** Distance (pixels) from a point of the screen to a segment of the screen, all in pixels. */
export function pixelDistanceToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** B-rep edge containing segment vertex `vertexIndex` of the body's edge buffer. */
export function edgeAtVertex(mesh: BodyMesh, vertexIndex: number): number {
  return mesh.edgeGroups.findIndex((g) => vertexIndex >= g.start && vertexIndex < g.start + g.count);
}
