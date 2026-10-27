/**
 * Sketches drawn in the 3D view when they are not being edited: their curves (sharp in front of the bodies,
 * faint behind them), a translucent fill of their closed areas that makes them clickable, and the rose of the
 * selected ones. Picking needs the viewport's rays: it is given as functions.
 */
import * as THREE from "three";
import type { SketchFrame, Vec3 } from "../sketcher/frame";
import type { Point3 } from "./body-points";
import type { SketchPick } from "./selection-layer";

export interface SketchDrawing {
  id: string;
  frame: SketchFrame;
  curves: { id: string; points: [number, number][] }[];
  points: { id: string; at: [number, number] }[];
  regions: { outer: [number, number][]; holes: [number, number][][] }[];
  selected: boolean;
}

/** The viewport's picking, for the pointer event being handled. */
export interface PointerRays {
  intersect(objects: THREE.Object3D[], linePx: number): THREE.Intersection[];
  screenDistance(p: Vec3): number;
}

export class SketchLayer {
  /** One group per sketch. */
  readonly group = new THREE.Group();
  /** Sharp where the sketch is in front, faint where a body hides it: sketches stay apparent. */
  private line = new THREE.LineBasicMaterial({ color: 0x2563eb });
  private ghost = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
  /** The selected sketch is drawn in rose, with its areas tinted. */
  private selectedLine = new THREE.LineBasicMaterial({ color: 0xe11d48 });
  private selectedGhost = new THREE.LineBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  private fill = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private selectedFill = new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Every material of the sketches (the section of the view clips them all). */
  materials(): THREE.Material[] {
    return [this.line, this.ghost, this.selectedLine, this.selectedGhost, this.fill, this.selectedFill];
  }

  /** Draws these sketches on their planes (replacing those drawn before). */
  set(items: SketchDrawing[]): void {
    for (const group of [...this.group.children]) {
      this.group.remove(group);
      group.traverse((child) => (child instanceof THREE.Line || child instanceof THREE.Mesh) && child.geometry.dispose());
    }
    for (const { id, frame, curves, points, regions, selected } of items) {
      const group = new THREE.Group();
      group.userData.sketchId = id;
      group.userData.points = points;
      group.userData.selected = selected;
      group.matrixAutoUpdate = false;
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal));
      group.matrix.copy(basis.setPosition(new THREE.Vector3(...frame.origin)));
      for (const curve of curves) {
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
        const ghost = new THREE.Line(geometry, selected ? this.selectedGhost : this.ghost);
        ghost.renderOrder = 4;
        ghost.userData.ghost = true;
        const line = new THREE.Line(geometry, selected ? this.selectedLine : this.line);
        line.renderOrder = 5;
        ghost.userData.kind = line.userData.kind = "line";
        ghost.userData.curveId = line.userData.curveId = curve.id;
        group.add(ghost, line);
      }
      for (const [index, { outer, holes }] of regions.entries()) {
        const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), selected ? this.selectedFill : this.fill);
        fill.renderOrder = 3;
        fill.userData.kind = "fill";
        fill.userData.regionIndex = index;
        fill.userData.area = Math.abs(THREE.ShapeUtils.area(shape.getPoints())) - holes.reduce((sum, h) => sum + Math.abs(THREE.ShapeUtils.area(h.map(([x, y]) => new THREE.Vector2(x, y)))), 0);
        group.add(fill);
      }
      this.group.add(group);
    }
  }

  /** Draws in rose the sketch selected alone (in the browser) and the sketches of a multiple selection. */
  paint(picked: readonly string[]): void {
    for (const group of this.group.children) {
      const on = group.userData.selected === true || picked.includes(group.userData.sketchId as string);
      for (const child of group.children) {
        if (child.userData.kind === "fill") (child as THREE.Mesh).material = on ? this.selectedFill : this.fill;
        else if (child.userData.kind === "line") {
          const ghost = child.userData.ghost === true;
          (child as THREE.Line).material = on ? (ghost ? this.selectedGhost : this.selectedLine) : ghost ? this.ghost : this.line;
        }
      }
    }
  }

  /** The sketch selected alone in the browser, if any. */
  aloneSketch(): string | undefined {
    return this.group.children.find((g) => g.userData.selected === true)?.userData.sketchId as string | undefined;
  }

  /** Sketch under the pointer: a curve within a few pixels, else (when nothing nearer hides it) the inside of an area. */
  pick(rays: PointerRays, what: "line" | "fill", nearerThan: number | null = null): string | null {
    const targets: THREE.Object3D[] = [];
    this.group.traverse((o) => o.userData.kind === what && targets.push(o));
    const hit = rays.intersect(targets, 6)[0];
    if (!hit || (nearerThan !== null && hit.distance > nearerThan + 1e-3)) return null;
    return (hit.object.parent?.userData.sketchId as string | undefined) ?? null;
  }

  /**
   * One element of a sketch under the pointer: a point (within a few pixels), a curve, or the inside of an area
   * (only when nothing nearer, like a body face, hides it).
   */
  pickItem(rays: PointerRays, kind: SketchPick["kind"], nearerThan: number | null = null): (SketchPick & { distance: number }) | null {
    this.group.updateMatrixWorld(true);
    if (kind === "point") {
      let best: (SketchPick & { distance: number }) | null = null;
      for (const group of this.group.children) {
        for (const p of (group.userData.points ?? []) as { id: string; at: [number, number] }[]) {
          const w = new THREE.Vector3(p.at[0], p.at[1], 0).applyMatrix4(group.matrixWorld);
          const d = rays.screenDistance([w.x, w.y, w.z]);
          if (d <= 10 && (!best || d < best.distance)) best = { sketchId: group.userData.sketchId as string, kind, id: p.id, points: [[w.x, w.y, w.z]], distance: d };
        }
      }
      return best;
    }
    const targets: THREE.Object3D[] = [];
    this.group.traverse((o) => o.userData.kind === (kind === "curve" ? "line" : "fill") && targets.push(o));
    const hit = rays.intersect(targets, 6)[0];
    if (!hit || (nearerThan !== null && hit.distance > nearerThan + 1e-3)) return null;
    const object = hit.object as THREE.Mesh | THREE.Line;
    const sketchId = object.parent?.userData.sketchId as string;
    const world = object.geometry.getAttribute("position") as THREE.BufferAttribute;
    const points: Point3[] = [];
    for (let i = 0; i < world.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(world, i).applyMatrix4(object.matrixWorld);
      points.push([v.x, v.y, v.z]);
    }
    if (kind === "curve") {
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
      return { sketchId, kind, id: object.userData.curveId as string, points, measure: length, distance: hit.distance };
    }
    return {
      sketchId,
      kind,
      id: String(object.userData.regionIndex),
      points: [],
      measure: object.userData.area as number,
      fill: { geometry: object.geometry.clone(), matrix: object.matrixWorld.clone() },
      distance: hit.distance,
    };
  }

  /** Each sketch as world polylines (its curves, and its points as one-point lines), for a selection window. */
  polylines(): { id: string; lines: THREE.Vector3[][] }[] {
    this.group.updateMatrixWorld(true);
    return this.group.children.map((group) => {
      const lines: THREE.Vector3[][] = [];
      for (const child of group.children) {
        if (child.userData.kind !== "line" || child.userData.ghost) continue;
        const position = (child as THREE.Line).geometry.getAttribute("position") as THREE.BufferAttribute;
        const line: THREE.Vector3[] = [];
        for (let i = 0; i < position.count; i++) line.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
        lines.push(line);
      }
      for (const p of (group.userData.points ?? []) as { at: [number, number] }[]) lines.push([new THREE.Vector3(p.at[0], p.at[1], 0).applyMatrix4(group.matrixWorld)]);
      return { id: group.userData.sketchId as string, lines };
    });
  }
}
