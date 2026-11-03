/**
 * Face sur face (Aligner) : une face plane d'un corps se plaque sur une face d'un autre, même inclinée (le pan d'un
 * toit). Le corps tourne autour du centre de sa face, du plus petit angle qui la retourne contre l'autre (sa normale
 * opposée à celle de l'autre), puis tourne encore sur la face d'un quart si on le demande, et se pose : le centre de
 * sa face sur le point visé, à un jeu près le long de la normale. Une rotation (autour d'un axe quelconque) et un
 * déplacement. Pur.
 */
import type { Vec3 } from "../document/types";

/** A planar face: a point of it and its outward normal. */
export interface PlanarFace {
  point: Vec3;
  normal: Vec3;
}

export interface FaceMate {
  /** Axis (unit), angle (degrees) and centre of the turn; null when the faces already look at each other. */
  rotation: { dir: Vec3; angle: number; center: Vec3 } | null;
  translate: Vec3;
}

type Quat = [number, number, number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const quat = (axis: Vec3, radians: number): Quat => {
  const s = Math.sin(radians / 2);
  return [Math.cos(radians / 2), axis[0] * s, axis[1] * s, axis[2] * s];
};
const times = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

/** A vector turned by a unit quaternion. */
export function turn(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  const u: Vec3 = [x, y, z];
  const t = cross(u, v).map((c) => 2 * c) as Vec3;
  const ut = cross(u, t);
  return [v[0] + w * t[0] + ut[0], v[1] + w * t[1] + ut[1], v[2] + w * t[2] + ut[2]];
}

/** The smallest turn taking `from` onto `to` (both unit); half a turn about an upright axis when they are opposite. */
function between(from: Vec3, to: Vec3): Quat {
  const c = Math.max(-1, Math.min(1, dot(from, to)));
  if (c > 1 - 1e-9) return [1, 0, 0, 0];
  if (c < -1 + 1e-9) {
    // Opposite: about the vertical when the face is upright (the body stays standing), else about X; square to it.
    const seed: Vec3 = Math.abs(from[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    return quat(unit(seed.map((v, i) => v - from[i]! * dot(from, seed)) as Vec3), Math.PI);
  }
  return quat(unit(cross(from, to)), Math.acos(c));
}

/**
 * How to lay `moving` on `fixed`: its normal turned against the other's, then `spin` degrees about it, its point put
 * on the other's point, `gap` away from it (outside).
 */
export function faceOnFace(moving: PlanarFace, fixed: PlanarFace, gap = 0, spin = 0): FaceMate {
  const n1 = unit(moving.normal);
  const n2 = unit(fixed.normal);
  let q = times(quat(n2, (spin * Math.PI) / 180), between(n1, n2.map((c) => -c) as Vec3));
  // The same turn, the short way round (at most half a turn).
  if (q[0] < 0) q = q.map((c) => -c) as Quat;
  const translate = [0, 1, 2].map((i) => fixed.point[i]! + n2[i]! * gap - moving.point[i]!) as Vec3;
  const w = Math.max(-1, Math.min(1, q[0]));
  const s = Math.sqrt(1 - w * w);
  const angle = (2 * Math.acos(w) * 180) / Math.PI;
  if (s < 1e-9 || angle < 1e-6) return { rotation: null, translate };
  return { rotation: { dir: [q[1] / s, q[2] / s, q[3] / s], angle, center: [...moving.point] as Vec3 }, translate };
}
