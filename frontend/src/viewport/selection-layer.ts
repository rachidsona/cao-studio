/**
 * Selection of faces, edges and corners of the displayed bodies (3D model
 * mode): click toggles an element, selected faces are tinted, selected edges
 * are drawn on top in green with their dimension label (two parallel ones also
 * with the distance between them), selected corners are marked with a rose dot.
 */
import * as THREE from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { BodyMesh } from "../geometry/protocol";
import { bodyVertices, samePoint, type Point3 } from "./body-points";
import { SELECTED_LINE } from "./colors";
import { disposeFat, fatSegments, polylineSegments } from "./fat-lines";
import { disposeArrows, edgeArrows, fitArrows } from "./edge-arrows";
import { edgeMidpoint, edgePoints } from "./edge-geometry";

export interface FacePick {
  bodyId: string;
  faceIndex: number;
  point: THREE.Vector3;
}

export interface EdgePick {
  bodyId: string;
  edgeIndex: number;
}

/** A corner of a body (where its edges meet), in model coordinates (mm). */
export interface VertexPick {
  bodyId: string;
  point: Point3;
}

/** A point, a curve or an area of a sketch drawn in the view (filters "Points", "Arêtes", "Faces"). */
export interface SketchPick {
  sketchId: string;
  kind: "point" | "curve" | "region";
  /** Point or curve id; for an area, its index among the sketch's areas. */
  id: string;
  /** Model coordinates: the point, or the curve as a polyline. */
  points: Point3[];
  /** Length of a curve, area of a region (mm, mm²). */
  measure?: number;
  /** Triangles of an area and their placement, to tint it. */
  fill?: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
}

export interface ModelSelection {
  faces: FacePick[];
  edges: EdgePick[];
  /** Corners (selection filter "Points"). */
  vertices: VertexPick[];
  /** Points, curves and areas of sketches. */
  sketch: SketchPick[];
  /** Whole bodies (selection filter "Corps", Ctrl/Maj + clic, window). */
  bodies: string[];
  /** Whole sketches, several at once (Ctrl/Maj + clic, filter "Corps", window). */
  sketches: string[];
}

/** What a click selects in the 3D model. */
export type SelectionFilter = "auto" | "face" | "edge" | "vertex" | "body";

interface BodyView {
  mesh: THREE.Mesh;
  data: BodyMesh;
}

const key = (e: EdgePick) => `${e.bodyId}#${e.edgeIndex}`;

/** Width of a selected edge or line (pixels): thin enough to see the corners, wide enough to read. */
const SELECTED_WIDTH = 2.5;

/** The line of the distance between two parallel edges (amber, apart from the green of the edges). */
const GAP_LINE = 0xf59e0b;

/** What makes a face index mean the same face: as many faces and edges, the same size and volume (to 0.01 mm). */
export function topologyKey(data: Pick<BodyMesh, "faceGroups" | "edgeGroups" | "metrics">): string {
  const r = (v: number) => Math.round(v * 100);
  return [data.faceGroups.length, data.edgeGroups.length, ...data.metrics.bbox.flat().map(r), Math.round(data.metrics.volume)].join(",");
}

export class SelectionLayer {
  faces: FacePick[] = [];
  edges: EdgePick[] = [];
  vertices: VertexPick[] = [];
  sketch: SketchPick[] = [];
  bodies: string[] = [];
  sketches: string[] = [];
  private group = new THREE.Group();
  /** What each body was when it was last drawn (topologyKey): a face index means something only on the same body. */
  private shapes = new Map<string, string>();
  private labels = new Map<string, string>();
  /** The distance between two selected parallel edges: a line square to them, with its text. */
  private gap: { from: THREE.Vector3; to: THREE.Vector3; text: string } | null = null;
  /** Small dots on every corner, shown while corners are what a click selects. */
  private hints: THREE.Points | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.group.renderOrder = 40;
    scene.add(this.group);
  }

  /** Shows (or hides) a dot on each corner of the displayed bodies, to see what can be picked. */
  setCornerHints(corners: Point3[], on: boolean): void {
    if (this.hints) {
      this.scene.remove(this.hints);
      this.hints.geometry.dispose();
      (this.hints.material as THREE.Material).dispose();
      this.hints = null;
    }
    if (!on || corners.length === 0) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(corners.map((c) => new THREE.Vector3(...c)));
    this.hints = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x0ea5e9, size: 8, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.85 }));
    this.hints.renderOrder = 39;
    this.scene.add(this.hints);
  }

  get empty(): boolean {
    return this.count === 0;
  }

  get count(): number {
    return this.faces.length + this.edges.length + this.vertices.length + this.sketch.length + this.bodies.length + this.sketches.length;
  }

  snapshot(): ModelSelection {
    return { faces: [...this.faces], edges: [...this.edges], vertices: [...this.vertices], sketch: [...this.sketch], bodies: [...this.bodies], sketches: [...this.sketches] };
  }

  toggleBody(bodyId: string): void {
    const i = this.bodies.indexOf(bodyId);
    if (i >= 0) this.bodies.splice(i, 1);
    else this.bodies.push(bodyId);
  }

  toggleSketch(sketchId: string): void {
    const i = this.sketches.indexOf(sketchId);
    if (i >= 0) this.sketches.splice(i, 1);
    else this.sketches.push(sketchId);
  }

  /** Adds bodies and sketches not selected yet (window selection). */
  add(bodies: string[], sketches: string[]): void {
    for (const id of bodies) if (!this.bodies.includes(id)) this.bodies.push(id);
    for (const id of sketches) if (!this.sketches.includes(id)) this.sketches.push(id);
  }

  toggleFace(pick: FacePick): void {
    const i = this.faces.findIndex((f) => f.bodyId === pick.bodyId && f.faceIndex === pick.faceIndex);
    if (i >= 0) this.faces.splice(i, 1);
    else this.faces.push(pick);
  }

  toggleEdge(pick: EdgePick): void {
    const i = this.edges.findIndex((e) => key(e) === key(pick));
    if (i >= 0) this.edges.splice(i, 1);
    else this.edges.push(pick);
  }

  toggleVertex(pick: VertexPick): void {
    const i = this.vertices.findIndex((v) => v.bodyId === pick.bodyId && samePoint(v.point, pick.point));
    if (i >= 0) this.vertices.splice(i, 1);
    else this.vertices.push(pick);
  }

  toggleSketchItem(pick: SketchPick): void {
    const i = this.sketch.findIndex((p) => p.sketchId === pick.sketchId && p.kind === pick.kind && p.id === pick.id);
    if (i >= 0) this.sketch.splice(i, 1);
    else this.sketch.push(pick);
  }

  /** Drops the sketches, and picked elements of sketches, no longer drawn; true when something was dropped. */
  pruneSketch(drawn: ReadonlySet<string>): boolean {
    const before = this.sketch.length + this.sketches.length;
    this.sketch = this.sketch.filter((p) => drawn.has(p.sketchId));
    this.sketches = this.sketches.filter((id) => drawn.has(id));
    return this.sketch.length + this.sketches.length !== before;
  }

  clear(): void {
    this.faces = [];
    this.edges = [];
    this.vertices = [];
    this.sketch = [];
    this.bodies = [];
    this.sketches = [];
  }

  /** Text shown next to a selected edge (its length or diameter). */
  setEdgeLabel(pick: EdgePick, text: string): void {
    this.labels.set(key(pick), text);
  }

  /** The arrows at the ends of the selected edges keep their size on the screen (called every frame). */
  fitArrows(camera: THREE.PerspectiveCamera, viewHeight: number): void {
    fitArrows(this.group.children.filter((c) => c.userData.arrows), camera, viewHeight);
  }

  /** The distance shown between two selected parallel edges (null: none). */
  setGap(gap: { from: THREE.Vector3; to: THREE.Vector3; text: string } | null): void {
    this.gap = gap;
  }

  /**
   * Drops picks that no longer exist after the bodies were regenerated — and the faces and edges of a body whose shape
   * changed: the kernel numbers them anew, the same index would be another face (audit of 11/11/2026).
   */
  prune(bodies: Map<string, BodyView>): void {
    const same = (id: string) => {
      const body = bodies.get(id);
      return !!body && this.shapes.get(id) === topologyKey(body.data);
    };
    this.faces = this.faces.filter((f) => same(f.bodyId) && !!bodies.get(f.bodyId)?.data.faceGroups[f.faceIndex]);
    this.edges = this.edges.filter((e) => same(e.bodyId) && !!bodies.get(e.bodyId)?.data.edgeGroups[e.edgeIndex]);
    this.shapes = new Map([...bodies].map(([id, body]) => [id, topologyKey(body.data)]));
    this.vertices = this.vertices.filter((v) => {
      const body = bodies.get(v.bodyId);
      return !!body && bodyVertices(body.data).some((q) => samePoint(q, v.point));
    });
    this.bodies = this.bodies.filter((id) => bodies.has(id));
  }

  render(bodies: Map<string, BodyView>): void {
    for (const body of bodies.values()) {
      body.mesh.geometry.groups.forEach((group, index) => {
        const selected =
          this.bodies.includes(body.data.bodyId) || this.faces.some((f) => f.bodyId === body.data.bodyId && f.faceIndex === index);
        // Not selected: back to its own material (a face with a motif of its own has one).
        group.materialIndex = selected ? 1 : ((body.mesh.userData.faceMaterials as number[] | undefined)?.[index] ?? 0);
      });
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child.userData.fat) disposeFat(child as LineSegments2);
      else if (child.userData.arrows) disposeArrows(child);
      else if (child instanceof THREE.Mesh) (child.material as THREE.Material).dispose(); // its geometry belongs to the pick
      else if (child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const pick of this.sketch) {
      if (pick.kind === "region" && pick.fill) {
        const tint = new THREE.Mesh(pick.fill.geometry, new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
        tint.matrixAutoUpdate = false;
        tint.matrix.copy(pick.fill.matrix);
        tint.renderOrder = 39;
        this.group.add(tint);
      } else if (pick.kind === "curve") {
        const line = fatSegments(polylineSegments(pick.points.map((p) => new THREE.Vector3(...p))), SELECTED_LINE, SELECTED_WIDTH);
        line.renderOrder = 40;
        this.group.add(line);
      }
    }
    const points = [...this.vertices.map((v) => v.point), ...this.sketch.filter((p) => p.kind === "point").flatMap((p) => p.points)];
    if (points.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
      const dots = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xe11d48, size: 13, sizeAttenuation: false, depthTest: false }));
      dots.renderOrder = 41;
      this.group.add(dots);
    }
    for (const edge of this.edges) {
      const body = bodies.get(edge.bodyId);
      if (!body) continue;
      const points = edgePoints(body.data, edge.edgeIndex);
      const lines = fatSegments(points, SELECTED_LINE, SELECTED_WIDTH);
      lines.renderOrder = 40;
      this.group.add(lines);
      // A straight edge gets an arrow at each end: where it starts and where it stops.
      const arrows = edgeArrows(points, SELECTED_LINE);
      if (arrows) this.group.add(arrows);
      // Two parallel edges show the distance between them instead of their lengths (still in the panel).
      const text = this.gap && this.edges.length === 2 ? undefined : this.labels.get(key(edge));
      if (text) {
        const label = document.createElement("span");
        label.className = "cad-measure";
        label.textContent = text;
        const object = new CSS2DObject(label);
        object.position.copy(edgeMidpoint(body.data, edge.edgeIndex));
        this.group.add(object);
      }
    }
    if (this.gap && this.edges.length === 2) {
      const line = fatSegments([this.gap.from, this.gap.to], GAP_LINE, 2.5);
      line.renderOrder = 41;
      this.group.add(line);
      const label = document.createElement("span");
      label.className = "cad-measure cad-measure-gap";
      label.textContent = this.gap.text;
      const object = new CSS2DObject(label);
      object.position.copy(this.gap.from).lerp(this.gap.to, 0.5);
      this.group.add(object);
    }
  }
}
