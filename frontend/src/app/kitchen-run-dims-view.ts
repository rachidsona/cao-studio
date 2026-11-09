/**
 * Draws the dimensions of a kitchen run seen alone (document/kitchen-run-dims.ts) in the view, as those of a dressing's
 * Répartition: thin orange lines just in front of the units, a tick across each end, the value in the middle. Over the
 * model, so nothing hides them.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { RunDim } from "../document/kitchen-run-dims";
import { FRONT, kitchenSizes, runAt, type KitchenRun } from "../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan } from "../document/types";
import { placePoint } from "../features/room-runs";
import { formatLength } from "../measurements/units";
import type { Viewport } from "../viewport/viewport";

const LINE = 0xf8500a;
const TICK = 40;

export class RunDimsView {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.9, depthTest: false });

  constructor(viewport: Viewport) {
    this.group.renderOrder = 48;
    viewport.scene.add(this.group);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child instanceof THREE.LineSegments) child.geometry.dispose();
    }
  }

  /** `edit`: a dimension that changes something, clicked (its label, to put a field over it). */
  show(p: KitchenFloorPlan, run: KitchenRun, dims: RunDim[], unit: DisplayUnit, edit?: (label: HTMLElement, dim: RunDim) => void): void {
    this.clear();
    const off = run.back + kitchenSizes(p).cabinet + FRONT + 30;
    const place = p.place ?? { quarter: 0 as const, origin: [0, 0] as [number, number] };
    /** A point of the run's front: along it, at a height. */
    const world = (u: number, z: number): number[] => {
      const [x, y] = runAt(run, u, off);
      return placePoint(place, [x, y, z]);
    };
    const points: number[] = [];
    for (const d of dims) {
      const at = (v: number, across = 0) => (d.axis === "u" ? world(v, d.at + across) : world(d.at + across, v));
      points.push(...at(d.a), ...at(d.b));
      for (const end of [d.a, d.b]) points.push(...at(end, -TICK), ...at(end, TICK));
      const span = document.createElement("span");
      span.className = "cad-piece-dim";
      span.dataset.runDim = d.axis;
      span.textContent = formatLength(d.b - d.a, unit).replace(/\s*[a-zµ]+$/i, "");
      if (d.edit && edit) {
        span.dataset.editable = "";
        span.style.pointerEvents = "auto";
        span.style.cursor = "text";
        span.title = "Cliquez pour changer cette cote";
        span.addEventListener("pointerdown", (event) => event.stopPropagation());
        span.addEventListener("click", () => edit(span, d));
      }
      const label = new CSS2DObject(span);
      label.position.set(...(at((d.a + d.b) / 2) as [number, number, number]));
      this.group.add(label);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geometry, this.material);
    lines.renderOrder = 48;
    this.group.add(lines);
  }
}
