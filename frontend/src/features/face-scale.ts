/**
 * Agrandir ou réduire une face plane depuis son centre (comme l'échelle centrée de SketchUp) : les points du corps sur
 * cette face s'écartent du centre, tout le reste reste en place, et les côtés vont droit de l'ancien bord au nouveau —
 * le dessus d'un prisme agrandi fait un seau à pans. Le cadre est aligné sur les axes du modèle. Pur.
 */
import type { FaceScale, Vec3 } from "../document/types";

/** How far a point may be from the face and still be on it (mm). */
const ON_FACE = 0.01;
const SMALLEST = 0.05;
const LARGEST = 20;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (c: Vec3, ...steps: [Vec3, number][]): Vec3 => steps.reduce<Vec3>((p, [d, s]) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s], c);

/** The normal of a frame. */
export const faceNormal = (face: Pick<FaceScale, "u" | "v">) => cross(face.u, face.v);

/** The frame of a flat face, from the points around it (full circles: `circles`), not scaled yet. */
export function faceFrame(normal: Vec3, points: readonly Vec3[], circles: readonly { center: Vec3; radius: number }[] = []): FaceScale {
  // The axis of the model that lies most in the face.
  const world: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const axis = world.reduce((best, e) => (Math.abs(dot(e, normal)) < Math.abs(dot(best, normal)) - 1e-9 ? e : best));
  const flat = along(axis, [normal, -dot(axis, normal)]);
  const length = Math.hypot(...flat);
  const u = flat.map((c) => c / length) as Vec3;
  const v = cross(normal, u);
  const spans = (d: Vec3) => [...points.map((p) => [dot(p, d), dot(p, d)]), ...circles.map((c) => [dot(c.center, d) - c.radius, dot(c.center, d) + c.radius])] as [number, number][];
  const [lowU, highU] = [Math.min(...spans(u).map((s) => s[0])), Math.max(...spans(u).map((s) => s[1]))];
  const [lowV, highV] = [Math.min(...spans(v).map((s) => s[0])), Math.max(...spans(v).map((s) => s[1]))];
  const first = points[0] ?? circles[0]!.center;
  const center = along(first, [u, (lowU + highU) / 2 - dot(first, u)], [v, (lowV + highV) / 2 - dot(first, v)]);
  return { center, u, v, size: [highU - lowU, highV - lowV], scale: [1, 1] };
}

/** Where a point of the body goes, or null when it is not on the face. */
export function scaledPoint(face: FaceScale, p: Vec3): Vec3 | null {
  const d = minus(p, face.center);
  const [a, b] = [dot(d, face.u), dot(d, face.v)];
  if (Math.abs(dot(d, faceNormal(face))) > ON_FACE || Math.abs(a) > face.size[0] / 2 + ON_FACE || Math.abs(b) > face.size[1] / 2 + ON_FACE) return null;
  return along(face.center, [face.u, a * face.scale[0]], [face.v, b * face.scale[1]]);
}

/** A handle of the frame: -1, 0 or 1 along each side (0, 0 is not one). */
export type Handle = [number, number];
export const HANDLES: Handle[] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

/** A point of the frame as it is now. */
export function handlePoint(face: FaceScale, [a, b]: Handle): Vec3 {
  return along(face.center, [face.u, (a * face.size[0] * face.scale[0]) / 2], [face.v, (b * face.size[1] * face.scale[1]) / 2]);
}

const bounded = (k: number) => Number(Math.min(LARGEST, Math.max(SMALLEST, k)).toFixed(3));

/** The scale when a handle is brought to a point of the face's plane: a corner both ways, a side's middle its own way. */
export function draggedScale(face: FaceScale, [a, b]: Handle, point: Vec3): [number, number] {
  const d = minus(point, face.center);
  const [x, y] = [dot(d, face.u), dot(d, face.v)];
  const [w, h] = [face.size[0] / 2, face.size[1] / 2];
  if (a && b) {
    const k = bounded((x * a * w + y * b * h) / (w * w + h * h));
    return [k, k];
  }
  return [a ? bounded((x * a) / w) : face.scale[0], b ? bounded((y * b) / h) : face.scale[1]];
}
