/**
 * Grid on the XY plane whose spacing follows the zoom level (1, 10, 100 mm…),
 * so the visible cells always stay readable. It covers what is in the model:
 * its lines stay on the multiples of the spacing, what drawing snaps to.
 */
import * as THREE from "three";

const CELLS = 40;
/** A limit on the lines drawn, when a large plan is seen from close. */
const MAX_CELLS = 600;

/** What the grid has to cover on the XY plane (mm): [minX, minY, maxX, maxY]. */
export type GridArea = [number, number, number, number];

/** The centre of the grid and its cells (an even number: a line goes through the centre) to cover `area` and the origin. */
export function gridCover(area: GridArea | null, step: number): { center: [number, number]; cells: number } {
  if (!area) return { center: [0, 0], cells: CELLS };
  const [x0, y0, x1, y1] = [Math.min(area[0], 0), Math.min(area[1], 0), Math.max(area[2], 0), Math.max(area[3], 0)];
  const snap = (v: number) => Math.round(v / step) * step;
  const center: [number, number] = [snap((x0 + x1) / 2), snap((y0 + y1) / 2)];
  const half = Math.ceil(Math.max(x1 - center[0], center[0] - x0, y1 - center[1], center[1] - y0) / step) + 2;
  return { center, cells: Math.min(Math.max(CELLS, 2 * half), MAX_CELLS) };
}

export function gridStepFor(cameraDistance: number): number {
  const raw = Math.max(cameraDistance, 1e-3) / 20;
  return 10 ** Math.floor(Math.log10(raw));
}

export class AdaptiveGrid {
  readonly object = new THREE.Group();
  private step = 0;
  private color = new THREE.Color(0x9ca3af);
  private helper: THREE.GridHelper | null = null;
  private area: GridArea | null = null;
  private areaKey = "";

  update(cameraDistance: number, area: GridArea | null = null): void {
    const step = gridStepFor(cameraDistance);
    const key = area ? area.join() : "";
    if (step === this.step && key === this.areaKey) return;
    this.step = step;
    this.area = area;
    this.areaKey = key;
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
    const { center, cells } = gridCover(this.area, this.step);
    this.helper = new THREE.GridHelper(this.step * cells, cells, this.color, this.color);
    this.helper.rotation.x = Math.PI / 2; // GridHelper is built on XZ; CAD ground plane is XY.
    this.helper.position.set(center[0], center[1], 0);
    const material = this.helper.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.45;
    material.depthWrite = false;
    this.object.add(this.helper);
  }
}
