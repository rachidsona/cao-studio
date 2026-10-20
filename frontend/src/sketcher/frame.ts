/**
 * Sketch plane frames, matching replicad's named planes so that what is drawn
 * in the sketcher is exactly what the kernel extrudes.
 *   XY: u = +X, v = +Y, normal = +Z
 *   XZ: u = +X, v = +Z, normal = −Y
 *   YZ: u = +Y, v = +Z, normal = +X
 * The plane origin is `normal × offset`.
 */
import type { PlaneName } from "../document/types";

export type Vec3 = [number, number, number];

export interface SketchFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
}

const AXES: Record<PlaneName, { u: Vec3; v: Vec3; normal: Vec3 }> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] },
};

/**
 * Frame of a sketch plane: the plane `offset` along its normal, with its origin moved by `shift` inside
 * the plane (a sketch that was moved as a whole keeps its geometry and constraints, its origin goes along).
 */
export function sketchFrame(plane: PlaneName, offset: number, shift?: readonly [number, number]): SketchFrame {
  const { u, v, normal } = AXES[plane];
  const [su, sv] = shift ?? [0, 0];
  return {
    u,
    v,
    normal,
    origin: [0, 1, 2].map((i) => normal[i]! * offset + u[i]! * su + v[i]! * sv) as Vec3,
  };
}

export function toWorld(frame: SketchFrame, x: number, y: number): Vec3 {
  const { origin: o, u, v } = frame;
  return [o[0] + u[0] * x + v[0] * y, o[1] + u[1] * x + v[1] * y, o[2] + u[2] * x + v[2] * y];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function toSketch(frame: SketchFrame, p: Vec3): [number, number] {
  const d: Vec3 = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
  return [dot(d, frame.u), dot(d, frame.v)];
}

/** Intersection of a ray with the sketch plane, in sketch coordinates (null if parallel or behind). */
export function rayToSketch(frame: SketchFrame, origin: Vec3, direction: Vec3): [number, number] | null {
  const denom = dot(direction, frame.normal);
  if (Math.abs(denom) < 1e-12) return null;
  const t = dot([frame.origin[0] - origin[0], frame.origin[1] - origin[1], frame.origin[2] - origin[2]], frame.normal) / denom;
  if (t < 0) return null;
  return toSketch(frame, [origin[0] + direction[0] * t, origin[1] + direction[1] * t, origin[2] + direction[2] * t]);
}

export const PLANE_LABELS: Record<PlaneName, string> = { XY: "Plan XY (dessus)", XZ: "Plan XZ (face)", YZ: "Plan YZ (droite)" };
