/**
 * Sketch plane frames, matching replicad's named planes so that what is drawn
 * in the sketcher is exactly what the kernel extrudes.
 *   XY: u = +X, v = +Y, normal = +Z
 *   XZ: u = +X, v = +Z, normal = −Y
 *   YZ: u = +Y, v = +Z, normal = +X
 * The plane origin is `normal × offset`.
 */
import type { PlaneFrame, PlaneName } from "../document/types";

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

/** Where a sketch (or its profile) lies: a main plane at an offset, or a construction plane anywhere. */
export interface Placement {
  plane: PlaneName;
  offset: number;
  shift?: readonly [number, number];
  frame?: PlaneFrame;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Frame of a sketch: its construction plane when it has one (x axis made perpendicular to the normal, y = normal × x
 * as replicad does), else its main plane at its offset; then moved inside the plane by `shift`.
 */
export function frameOf(placement: Placement): SketchFrame {
  if (!placement.frame) return sketchFrame(placement.plane, placement.offset, placement.shift);
  const normal = unit(placement.frame.normal);
  const x = placement.frame.xDir;
  const u = unit([0, 1, 2].map((i) => x[i]! - normal[i]! * dot(x, normal)) as Vec3);
  const v = cross(normal, u);
  const [su, sv] = placement.shift ?? [0, 0];
  const o = placement.frame.origin;
  return { u, v, normal, origin: [0, 1, 2].map((i) => o[i]! + u[i]! * su + v[i]! * sv) as Vec3 };
}

/** The main plane closest to a normal (what names a construction plane). */
export function nearestPlane(normal: Vec3): PlaneName {
  const [x, y, z] = normal.map(Math.abs) as Vec3;
  return z >= x && z >= y ? "XY" : y >= x ? "XZ" : "YZ";
}

const round6 = (v: Vec3): Vec3 => v.map((c) => Number(c.toFixed(6))) as Vec3;

/** A construction plane through `origin` with this normal; its x axis follows `xHint` (or the nearest main axis). */
export function planeFrame(origin: Vec3, normal: Vec3, xHint?: Vec3): PlaneFrame {
  const n = unit(normal);
  let hint = xHint ?? AXES[nearestPlane(n)].u;
  // A hint along the normal gives no direction in the plane: another main axis does.
  if (Math.hypot(...cross(hint, n)) < 1e-6) hint = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit([0, 1, 2].map((i) => hint[i]! - n[i]! * dot(hint, n)) as Vec3);
  return { origin: round6(origin), xDir: round6(u), normal: round6(n) };
}

/** A main plane moved by `offset` and turned by `angle` degrees around its own x (`"u"`) or y (`"v"`) axis. */
export function tiltedPlane(plane: PlaneName, offset: number, angle: number, around: "u" | "v"): PlaneFrame {
  const { u, v, normal } = AXES[plane];
  const t = (angle * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const mix = (a: Vec3, b: Vec3, ka: number, kb: number) => [0, 1, 2].map((i) => a[i]! * ka + b[i]! * kb) as Vec3;
  // Turning around u moves the normal towards −v (right-hand rule); around v, towards +u.
  const n = around === "u" ? mix(normal, v, c, -s) : mix(normal, u, c, s);
  const x = around === "u" ? u : mix(u, normal, c, -s);
  return planeFrame(normal.map((k) => k * offset) as Vec3, n, x);
}

/** The plane through three points (null when they are in line); its x axis goes from the first to the second. */
export function planeThrough(a: Vec3, b: Vec3, c: Vec3): PlaneFrame | null {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = cross(ab, ac);
  if (Math.hypot(...n) < 1e-6 * Math.max(1, Math.hypot(...ab) * Math.hypot(...ac))) return null;
  return planeFrame(a, n, ab);
}

/** Signed distance of a sketch's plane from the model origin along its normal (its offset, for a main plane). */
export function planeOffsetOf(placement: Placement): number {
  if (!placement.frame) return placement.offset;
  return Number(dot(placement.frame.origin, unit(placement.frame.normal)).toFixed(6));
}

/** The placement moved along its normal to `offset` from the model origin. */
export function withPlaneOffset<T extends Placement>(placement: T, offset: number): T {
  if (!placement.frame) return { ...placement, offset };
  const n = unit(placement.frame.normal);
  const step = offset - planeOffsetOf(placement);
  return { ...placement, frame: { ...placement.frame, origin: round6(placement.frame.origin.map((c, i) => c + n[i]! * step) as Vec3) } };
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
