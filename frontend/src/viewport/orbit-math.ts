/**
 * Tourner la vue autour d'un centre d'orbite, comme l'outil Orbite de Fusion : la caméra, le point qu'elle regarde
 * et son haut tournent ensemble autour du centre. Orbite contrainte : le haut reste Z (on ne passe pas par-dessus) ;
 * orbite libre : la boule (dedans l'anneau), la poignée de gauche ou de droite (seulement autour de la verticale de
 * l'écran), celle du haut ou du bas (seulement autour de l'horizontale), et dehors l'anneau le roulis autour de
 * l'axe de vue. Pur.
 */
import * as THREE from "three";
import type { Vec3 } from "../sketcher/frame";

export interface View {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

/** Where a drag of the free orbit starts: in the ring, outside it, or on one of its four handles. */
export type RingPart = "inside" | "outside" | "left" | "right" | "top" | "bottom";

/** Pixels around a handle of the ring that still take it. */
export const HANDLE_PX = 14;
/** Closest the camera comes to looking straight up or down in the constrained orbit (radians). */
const POLE = 0.01;

const v = (p: Vec3) => new THREE.Vector3(...p);
const out = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];

/** The camera's own axes: where it looks, its right and its up on the screen. */
export function viewAxes(view: View): { forward: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
  const forward = v(view.target).sub(v(view.position)).normalize();
  const right = forward.clone().cross(v(view.up)).normalize();
  return { forward, right, up: right.clone().cross(forward) };
}

/** The view turned by `q` about `pivot`: the camera, the point it looks at and its up turn together. */
export function turnView(view: View, pivot: Vec3, q: THREE.Quaternion): View {
  const c = v(pivot);
  const turn = (p: Vec3) => out(v(p).sub(c).applyQuaternion(q).add(c));
  return { position: turn(view.position), target: turn(view.target), up: out(v(view.up).applyQuaternion(q)) };
}

const about = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);

/**
 * Constrained orbit: `yaw` about the vertical (Z), `pitch` about the camera's horizontal axis (positive: the camera
 * rises, the model shows its top). The up stays Z, and the camera stops just short of straight above or below.
 */
export function constrainedTurn(view: View, pivot: Vec3, yaw: number, pitch: number): View {
  const { forward, right } = viewAxes(view);
  // The camera's height on its sphere: the angle between Z and where it is seen from.
  const polar = Math.acos(THREE.MathUtils.clamp(-forward.z, -1, 1));
  const rise = THREE.MathUtils.clamp(pitch, polar - (Math.PI - POLE), polar - POLE);
  const q = about(new THREE.Vector3(0, 0, 1), yaw).multiply(about(right, -rise));
  const turned = turnView(view, pivot, q);
  // Off the poles the up is Z again (after a free orbit the model stands back up); on them it keeps turning.
  return Math.abs(viewAxes(turned).forward.z) < Math.cos(POLE) ? { ...turned, up: [0, 0, 1] } : turned;
}

/** Free orbit: a drag of (dx, dy) radians turns the model with the pointer, about the screen's axes. */
export function freeTurn(view: View, pivot: Vec3, dx: number, dy: number): View {
  const { right, up } = viewAxes(view);
  const axis = right.multiplyScalar(-dy).add(up.multiplyScalar(-dx));
  const angle = Math.hypot(dx, dy);
  return angle < 1e-12 ? view : turnView(view, pivot, about(axis, angle));
}

/** Roll about the line of sight: the model turns on the screen by `angle` (counter-clockwise when positive). */
export function rollTurn(view: View, pivot: Vec3, angle: number): View {
  return turnView(view, pivot, about(viewAxes(view).forward, angle));
}

/** What a press at (x, y) takes on the ring of centre (cx, cy) and radius r: a handle first, then in or out. */
export function ringPart(x: number, y: number, cx: number, cy: number, r: number): RingPart {
  const handles: [RingPart, number, number][] = [["left", cx - r, cy], ["right", cx + r, cy], ["top", cx, cy - r], ["bottom", cx, cy + r]];
  for (const [part, hx, hy] of handles) if (Math.hypot(x - hx, y - hy) <= HANDLE_PX) return part;
  return Math.hypot(x - cx, y - cy) <= r ? "inside" : "outside";
}

/** The turn on the screen (counter-clockwise, radians) from one pointer position to the next about (cx, cy). */
export function screenAngle(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number): number {
  const a = Math.atan2(-(y1 - cy), x1 - cx) - Math.atan2(-(y0 - cy), x0 - cx);
  return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a;
}
