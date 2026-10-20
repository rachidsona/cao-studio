/**
 * Draggable arrow handle along an axis (extrusion distance), constant size on
 * screen, with a clickable value label at its tip.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Vec3 } from "../sketcher/frame";
import { axisParameter, dragStep, roundTo } from "./axis-drag";
import type { Viewport } from "./viewport";

const ARROW_PX = 70;

export class ArrowHandle {
  readonly object = new THREE.Group();
  readonly label: HTMLButtonElement;
  private base: Vec3 = [0, 0, 0];
  private normal: Vec3 = [0, 0, 1];
  private distance = 0;
  private drag: { tDown: number; start: number } | null = null;
  private stopFrame: () => void;

  constructor(
    private readonly viewport: Viewport,
    onLabelClick: (anchor: { x: number; y: number }) => void,
  ) {
    const material = new THREE.MeshBasicMaterial({ color: 0x0284c7, depthTest: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), material);
    shaft.position.y = 0.375;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.25, 20), material);
    head.position.y = 0.875;
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false }),
    );
    grip.position.y = 0.55;
    for (const part of [shaft, head, grip]) part.renderOrder = 20;
    this.object.add(shaft, head, grip);

    this.label = document.createElement("button");
    this.label.type = "button";
    this.label.className = "cad-dimension pointer-events-auto";
    this.label.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.label.addEventListener("click", (event) => {
      event.stopPropagation();
      const r = this.label.getBoundingClientRect();
      onLabelClick({ x: r.right, y: r.top + r.height / 2 });
    });
    const tip = new CSS2DObject(this.label);
    tip.position.set(0, 1.25, 0);
    this.object.add(tip);
    this.object.visible = false;
    viewport.scene.add(this.object);
    this.stopFrame = viewport.onEachFrame(() => this.update());
  }

  /** Base point on the face/sketch, unit normal, current distance and label text. */
  place(base: Vec3, normal: Vec3, distance: number, text: string): void {
    this.base = base;
    this.normal = normal;
    this.distance = distance;
    this.label.textContent = text;
    this.object.visible = true;
    this.update();
  }

  private update(): void {
    if (!this.object.visible) return;
    const n = new THREE.Vector3(...this.normal);
    this.object.position.copy(new THREE.Vector3(...this.base).addScaledVector(n, this.distance));
    this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().multiplyScalar(this.distance < 0 ? -1 : 1));
    this.object.scale.setScalar(ARROW_PX * this.viewport.worldPerPixel());
  }

  private axisT(event: PointerEvent): number | null {
    const { origin, direction } = this.viewport.rayFromEvent(event);
    return axisParameter(this.base, this.normal, origin, direction);
  }

  hovered(event: PointerEvent): boolean {
    return this.object.visible && this.viewport.intersect(event, [this.object]).length > 0;
  }

  /** Starts a drag when the pointer is on the arrow. */
  dragStart(event: PointerEvent): boolean {
    if (!this.hovered(event)) return false;
    const t = this.axisT(event);
    if (t === null) return false;
    this.drag = { tDown: t, start: this.distance };
    return true;
  }

  /** New distance while dragging (rounded to a step adapted to the zoom), or null. */
  dragMove(event: PointerEvent): number | null {
    if (!this.drag) return null;
    const t = this.axisT(event);
    if (t === null) return null;
    const value = roundTo(this.drag.start + t - this.drag.tDown, dragStep(this.viewport.worldPerPixel()));
    return Math.abs(value) < 1e-3 ? null : value;
  }

  dragEnd(): boolean {
    const was = this.drag !== null;
    this.drag = null;
    return was;
  }

  dispose(): void {
    this.stopFrame();
    this.label.remove();
    this.viewport.scene.remove(this.object);
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
