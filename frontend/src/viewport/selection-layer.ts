/**
 * Selection of faces, edges and corners of the displayed bodies (3D model
 * mode): click toggles an element, selected faces are tinted, selected edges
 * are drawn on top in orange with their dimension label, selected corners
 * are marked with a rose dot.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { BodyMesh } from "../geometry/protocol";
import { bodyVertices, samePoint, type Point3 } from "./body-points";
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
  /** Whole bodies (selection filter "Corps"). */
  bodies: string[];
}

/** What a click selects in the 3D model. */
export type SelectionFilter = "auto" | "face" | "edge" | "vertex" | "body";

interface BodyView {
  mesh: THREE.Mesh;
  data: BodyMesh;
}

const key = (e: EdgePick) => `${e.bodyId}#${e.edgeIndex}`;

export class SelectionLayer {
  faces: FacePick[] = [];
  edges: EdgePick[] = [];
  vertices: VertexPick[] = [];
  sketch: SketchPick[] = [];
  bodies: string[] = [];
  private group = new THREE.Group();
  private labels = new Map<string, string>();
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
    return this.faces.length + this.edges.length + this.vertices.length + this.sketch.length + this.bodies.length;
  }

  snapshot(): ModelSelection {
    return { faces: [...this.faces], edges: [...this.edges], vertices: [...this.vertices], sketch: [...this.sketch], bodies: [...this.bodies] };
  }

  toggleBody(bodyId: string): void {
    const i = this.bodies.indexOf(bodyId);
    if (i >= 0) this.bodies.splice(i, 1);
    else this.bodies.push(bodyId);
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

  /** Drops the picked elements of sketches no longer drawn; true when something was dropped. */
  pruneSketch(drawn: ReadonlySet<string>): boolean {
    const before = this.sketch.length;
    this.sketch = this.sketch.filter((p) => drawn.has(p.sketchId));
    return this.sketch.length !== before;
  }

  clear(): void {
    this.faces = [];
    this.edges = [];
    this.vertices = [];
    this.sketch = [];
    this.bodies = [];
  }

  /** Text shown next to a selected edge (its length or diameter). */
  setEdgeLabel(pick: EdgePick, text: string): void {
    this.labels.set(key(pick), text);
  }

  /** Drops picks that no longer exist after the bodies were regenerated. */
  prune(bodies: Map<string, BodyView>): void {
    this.faces = this.faces.filter((f) => !!bodies.get(f.bodyId)?.data.faceGroups[f.faceIndex]);
    this.edges = this.edges.filter((e) => !!bodies.get(e.bodyId)?.data.edgeGroups[e.edgeIndex]);
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
        group.materialIndex = selected ? 1 : 0;
      });
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child instanceof THREE.Mesh) (child.material as THREE.Material).dispose(); // its geometry belongs to the pick
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
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pick.points.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
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
      const geometry = new THREE.BufferGeometry().setFromPoints(edgePoints(body.data, edge.edgeIndex));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      lines.renderOrder = 40;
      this.group.add(lines);
      const text = this.labels.get(key(edge));
      if (text) {
        const label = document.createElement("span");
        label.className = "cad-measure";
        label.textContent = text;
        const object = new CSS2DObject(label);
        object.position.copy(edgeMidpoint(body.data, edge.edgeIndex));
        this.group.add(object);
      }
    }
  }
}
