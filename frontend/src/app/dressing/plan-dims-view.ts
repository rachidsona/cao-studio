/**
 * Draws the dimensions of the Répartitions (features/partition-dims.ts) in the view: on the face of the panels towards
 * the eye, thin lines over the model, small values. A value that would not fit its line, or would land on another, is
 * left out until the view comes closer; a line seen end-on (the depth, from the front) is not drawn.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DisplayUnit, Vec3 } from "../../document/types";
import { partitionDims, ringGap, shortValue, type PartitionPlan, type PlanPoint } from "../../features/partition-dims";
import { toDisplay } from "../../measurements/units";
import type { SketchFrame } from "../../sketcher/frame";
import { toWorld } from "../../sketcher/frame";
import type { Viewport } from "../../viewport/viewport";
import { disposeFat, fatSegments } from "../../viewport/fat-lines";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

/** A value of the view clicked: the label, which niche size it is, and its value (mm). */
export type DimEdit = (label: HTMLElement, axis: "x" | "y", span: [number, number], value: number, whole: boolean) => void;

const LINE = 0xf8500a;
/** Widths in pixels: the dimension lines over a pale halo that reads on wood as on the dark view; the witness lines. */
const WIDTH = { line: 1.8, halo: 4.5, witness: 1.2 };
/** A value needs this much of its line, in pixels: its width along a line across the screen, its height along one up the screen. */
const ROOM = 30;
const ROOM_UP = 16;
/** Between two dimension lines side by side, in pixels: their values never land on each other. */
const RING = 46;

export class PlanDimsView {
  private readonly group = new THREE.Group();

  constructor(private readonly viewport: Viewport) {
    this.group.renderOrder = 48;
    viewport.scene.add(this.group);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child.userData.fat) disposeFat(child as LineSegments2);
    }
  }

  /**
   * `shift`: how far the bodies were moved from their sketch; `edit`: what a click on a value does; `inside`: the values
   * written inside the niches are clicked too (not while a tool picks niches there: they would take its clicks).
   */
  show(frame: SketchFrame, plans: PartitionPlan[], unit: DisplayUnit, shift: Vec3 = [0, 0, 0], edit?: DimEdit, inside = true): void {
    const camera = this.viewport.camera;
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    const toEye = camera.getWorldDirection(new THREE.Vector3()).negate();
    const towards = toEye.dot(new THREE.Vector3(...frame.normal)) > 0;
    const digits = unit === "mm" ? 0 : unit === "m" ? 3 : 1;
    const written: [number, number][] = [];
    const main: number[] = [];
    const thin: number[] = [];

    for (const plan of plans) {
      // The face towards the eye: the sketch's plane or the far end of the panels; the depth goes to the other one.
      const face = towards ? plan.depth : 0;
      const away = towards ? -1 : 1;
      const world = ([x, y, w]: PlanPoint): THREE.Vector3 =>
        new THREE.Vector3(...toWorld(frame, x, y))
          .addScaledVector(new THREE.Vector3(...frame.normal), face + away * w)
          .add(new THREE.Vector3(...shift));
      const screen = (p: THREE.Vector3): [number, number] => {
        const v = p.clone().project(camera);
        return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
      };
      const { outer } = plan;
      const span = Math.max(outer.x1 - outer.x0, outer.y1 - outer.y0);
      const across = (p: PlanPoint, q: PlanPoint) => Math.hypot(...screen(world(p)).map((v, i) => v - screen(world(q))[i]!));
      const pixels = Math.max(across([outer.x0, outer.y0, 0], [outer.x1, outer.y0, 0]) / (outer.x1 - outer.x0), across([outer.x0, outer.y0, 0], [outer.x0, outer.y1, 0]) / (outer.y1 - outer.y0));
      const gap = Math.min(Math.max(ringGap(outer), RING / pixels), span * 0.3);
      const tick = Math.min(gap, ringGap(outer)) * 0.12;
      for (const dim of partitionDims(plan, gap)) {
        // Doors are read from the front.
        if (dim.level === "door" && !towards) continue;
        const [from, to] = [world(dim.from), world(dim.to)];
        const [a, b] = [screen(from), screen(to)];
        const seen = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (dim.level === "depth" && seen < ROOM) continue;
        main.push(...from.toArray(), ...to.toArray());
        // An oblique tick at each end, as on a plan.
        const along = to.clone().sub(from).normalize();
        const side = dim.level === "depth" ? new THREE.Vector3(...frame.u) : new THREE.Vector3(...frame.normal).cross(along).normalize();
        const slant = along.clone().add(side).multiplyScalar(tick);
        for (const end of [from, to]) main.push(...end.clone().sub(slant).toArray(), ...end.clone().add(slant).toArray());
        for (const [p, q] of dim.witnesses) thin.push(...world(p).toArray(), ...world(q).toArray());

        const at = from.clone().add(to).multiplyScalar(0.5);
        const [x, y] = screen(at);
        const room = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? ROOM : ROOM_UP;
        if (seen < room || written.some(([wx, wy]) => Math.abs(wx - x) < 34 && Math.abs(wy - y) < 13)) continue;
        written.push([x, y]);
        const value = document.createElement("span");
        value.className = "cad-plan-dim";
        value.dataset.level = dim.level;
        value.textContent = shortValue(toDisplay(dim.length, unit), digits);
        if (edit && (dim.level === "chain" || (inside && dim.level === "inner") || dim.level === "total")) {
          const across = Math.abs(dim.to[0] - dim.from[0]) > Math.abs(dim.to[1] - dim.from[1]);
          const axis = across ? "x" : "y";
          const span: [number, number] = across ? [dim.from[0], dim.to[0]] : [dim.from[1], dim.to[1]];
          value.dataset.editable = "";
          value.style.pointerEvents = "auto";
          value.style.cursor = "text";
          value.title = "Cliquez pour changer cette cote";
          value.addEventListener("pointerdown", (event) => event.stopPropagation());
          value.addEventListener("click", (event) => {
            event.stopPropagation();
            edit(value, axis, span, dim.length, dim.level === "total");
          });
        }
        const label = new CSS2DObject(value);
        label.position.copy(at);
        this.group.add(label);
      }
    }
    // Lines a few pixels wide (WebGL's are one): the witnesses, then the dimension lines over their halo.
    const vectors = (flat: number[]) => Array.from({ length: flat.length / 3 }, (_, i) => new THREE.Vector3(flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]));
    const layers: [number[], number, number, number][] = [[thin, LINE, WIDTH.witness, 0.55], [main, 0xffffff, WIDTH.halo, 0.7], [main, LINE, WIDTH.line, 1]];
    layers.forEach(([points, color, width, opacity], k) => {
      if (!points.length) return;
      const line = fatSegments(vectors(points), color, width);
      (line.material as THREE.Material & { opacity: number }).opacity = opacity;
      line.renderOrder = 48 + k;
      this.group.add(line);
    });
  }
}
