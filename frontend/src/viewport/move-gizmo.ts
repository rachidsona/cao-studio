/**
 * XYZ manipulator of the Move tool: three arrows (X red, Y green, Z blue)
 * to move along an axis, and three squares to move in a plane (XY, XZ, YZ),
 * of constant size on screen. Its axes are those of the frame in use, global
 * or local. It only computes the displacement of the pointer; the tool turns
 * it into the translation of the real model.
 */
import * as THREE from "three";
import type { MoveFrame } from "../features/move";
import type { Vec3 } from "../sketcher/frame";
import { axisParameter, rayPlanePoint } from "./axis-drag";
import type { Viewport } from "./viewport";

const SIZE_PX = 110;
/** X red, Y green, Z blue. */
export const AXIS_COLORS = [0xdc2626, 0x16a34a, 0x2563eb] as const;
export const AXIS_NAMES = ["X", "Y", "Z"] as const;

/** An arrow (move along `axis`) or a square (move in the plane normal to `normal`). */
export type GizmoHandle = { kind: "axis"; axis: 0 | 1 | 2 } | { kind: "plane"; normal: 0 | 1 | 2 };

const same = (a: GizmoHandle | null, b: GizmoHandle | null) => !!a && !!b && a.kind === b.kind && (a.kind === "axis" ? a.axis === (b as typeof a).axis : a.normal === (b as typeof a).normal);

export class MoveGizmo {
  readonly object = new THREE.Group();
  private frame: MoveFrame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  private origin: Vec3 = [0, 0, 0];
  private hover: GizmoHandle | null = null;
  private drag: { handle: GizmoHandle; origin: Vec3; start: number | Vec3 } | null = null;
  private readonly parts: { handle: GizmoHandle; meshes: THREE.Mesh[]; base: number }[] = [];
  private stopFrame: () => void;

  constructor(private readonly viewport: Viewport) {
    this.object.matrixAutoUpdate = false;
    for (const axis of [0, 1, 2] as const) this.addArrow(axis);
    for (const normal of [0, 1, 2] as const) this.addSquare(normal);
    this.object.visible = false;
    viewport.scene.add(this.object);
    this.stopFrame = viewport.onEachFrame(() => this.update());
  }

  private material(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  }

  /** Arrow along +axis (built along +Y, then turned onto the axis). */
  private addArrow(axis: 0 | 1 | 2): void {
    const color = AXIS_COLORS[axis];
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 10), this.material(color, 1));
    shaft.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 16), this.material(color, 1));
    head.position.y = 0.825;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 8), this.material(color, 0));
    grip.position.y = 0.55;
    const group = new THREE.Group();
    group.add(shaft, head, grip);
    if (axis === 0) group.rotation.z = -Math.PI / 2;
    else if (axis === 2) group.rotation.x = Math.PI / 2;
    for (const mesh of [shaft, head, grip]) {
      mesh.renderOrder = 30;
      mesh.userData.handle = { kind: "axis", axis } satisfies GizmoHandle;
    }
    this.object.add(group);
    this.parts.push({ handle: { kind: "axis", axis }, meshes: [shaft, head], base: 1 });
  }

  /** Square in the plane of the two axes other than `normal`, near the origin. */
  private addSquare(normal: 0 | 1 | 2): void {
    const square = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), this.material(AXIS_COLORS[normal], 0.4));
    square.renderOrder = 29;
    // PlaneGeometry faces +Z: XY already; turn it for XZ (normal Y) and YZ (normal X).
    if (normal === 0) {
      square.rotation.y = Math.PI / 2;
      square.position.set(0, 0.4, 0.4);
    } else if (normal === 1) {
      square.rotation.x = Math.PI / 2;
      square.position.set(0.4, 0, 0.4);
    } else square.position.set(0.4, 0.4, 0);
    square.userData.handle = { kind: "plane", normal } satisfies GizmoHandle;
    this.object.add(square);
    this.parts.push({ handle: { kind: "plane", normal }, meshes: [square], base: 0.4 });
  }

  /** Puts the manipulator at `origin`, its axes along `frame`. */
  place(origin: Vec3, frame: MoveFrame): void {
    this.origin = origin;
    this.frame = frame;
    this.object.visible = true;
    this.update();
  }

  hide(): void {
    this.object.visible = false;
  }

  private update(): void {
    if (!this.object.visible) return;
    const { x, y, z } = this.frame;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
    const s = SIZE_PX * this.viewport.worldPerPixel();
    m.scale(new THREE.Vector3(s, s, s));
    m.setPosition(...this.origin);
    this.object.matrix.copy(m);
    this.object.matrixWorldNeedsUpdate = true;
    for (const part of this.parts) {
      const lit = same(part.handle, this.hover) || same(part.handle, this.drag?.handle ?? null);
      for (const mesh of part.meshes) (mesh.material as THREE.MeshBasicMaterial).opacity = lit ? 1 : part.base;
    }
  }

  private axisOf(handle: GizmoHandle): Vec3 {
    const index = handle.kind === "axis" ? handle.axis : handle.normal;
    return [this.frame.x, this.frame.y, this.frame.z][index] as Vec3;
  }

  /** Handle under the pointer, if any. */
  handleAt(event: PointerEvent): GizmoHandle | null {
    if (!this.object.visible) return null;
    this.object.updateMatrixWorld(true);
    const hit = this.viewport.intersect(event, [this.object])[0];
    return (hit?.object.userData.handle as GizmoHandle | undefined) ?? null;
  }

  /** Highlights the handle under the pointer (null: none). Returns it. */
  hovered(event: PointerEvent): GizmoHandle | null {
    this.hover = this.drag ? this.hover : this.handleAt(event);
    this.update();
    return this.hover;
  }

  /** Starts a drag when the pointer is on a handle. */
  dragStart(event: PointerEvent): boolean {
    const handle = this.handleAt(event);
    if (!handle) return false;
    const ray = this.viewport.rayFromEvent(event);
    const axis = this.axisOf(handle);
    const start = handle.kind === "axis" ? axisParameter(this.origin, axis, ray.origin, ray.direction) : rayPlanePoint(this.origin, axis, ray.origin, ray.direction);
    if (start === null) return false;
    this.drag = { handle, origin: [...this.origin], start };
    this.hover = handle;
    return true;
  }

  /** Displacement (global, mm) since the drag began: along the axis, or inside the plane. Null when the ray is degenerate. */
  dragMove(event: PointerEvent): Vec3 | null {
    if (!this.drag) return null;
    const { handle, origin, start } = this.drag;
    const ray = this.viewport.rayFromEvent(event);
    const axis = this.axisOf(handle);
    if (handle.kind === "axis") {
      const t = axisParameter(origin, axis, ray.origin, ray.direction);
      if (t === null) return null;
      const d = t - (start as number);
      return [axis[0] * d, axis[1] * d, axis[2] * d];
    }
    const p = rayPlanePoint(origin, axis, ray.origin, ray.direction);
    if (p === null) return null;
    const from = start as Vec3;
    return [p[0] - from[0], p[1] - from[1], p[2] - from[2]];
  }

  /** The handle being dragged. */
  get dragging(): GizmoHandle | null {
    return this.drag?.handle ?? null;
  }

  dragEnd(): boolean {
    const was = this.drag !== null;
    this.drag = null;
    this.hover = null;
    this.update();
    return was;
  }

  dispose(): void {
    this.stopFrame();
    this.viewport.scene.remove(this.object);
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
