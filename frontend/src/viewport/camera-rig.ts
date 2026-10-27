/**
 * Placing the Z-up CAD camera: standard views, framing a box, saving and restoring where it is, and the
 * sketch mode's view normal to the sketch plane. Functions on the camera and its orbit controls.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SketchFrame, Vec3 } from "../sketcher/frame";

export type StandardView = "iso" | "front" | "back" | "top" | "bottom" | "left" | "right";

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

const VIEW_DIRECTIONS: Record<StandardView, [number, number, number]> = {
  iso: [1, -1, 0.8],
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

/** Camera distance that shows a sphere of `radius` in both directions of a possibly narrow view. */
export function fitDistance(camera: THREE.PerspectiveCamera, radius: number): number {
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  return (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.05;
}

export function setView({ camera, controls }: CameraRig, bounds: THREE.Box3, view: StandardView, fixedDistance?: number): void {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1);
  const distance = fixedDistance ?? fitDistance(camera, radius);
  const direction = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize();
  // Avoid a degenerate up vector when looking straight along Z.
  camera.up.set(0, 0, 1);
  if (Math.abs(direction.z) > 0.99) camera.up.set(0, 1, 0);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  controls.update();
}

/** Frames `box` keeping the current viewing direction; `margin` leaves room for labels. */
export function fitBox({ camera, controls }: CameraRig, box: THREE.Box3, margin = 1): void {
  const direction = camera.position.clone().sub(controls.target).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max((box.getSize(new THREE.Vector3()).length() / 2) * margin, 1);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, fitDistance(camera, radius));
  controls.update();
}

/** True when every corner of `box` is on screen (inside `inset` of the normalised view). */
export function boxVisible(camera: THREE.PerspectiveCamera, box: THREE.Box3, inset = 0.9): boolean {
  camera.updateMatrixWorld();
  const { min, max } = box;
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        if (Math.abs(p.x) > inset || Math.abs(p.y) > inset || p.z > 1) return false;
      }
    }
  }
  return true;
}

export function cameraState({ camera, controls }: CameraRig): CameraState {
  const { position, up } = camera;
  const target = controls.target;
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z], up: [up.x, up.y, up.z] };
}

export function setCameraState({ camera, controls }: CameraRig, state: CameraState): void {
  camera.up.set(...state.up);
  controls.target.set(...state.target);
  camera.position.set(...state.position);
  camera.lookAt(controls.target);
  controls.update();
}

/** Camera normal to the sketch plane, looking at the part projected onto it; rotation off (the left button draws). */
export function viewSketchPlane({ camera, controls }: CameraRig, bounds: THREE.Box3, frame: SketchFrame): void {
  const normal = new THREE.Vector3(...frame.normal);
  const origin = new THREE.Vector3(...frame.origin);
  const center = bounds.getCenter(new THREE.Vector3());
  // Project the scene centre onto the plane so the sketch area stays in view.
  const target = center.clone().sub(normal.clone().multiplyScalar(center.clone().sub(origin).dot(normal)));
  // Frame the part as seen along the normal: its depth along the normal does not matter.
  const size = bounds.getSize(new THREE.Vector3());
  const across = size.clone().sub(normal.clone().multiplyScalar(size.dot(normal)));
  const radius = Math.max(across.length() / 2, 30) * 1.15;
  camera.up.set(...frame.v);
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(normal, fitDistance(camera, radius));
  camera.lookAt(target);
  controls.enableRotate = false;
  controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: -1 as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN };
}

/** Back to the model's navigation: left button and one finger turn the view. */
export function freeOrbit(controls: OrbitControls): void {
  controls.enableRotate = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
}
