/**
 * Selection of faces and edges of the displayed bodies (3D model mode):
 * click toggles an element, selected faces are tinted, selected edges are
 * drawn on top in orange with their dimension label.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { BodyMesh } from "../geometry/protocol";
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

export interface ModelSelection {
  faces: FacePick[];
  edges: EdgePick[];
}

interface BodyView {
  mesh: THREE.Mesh;
  data: BodyMesh;
}

const key = (e: EdgePick) => `${e.bodyId}#${e.edgeIndex}`;

export class SelectionLayer {
  faces: FacePick[] = [];
  edges: EdgePick[] = [];
  private group = new THREE.Group();
  private labels = new Map<string, string>();

  constructor(scene: THREE.Scene) {
    this.group.renderOrder = 40;
    scene.add(this.group);
  }

  get empty(): boolean {
    return this.faces.length === 0 && this.edges.length === 0;
  }

  snapshot(): ModelSelection {
    return { faces: [...this.faces], edges: [...this.edges] };
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

  clear(): void {
    this.faces = [];
    this.edges = [];
  }

  /** Text shown next to a selected edge (its length or diameter). */
  setEdgeLabel(pick: EdgePick, text: string): void {
    this.labels.set(key(pick), text);
  }

  /** Drops picks that no longer exist after the bodies were regenerated. */
  prune(bodies: Map<string, BodyView>): void {
    this.faces = this.faces.filter((f) => !!bodies.get(f.bodyId)?.data.faceGroups[f.faceIndex]);
    this.edges = this.edges.filter((e) => !!bodies.get(e.bodyId)?.data.edgeGroups[e.edgeIndex]);
  }

  render(bodies: Map<string, BodyView>): void {
    for (const body of bodies.values()) {
      body.mesh.geometry.groups.forEach((group, index) => {
        const selected = this.faces.some((f) => f.bodyId === body.data.bodyId && f.faceIndex === index);
        group.materialIndex = selected ? 1 : 0;
      });
    }
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
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
