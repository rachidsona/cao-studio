/**
 * Manipulator of the Move and Rotate tools, small and drawn like the axis indicator of the view: a slim arrow of the
 * axis colour on each axis (X red, Y green, Z blue, a fine shaft and a cone head), small translucent tiles of the
 * same colours to move in a plane, three curved arrows to turn around an axis, and a pivot dot at the centre (with a
 * ring) to move freely in the plane of the screen. A handle under the pointer brightens and thickens. Of constant
 * size on screen (about 50 px). Its axes are those
 * of the frame in use, global or local; in a sketch (`planar`) only the two arrows of the plane and the dot remain.
 * It only computes what the pointer does (a displacement, an angle); the tool turns it into the real model.
 */
import * as THREE from "three";
import type { MoveFrame } from "../features/move";
import type { Vec3 } from "../sketcher/frame";
import { axisParameter, rayPlanePoint } from "./axis-drag";
import type { Viewport } from "./viewport";

/** On screen (px); bigger under a finger. */
const SIZE_PX = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 72 : 50;
/** X red, Y green, Z blue. */
export const AXIS_COLORS = [0xef4444, 0x22c55e, 0x3b82f6] as const;
export const AXIS_NAMES = ["X", "Y", "Z"] as const;
const WHITE = 0xf8fafc;
const FREE_LIT = 0x38bdf8;

/** An arrow (move along `axis`), a tile (move in the plane normal to `normal`), a curved arrow (turn around `axis`), or the dot. */
export type GizmoHandle = { kind: "axis"; axis: 0 | 1 | 2 } | { kind: "plane"; normal: 0 | 1 | 2 } | { kind: "rotate"; axis: 0 | 1 | 2 } | { kind: "free" };

export interface GizmoOptions {
  /** Inside a sketch: only the two arrows of the plane and the dot, the dot moving inside that plane. */
  planar?: boolean;
  /** The arrows and tiles (default); false for a tool that only turns. */
  translate?: boolean;
  /** The curved arrows to turn around each axis. */
  rotate?: boolean;
}

const same = (a: GizmoHandle | null, b: GizmoHandle | null): boolean => {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "axis" || a.kind === "rotate") return a.axis === (b as typeof a).axis;
  if (a.kind === "plane") return a.normal === (b as typeof a).normal;
  return true;
};

/** Profile of an arrow along +Y (radius, height): a fine shaft from next to the dot, then a cone head. */
const ARROW_PROFILE: [number, number][] = [
  [0, 0.12],
  [0.032, 0.12],
  [0.032, 0.74],
  [0.09, 0.74],
  [0, 1],
];

/** The colour of a handle under the pointer: its own, brighter. */
const lighter = (hex: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.45).getHex();

/** A square of side `size` with rounded corners, in the XY plane. */
function roundedSquare(size: number, radius: number): THREE.ShapeGeometry {
  const h = size / 2;
  const r = Math.min(radius, h);
  const shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(shape, 8);
}

/**
 * The scene's lights are strong: a plain colour would burn out to white. The colour is mostly emitted, and only a
 * little of it is lit, so the shading gives a relief without washing the colour out.
 */
function paint(material: THREE.MeshStandardMaterial, color: THREE.Color): void {
  material.color.copy(color).multiplyScalar(0.3);
  material.emissive.copy(color).multiplyScalar(0.62);
}

interface Part {
  handle: GizmoHandle;
  /** What grows when the handle is lit (an arrow gets fatter, a tile and the dot get bigger). */
  body: THREE.Object3D | null;
  /** The surfaces whose colour and opacity follow the state: the axis colour at rest, brighter when lit. */
  paint: { material: THREE.MeshStandardMaterial; rest: number; lit: number }[];
  restColor: number;
  litColor: number;
}

export class MoveGizmo {
  readonly object = new THREE.Group();
  private frame: MoveFrame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  private origin: Vec3 = [0, 0, 0];
  private hover: GizmoHandle | null = null;
  private drag: { handle: GizmoHandle; origin: Vec3; start: number | Vec3; normal: Vec3; turned: number; lastRaw: number } | null = null;
  private readonly parts: Part[] = [];
  private readonly arcs = new THREE.Group();
  /** The pivot's ring, turned to face the eye. */
  private facing: THREE.Object3D | null = null;
  private readonly options: Required<GizmoOptions>;
  private stopFrame: () => void;

  constructor(
    private readonly viewport: Viewport,
    options: GizmoOptions = {},
  ) {
    this.options = { planar: false, translate: true, rotate: false, ...options };
    const { planar, translate, rotate } = this.options;
    this.object.matrixAutoUpdate = false;
    if (translate) for (const axis of (planar ? [0, 1] : [0, 1, 2]) as (0 | 1 | 2)[]) this.addArrow(axis);
    if (translate && !planar) for (const normal of [0, 1, 2] as const) this.addTile(normal);
    if (rotate && !planar) {
      for (const axis of [0, 1, 2] as const) this.addArc(axis);
      this.object.add(this.arcs);
    }
    this.addPivot();
    this.object.visible = false;
    viewport.scene.add(this.object);
    this.stopFrame = viewport.onEachFrame(() => this.update());
  }

  /**
   * A surface drawn over everything (the manipulator is never hidden by the model). All the surfaces are in the
   * "transparent" list, even the opaque ones: only there does `renderOrder` decide which is drawn on top.
   */
  private surface(opacity: number, color: number = WHITE): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    paint(material, new THREE.Color(color));
    return material;
  }

  private invisible(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  }

  /** Turns a group built along +Y onto +axis. */
  private onto(group: THREE.Object3D, axis: 0 | 1 | 2): void {
    if (axis === 0) group.rotation.z = -Math.PI / 2;
    else if (axis === 2) group.rotation.x = Math.PI / 2;
  }

  /** Arrow along +axis, of the axis colour. */
  private addArrow(axis: 0 | 1 | 2): void {
    const handle: GizmoHandle = { kind: "axis", axis };
    const fill = new THREE.Mesh(new THREE.LatheGeometry(ARROW_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 20), this.surface(1, AXIS_COLORS[axis]));
    fill.renderOrder = 32;
    // A wide invisible grip makes the small arrow easy to catch.
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.95, 8), this.invisible());
    grip.position.y = 0.58;
    grip.renderOrder = 30;
    const body = new THREE.Group();
    body.add(fill, grip);
    const group = new THREE.Group();
    group.add(body);
    this.onto(group, axis);
    for (const mesh of [fill, grip]) mesh.userData.handle = handle;
    this.object.add(group);
    this.parts.push({ handle, body, paint: [{ material: fill.material, rest: 1, lit: 1 }], restColor: AXIS_COLORS[axis], litColor: lighter(AXIS_COLORS[axis]) });
  }

  /** Small rounded tile in the plane of the two axes other than `normal`. */
  private addTile(normal: 0 | 1 | 2): void {
    const handle: GizmoHandle = { kind: "plane", normal };
    const fill = new THREE.Mesh(roundedSquare(0.18, 0.04), this.surface(0.35, AXIS_COLORS[normal]));
    fill.renderOrder = 29;
    const body = new THREE.Group();
    body.add(fill);
    const group = new THREE.Group();
    group.add(body);
    // The shape faces +Z: XY already; turn it for XZ (normal Y) and YZ (normal X).
    if (normal === 0) {
      group.rotation.y = Math.PI / 2;
      group.position.set(0, 0.36, 0.36);
    } else if (normal === 1) {
      group.rotation.x = Math.PI / 2;
      group.position.set(0.36, 0, 0.36);
    } else group.position.set(0.36, 0.36, 0);
    fill.userData.handle = handle;
    this.object.add(group);
    this.parts.push({ handle, body, paint: [{ material: fill.material, rest: 0.35, lit: 0.9 }], restColor: AXIS_COLORS[normal], litColor: lighter(AXIS_COLORS[normal]) });
  }

  /** Curved arrow to turn around `axis`: an arc in the quadrant of the two other axes, with a head at each end. */
  private addArc(axis: 0 | 1 | 2): void {
    const handle: GizmoHandle = { kind: "rotate", axis };
    const a = new THREE.Vector3(...([[0, 1, 0], [0, 0, 1], [1, 0, 0]][axis] as Vec3));
    const b = new THREE.Vector3(...([[0, 0, 1], [1, 0, 0], [0, 1, 0]][axis] as Vec3));
    const radius = 0.66;
    const [from, to] = [(22 * Math.PI) / 180, (68 * Math.PI) / 180];
    const at = (t: number) => a.clone().multiplyScalar(Math.cos(t) * radius).add(b.clone().multiplyScalar(Math.sin(t) * radius));
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, (_, i) => at(from + ((to - from) * i) / 15)));
    const material = this.surface(0.96, AXIS_COLORS[axis]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.022, 8), material);
    tube.renderOrder = 31;
    const grip = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.085, 6), this.invisible());
    grip.renderOrder = 30;
    const group = new THREE.Group();
    group.add(tube, grip);
    // A head at each end, pointing along the arc.
    for (const [t, sign] of [[from, -1], [to, 1]] as const) {
      const tangent = a.clone().multiplyScalar(-Math.sin(t)).add(b.clone().multiplyScalar(Math.cos(t))).multiplyScalar(sign).normalize();
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.1, 14), material);
      head.position.copy(at(t)).addScaledVector(tangent, 0.045);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      head.renderOrder = 31;
      head.userData.handle = handle;
      group.add(head);
    }
    for (const mesh of [tube, grip]) mesh.userData.handle = handle;
    this.arcs.add(group);
    this.parts.push({ handle, body: null, paint: [{ material, rest: 0.96, lit: 1 }], restColor: AXIS_COLORS[axis], litColor: lighter(AXIS_COLORS[axis]) });
  }

  /** The pivot dot with its ring: the manipulator's centre, to move freely in the plane of the screen. */
  private addPivot(): void {
    const handle: GizmoHandle = { kind: "free" };
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), this.surface(1));
    dot.renderOrder = 35;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 40), this.surface(0.9));
    ring.renderOrder = 34;
    const facing = new THREE.Group();
    facing.add(ring);
    this.facing = facing;
    // The ring is also a catch: the dot alone would be small.
    const catcher = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), this.invisible());
    catcher.renderOrder = 33;
    const body = new THREE.Group();
    body.add(dot, facing, catcher);
    for (const mesh of [dot, catcher]) mesh.userData.handle = handle;
    this.object.add(body);
    this.parts.push({ handle, body, paint: [{ material: dot.material, rest: 1, lit: 1 }, { material: ring.material, rest: 0.9, lit: 1 }], restColor: WHITE, litColor: FREE_LIT });
  }

  /** Puts the manipulator at `origin`, its axes along `frame`. */
  place(origin: Vec3, frame: MoveFrame): void {
    this.origin = origin;
    this.frame = frame;
    this.object.visible = true;
    this.update();
  }

  /** The curved arrows turn around the axes of the global frame only: hidden in a local one. */
  showRotation(visible: boolean): void {
    this.arcs.visible = visible;
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
    // The pivot's ring faces the camera: the line of sight in the manipulator's own frame.
    if (this.facing) {
      const eye = this.viewport.camera.getWorldDirection(new THREE.Vector3()).negate().transformDirection(new THREE.Matrix4().copy(this.object.matrix).invert());
      this.facing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), eye.normalize());
    }
    for (const part of this.parts) {
      const lit = same(part.handle, this.hover) || same(part.handle, this.drag?.handle ?? null);
      const grow = lit ? 1.35 : 1;
      if (part.body) {
        if (part.handle.kind === "axis") part.body.scale.set(grow, 1, grow);
        else part.body.scale.setScalar(grow);
      }
      for (const { material, rest, lit: litOpacity } of part.paint) {
        material.opacity = lit ? litOpacity : rest;
        paint(material, new THREE.Color(lit ? part.litColor : part.restColor));
      }
    }
  }

  /** The axis of a handle (in the frame), or the line of sight for the dot outside a sketch. */
  private axisOf(handle: GizmoHandle): Vec3 {
    if (handle.kind === "free" && this.options.planar) return this.frame.z;
    if (handle.kind === "free") {
      const v = this.viewport.camera.getWorldDirection(new THREE.Vector3());
      return [v.x, v.y, v.z];
    }
    const index = handle.kind === "axis" || handle.kind === "rotate" ? handle.axis : handle.normal;
    return [this.frame.x, this.frame.y, this.frame.z][index] as Vec3;
  }

  /** Handle under the pointer, if any. */
  handleAt(event: PointerEvent): GizmoHandle | null {
    if (!this.object.visible) return null;
    this.object.updateMatrixWorld(true);
    const hits = this.viewport.intersect(event, [this.object]).filter((hit) => {
      // A hidden group (the curved arrows in a local frame) is not caught.
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    // The dot wins over what it overlaps (the arrows start next to it); for the rest, the nearest along the ray.
    const handles = hits.map((hit) => hit.object.userData.handle as GizmoHandle | undefined).filter((h): h is GizmoHandle => !!h);
    return handles.find((h) => h.kind === "free") ?? handles[0] ?? null;
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
    this.drag = { handle, origin: [...this.origin], start, normal: axis, turned: 0, lastRaw: 0 };
    this.hover = handle;
    return true;
  }

  /** Displacement (global, mm) since the drag began: along the axis, or inside the plane. Null when the ray is degenerate. */
  dragMove(event: PointerEvent): Vec3 | null {
    if (!this.drag || this.drag.handle.kind === "rotate") return null;
    const { handle, origin, start, normal } = this.drag;
    const ray = this.viewport.rayFromEvent(event);
    if (handle.kind === "axis") {
      const t = axisParameter(origin, normal, ray.origin, ray.direction);
      if (t === null) return null;
      const d = t - (start as number);
      return [normal[0] * d, normal[1] * d, normal[2] * d];
    }
    const p = rayPlanePoint(origin, normal, ray.origin, ray.direction);
    if (p === null) return null;
    const from = start as Vec3;
    return [p[0] - from[0], p[1] - from[1], p[2] - from[2]];
  }

  /**
   * Angle (radians, right-handed around the axis) turned since a curved arrow was taken; null when no arrow is taken
   * or the ray is degenerate. It counts the turns past half a turn, so a wide drag does not wrap around.
   */
  dragAngle(event: PointerEvent): number | null {
    const drag = this.drag;
    if (!drag || drag.handle.kind !== "rotate") return null;
    const ray = this.viewport.rayFromEvent(event);
    const p = rayPlanePoint(drag.origin, drag.normal, ray.origin, ray.direction);
    if (p === null) return null;
    const from = drag.start as Vec3;
    const v0 = [0, 1, 2].map((i) => from[i]! - drag.origin[i]!) as Vec3;
    const v1 = [0, 1, 2].map((i) => p[i]! - drag.origin[i]!) as Vec3;
    const n = drag.normal;
    const cross: Vec3 = [v0[1] * v1[2] - v0[2] * v1[1], v0[2] * v1[0] - v0[0] * v1[2], v0[0] * v1[1] - v0[1] * v1[0]];
    const raw = Math.atan2(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2], v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]);
    let step = raw - drag.lastRaw;
    if (step > Math.PI) step -= 2 * Math.PI;
    else if (step < -Math.PI) step += 2 * Math.PI;
    drag.turned += step;
    drag.lastRaw = raw;
    return drag.turned;
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
