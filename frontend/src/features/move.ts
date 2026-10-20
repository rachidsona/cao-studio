/**
 * Move of a body: the exact solid translated by the kernel's own
 * transformation (never an offset applied to the display), so every later
 * operation, measurement and export sees the body in its new place.
 *
 * Also the vector maths of the Move tool: the global frame, and a local frame
 * taken from a planar face, in which the translation may be entered.
 */
import type { Shape3D } from "replicad";
import type { MoveFeature, Vec3 } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { MIN_LENGTH, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput } from "./outputs";

/** Orthonormal, right-handed axes (x × y = z). */
export interface MoveFrame {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export const GLOBAL_FRAME: MoveFrame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Local frame of a planar face: z along its normal, x along the global axis
 * lying most in the plane (X, then Y, then Z on a tie), y completing the
 * frame. For a face parallel to a principal plane the axes are principal.
 */
export function faceFrame(normal: Vec3): MoveFrame {
  const z = unit(normal);
  const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const helper = axes.reduce((best, a) => (Math.abs(dot(a, z)) < Math.abs(dot(best, z)) - 1e-9 ? a : best));
  const k = dot(helper, z);
  const x = unit([helper[0] - k * z[0], helper[1] - k * z[1], helper[2] - k * z[2]]);
  return { x, y: cross(z, x), z };
}

/** Components given in `frame` → global components. */
export function toGlobal(frame: MoveFrame, v: Vec3): Vec3 {
  return [0, 1, 2].map((i) => v[0] * frame.x[i]! + v[1] * frame.y[i]! + v[2] * frame.z[i]!) as Vec3;
}

/** Global components → components in `frame`. */
export function toLocal(frame: MoveFrame, v: Vec3): Vec3 {
  return [dot(v, frame.x), dot(v, frame.y), dot(v, frame.z)];
}

export function buildMove(feature: MoveFeature, lookup: OutputLookup): SolidOutput {
  const { translate } = feature;
  if (translate.length !== 3 || !translate.every(Number.isFinite)) throw new GeometryError(`${feature.name} : le déplacement n'est pas un nombre.`);
  if (Math.hypot(...translate) < MIN_LENGTH) throw new GeometryError(`${feature.name} : le déplacement est nul (inférieur à ${MIN_LENGTH} mm).`);
  const target = requireSolid(lookup, feature.target).shape;
  // replicad's transformations consume the shape they are applied to: move a copy, the target stays intact
  // (it may be reused by the cache and by undo).
  return { kind: "solid", shape: (target.clone() as Shape3D).translate(translate) as Shape3D };
}
