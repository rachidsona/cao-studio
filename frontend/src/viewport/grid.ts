/**
 * Grid on the XY plane whose spacing follows the zoom level (1, 10, 100 mm…),
 * so the visible cells always stay readable.
 */
import * as THREE from "three";

const CELLS = 40;

export function gridStepFor(cameraDistance: number): number {
  const raw = Math.max(cameraDistance, 1e-3) / 20;
  return 10 ** Math.floor(Math.log10(raw));
}

export class AdaptiveGrid {
  readonly object = new THREE.Group();
  private step = 0;
  private color = new THREE.Color(0x9ca3af);
  private helper: THREE.GridHelper | null = null;

  update(cameraDistance: number): void {
    const step = gridStepFor(cameraDistance);
    if (step === this.step) return;
    this.step = step;
    this.rebuild();
  }

  setColor(color: THREE.Color): void {
    this.color = color;
    if (this.step) this.rebuild();
  }

  get currentStep(): number {
    return this.step;
  }

  private rebuild(): void {
    if (this.helper) {
      this.object.remove(this.helper);
      this.helper.geometry.dispose();
      (this.helper.material as THREE.Material).dispose();
    }
    this.helper = new THREE.GridHelper(this.step * CELLS, CELLS, this.color, this.color);
    this.helper.rotation.x = Math.PI / 2; // GridHelper is built on XZ; CAD ground plane is XY.
    const material = this.helper.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.45;
    material.depthWrite = false;
    this.object.add(this.helper);
  }
}
