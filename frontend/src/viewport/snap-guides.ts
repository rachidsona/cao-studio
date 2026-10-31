/** The guides of the smart snapping in the model: pink dashed lines over the bodies, 2 px wide, dashes of a few pixels. */
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { Vec3 } from "../document/types";
import type { Viewport } from "./viewport";

export const SMART_COLOR = 0xd946ef;

export class SnapGuides {
  private object: LineSegments2 | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  /** Draws these guides, sized on the screen of this view. */
  show(guides: readonly [Vec3, Vec3][], viewport: Pick<Viewport, "worldPerPixel" | "renderer">): void {
    this.clear();
    if (guides.length === 0) return;
    const geometry = new LineSegmentsGeometry().setPositions(guides.flatMap(([a, b]) => [...a, ...b]));
    const dash = 7 * viewport.worldPerPixel();
    const material = new LineMaterial({ color: SMART_COLOR, linewidth: 2, dashed: true, dashSize: dash, gapSize: dash * 0.7, depthTest: false, transparent: true });
    material.resolution.set(viewport.renderer.domElement.clientWidth, viewport.renderer.domElement.clientHeight);
    this.object = new LineSegments2(geometry, material);
    this.object.computeLineDistances();
    this.object.renderOrder = 48;
    this.scene.add(this.object);
  }

  clear(): void {
    if (!this.object) return;
    this.scene.remove(this.object);
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.object = null;
  }
}
