/**
 * Motion of a board (open a door, pull a drawer) and the check for collisions
 * with the other bodies. A board is taken as the box of its bounding box:
 * moved, it becomes an oriented box, tested against the other boxes with the
 * separating-axis theorem. Exact for plain boards; for a machined or shaped
 * body the box is a safe over-estimate (the check says "may collide").
 * View-only: nothing here changes the document.
 */
import type { Axis, Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

export type Motion =
  /** A drawer: slides along an axis by `distance` mm. */
  | { kind: "slide"; axis: Axis; distance: number }
  /** A door: turns by `angle` degrees about the line parallel to `axis` through `pivot`. */
  | { kind: "hinge"; axis: Axis; pivot: Vec3; angle: number };

/** Rotation by `angle` degrees about an axis (right-handed), as a row-major 3×3. */
export function rotationMatrix(axis: Axis, angle: number): number[] {
  const a = (angle * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

const apply = (m: number[], v: Vec3): Vec3 => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
const centerOf = (box: Box): Vec3 => [0, 1, 2].map((i) => ((box[0][i] as number) + (box[1][i] as number)) / 2) as Vec3;
const halfOf = (box: Box): Vec3 => [0, 1, 2].map((i) => ((box[1][i] as number) - (box[0][i] as number)) / 2) as Vec3;

/** The matrix of a motion for a display library: a row-major 3×3 rotation and a translation. */
export function poseOf(motion: Motion): { rotation: number[]; translation: Vec3 } {
  if (motion.kind === "slide") {
    const t: Vec3 = [0, 0, 0];
    t[motion.axis] = motion.distance;
    return { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: t };
  }
  const rotation = rotationMatrix(motion.axis, motion.angle);
  const turned = apply(rotation, motion.pivot);
  return { rotation, translation: [motion.pivot[0] - turned[0], motion.pivot[1] - turned[1], motion.pivot[2] - turned[2]] };
}

/** An oriented box: its centre, half sizes and three unit axes. */
export interface OrientedBox {
  center: Vec3;
  half: Vec3;
  axes: [Vec3, Vec3, Vec3];
}

/** The box after the motion. */
export function movedBox(box: Box, motion: Motion): OrientedBox {
  const { rotation, translation } = poseOf(motion);
  const c = apply(rotation, centerOf(box));
  return {
    center: [c[0] + translation[0], c[1] + translation[1], c[2] + translation[2]],
    half: halfOf(box),
    axes: [apply(rotation, [1, 0, 0]), apply(rotation, [0, 1, 0]), apply(rotation, [0, 0, 1])],
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * True when the oriented box and the axis-aligned box overlap by more than `tolerance` mm (boards that merely
 * touch, or meet within the tolerance, do not collide).
 */
export function overlaps(a: OrientedBox, box: Box, tolerance = 0.5): boolean {
  const cb = centerOf(box);
  const hb = halfOf(box);
  const unit: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const t: Vec3 = [cb[0] - a.center[0], cb[1] - a.center[1], cb[2] - a.center[2]];
  const candidates: Vec3[] = [...a.axes, ...unit];
  for (const u of a.axes) for (const e of unit) candidates.push(cross(u, e));
  for (const axis of candidates) {
    const length = Math.hypot(...axis);
    if (length < 1e-9) continue; // parallel edges: no new direction
    const l: Vec3 = [axis[0] / length, axis[1] / length, axis[2] / length];
    const ra = a.half[0] * Math.abs(dot(a.axes[0], l)) + a.half[1] * Math.abs(dot(a.axes[1], l)) + a.half[2] * Math.abs(dot(a.axes[2], l));
    const rb = hb[0] * Math.abs(l[0]) + hb[1] * Math.abs(l[1]) + hb[2] * Math.abs(l[2]);
    if (Math.abs(dot(t, l)) > ra + rb - tolerance) return false;
  }
  return true;
}

/** Ids of the other bodies the moved board runs into. */
export function collisions(moving: Box, motion: Motion, others: { id: string; box: Box }[], tolerance = 0.5): string[] {
  const oriented = movedBox(moving, motion);
  return others.filter((o) => overlaps(oriented, o.box, tolerance)).map((o) => o.id);
}

/** Range of the motion shown by the slider: how far a drawer comes out, how wide a door opens. */
export function motionRange(kind: Motion["kind"], box: Box, axis: Axis): { min: number; max: number; unit: "mm" | "°" } {
  if (kind === "hinge") return { min: -110, max: 110, unit: "°" };
  const length = (box[1][axis] as number) - (box[0][axis] as number);
  return { min: -Math.round(length), max: Math.round(length), unit: "mm" };
}

/** The corner pivots of a box in the plane perpendicular to `axis` (the four vertical edges, for a door's hinge axis Z). */
export function pivotCorners(box: Box, axis: Axis): { name: string; pivot: Vec3 }[] {
  const [p, q] = ([0, 1, 2] as Axis[]).filter((i) => i !== axis) as [Axis, Axis];
  const mid = ((box[0][axis] as number) + (box[1][axis] as number)) / 2;
  const names = ["XYZ"[p], "XYZ"[q]];
  return [0, 1].flatMap((i) =>
    [0, 1].map((j) => {
      const pivot: Vec3 = [0, 0, 0];
      pivot[axis] = mid;
      pivot[p] = box[i]![p] as number;
      pivot[q] = box[j]![q] as number;
      return { name: `${i ? "max" : "min"} ${names[0]} · ${j ? "max" : "min"} ${names[1]}`, pivot };
    }),
  );
}
