/**
 * Déplacer à la façon de SketchUp : le pivot pris, ce qu'on déplace suit la souris jusqu'au clic. Le déplacement va
 * jusqu'au point accroché sous le pointeur (un coin, un milieu, une esquisse), sinon jusqu'au point de la face visée,
 * sinon dans le plan du sol passant par le pivot (dans le plan de l'écran quand on regarde de face). Un axe bloqué
 * (les flèches du clavier) le garde sur sa ligne : le point accroché y est projeté, comme les inférences de SketchUp.
 * Pur, en nombres.
 */
import type { Vec3 } from "../document/types";
import { axisParameter, rayPlanePoint, roundTo } from "../viewport/axis-drag";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

export interface FollowInput {
  /** The pivot, before the move. */
  source: Vec3;
  /** The pointer's ray in the model. */
  ray: { origin: Vec3; direction: Vec3 };
  /** The locked axis (a unit vector), or null. */
  axis: Vec3 | null;
  /** The point caught under the pointer (a corner, a middle), or null. */
  snap: Vec3 | null;
  /** The point of the face under the pointer (another body's), or null. */
  face: Vec3 | null;
  /** Rounding of a free move (mm, from the zoom). */
  step: number;
}

/** The move that brings the pivot under the pointer, or null when the pointer gives none (the ray along the axis). */
export function followMove({ source, ray, axis, snap, face, step }: FollowInput): Vec3 | null {
  if (axis) {
    const t = snap ? dot(sub(snap, source), axis) : axisParameter(source, axis, ray.origin, ray.direction);
    return t === null ? null : scale(axis, snap ? t : roundTo(t, step));
  }
  if (snap) return sub(snap, source);
  if (face) return sub(face, source);
  // The floor through the pivot, or the plane of the screen when the eye is level with it.
  const level = Math.abs(ray.direction[2]) > 0.25;
  const normal: Vec3 = level ? [0, 0, 1] : scale(ray.direction, -1);
  const p = rayPlanePoint(source, normal, ray.origin, ray.direction);
  return p ? (sub(p, source).map((c) => roundTo(c, step)) as Vec3) : null;
}

/**
 * The move a typed distance gives: that length along the locked axis, or along the move shown (its direction), keeping
 * its sense; null when there is no direction yet.
 */
export function movedBy(distance: number, current: Vec3, axis: Vec3 | null): Vec3 | null {
  if (axis) {
    const sense = dot(current, axis) < 0 ? -1 : 1;
    return scale(axis, sense * distance);
  }
  const length = Math.hypot(...current);
  return length < 1e-9 ? null : scale(current, distance / length);
}
