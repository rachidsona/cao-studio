/**
 * Snap points of a face of a tessellated body, as Fusion shows them while a
 * point is being picked: the corners of the face (the body's vertices that
 * lie on it) and its middle (the centre of its extent, so a plate with an
 * off-centre hole still has its middle in the middle). A planar face also
 * gives its normal, so a body can be brought onto its plane.
 */
import type { BodyMesh } from "../geometry/protocol";
import { bodyVertices, type Point3 } from "./body-points";

export interface FaceSnaps {
  corners: Point3[];
  center: Point3;
  /** Unit normal of a planar face (as tessellated), null for a curved one. */
  normal: Point3 | null;
}

/** Corners and mesh points closer than this (mm) are the same point (the mesh is single precision). */
const ON_FACE = 1e-2;

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function faceSnaps(mesh: BodyMesh, faceIndex: number): FaceSnaps | null {
  const group = mesh.faceGroups[faceIndex];
  if (!group || group.count < 3) return null;
  const at = (i: number): Point3 => {
    const k = (mesh.indices[i] as number) * 3;
    return [mesh.vertices[k] as number, mesh.vertices[k + 1] as number, mesh.vertices[k + 2] as number];
  };
  const onFace: Point3[] = [];
  let area = 0;
  let normal: Point3 | null = null;
  let planar = true;
  for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
    const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
    onFace.push(a, b, c);
    const n = cross(sub(b, a), sub(c, a));
    const twice = Math.hypot(...n);
    if (twice < 1e-12) continue;
    area += twice;
    const unit: Point3 = [n[0] / twice, n[1] / twice, n[2] / twice];
    if (!normal) normal = unit;
    else if (Math.abs(unit[0] - normal[0]) + Math.abs(unit[1] - normal[1]) + Math.abs(unit[2] - normal[2]) > 1e-3) planar = false;
  }
  if (area === 0) return null;
  const center = [0, 1, 2].map((k) => {
    const values = onFace.map((p) => p[k] as number);
    return (Math.min(...values) + Math.max(...values)) / 2;
  }) as Point3;
  const near = (p: Point3) => onFace.some((q) => Math.abs(q[0] - p[0]) < ON_FACE && Math.abs(q[1] - p[1]) < ON_FACE && Math.abs(q[2] - p[2]) < ON_FACE);
  return { corners: bodyVertices(mesh).filter(near), center, normal: planar ? normal : null };
}

/** Displacement that brings `point` onto the plane of a face (along the face normal only). */
export function ontoPlane(point: Point3, planePoint: Point3, normal: Point3): Point3 {
  const d = (planePoint[0] - point[0]) * normal[0] + (planePoint[1] - point[1]) * normal[1] + (planePoint[2] - point[2]) * normal[2];
  // `+ 0` turns −0 into 0 (shown as "-0" otherwise).
  return [normal[0] * d + 0, normal[1] * d + 0, normal[2] * d + 0];
}
