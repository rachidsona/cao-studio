/**
 * Shows which corner, edge or face a click would take as the extrusion's stop: an orange ring on the corner, an
 * orange line on the edge (with a ring where it would be taken), the usual hover tint on the face. Drawn over
 * everything, with a constant size on screen.
 */
import * as THREE from "three";
import type { Viewport } from "../viewport/viewport";
import type { Reference } from "./reference-measure";

const COLOR = 0xf97316;
const RING_PX = 9;

export class ReferenceMarker {
  private readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly stopFrame: () => void;
  private shown: Reference | null = null;

  constructor(private readonly viewport: Viewport) {
    const material = new THREE.MeshBasicMaterial({ color: COLOR, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
    // A ring (annulus) facing the camera, 1 unit of radius; scaled to RING_PX on screen.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 1, 32), material);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: COLOR, depthTest: false }));
    for (const part of [this.ring, this.line]) part.renderOrder = 30;
    this.group.add(this.ring, this.line);
    this.group.visible = false;
    viewport.scene.add(this.group);
    this.stopFrame = viewport.onEachFrame(() => this.update());
  }

  /** Marks this reference (null: nothing). */
  show(reference: Reference | null): void {
    this.shown = reference;
    this.viewport.setHoverHighlight(reference?.kind === "face" && reference.pick ? { face: reference.pick } : null);
    if (!reference || reference.kind === "face") {
      this.group.visible = false;
      return;
    }
    const at = reference.point;
    this.ring.position.set(at[0], at[1], at[2]);
    const edge = reference.kind === "edge";
    this.line.visible = edge;
    if (reference.kind === "edge") {
      this.line.geometry.setFromPoints([new THREE.Vector3(...reference.a), new THREE.Vector3(...reference.b)]);
    }
    this.group.visible = true;
    this.update();
  }

  private update(): void {
    if (!this.shown || !this.group.visible) return;
    this.ring.scale.setScalar(RING_PX * this.viewport.worldPerPixel());
    this.ring.quaternion.copy(this.viewport.camera.quaternion);
  }

  dispose(): void {
    this.stopFrame();
    this.viewport.setHoverHighlight(null);
    this.viewport.scene.remove(this.group);
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
