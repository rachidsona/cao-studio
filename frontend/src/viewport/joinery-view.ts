/**
 * The joinery of a « Répartition » seen in volume (3D view): the niches that can be divided, as light boxes between
 * the panels (the one under the pointer brighter, the chosen ones green), and the panels the tool would make, as
 * orange slabs. Each box is a rectangle of the sketch pushed along its normal by the depth of the panels; in a body
 * furnished, the niche's shape between its walls.
 */
import * as THREE from "three";
import type { SketchFrame } from "../sketcher/frame";
import { toWorld } from "../sketcher/frame";
import type { NicheBox } from "../sketcher/shelves";
import type { Vec2 } from "../sketcher/edit";
import type { Vec3 } from "../sketcher/frame";
import { SELECTED_LINE } from "./colors";

export type NicheState = "free" | "hover" | "chosen";

const STYLE: Record<NicheState | "piece", { color: number; opacity: number; edges: number | null }> = {
  free: { color: 0x38bdf8, opacity: 0.07, edges: null },
  hover: { color: 0x38bdf8, opacity: 0.32, edges: 0x0284c7 },
  chosen: { color: SELECTED_LINE, opacity: 0.3, edges: SELECTED_LINE },
  piece: { color: 0xf97316, opacity: 0.7, edges: 0x9a3412 },
};

/** A box of the sketch (inset by `inset` mm on every side) pushed `depth` along the normal, as a mesh. */
function boxMesh(frame: SketchFrame, depth: number, box: NicheBox, inset: number, style: (typeof STYLE)[keyof typeof STYLE]): THREE.Mesh {
  const w = Math.max(box.x1 - box.x0 - 2 * inset, 0.01);
  const h = Math.max(box.y1 - box.y0 - 2 * inset, 0.01);
  const d = Math.max(Math.abs(depth) - 2 * inset, 0.01);
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const centre = new THREE.Vector3(...toWorld(frame, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)).addScaledVector(new THREE.Vector3(...frame.normal), depth / 2);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal)).setPosition(centre);
  mesh.updateMatrixWorld(true);
  mesh.renderOrder = 30;
  if (style.edges !== null) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: style.edges, transparent: true, opacity: 0.9 }));
    edges.renderOrder = 31;
    mesh.add(edges);
  }
  return mesh;
}

/** An outline of the sketch pushed `depth` along the normal (a panel, its mitred end included), as a mesh. */
function prismMesh(frame: SketchFrame, depth: number, outline: Vec2[], style: (typeof STYLE)[keyof typeof STYLE]): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal)).setPosition(new THREE.Vector3(...frame.origin));
  mesh.updateMatrixWorld(true);
  mesh.renderOrder = 30;
  if (style.edges !== null) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: style.edges, transparent: true, opacity: 0.9 }));
    edges.renderOrder = 31;
    mesh.add(edges);
  }
  return mesh;
}

/** A box of the world between two opposite corners, as a mesh. */
function worldBoxMesh(a: Vec3, b: Vec3, style: (typeof STYLE)[keyof typeof STYLE]): THREE.Mesh {
  const size = [0, 1, 2].map((i) => Math.max(Math.abs(b[i]! - a[i]!), 0.01)) as Vec3;
  const geometry = new THREE.BoxGeometry(...size);
  const material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  mesh.renderOrder = 30;
  if (style.edges !== null) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: style.edges, transparent: true, opacity: 0.9 }));
    edges.renderOrder = 31;
    mesh.add(edges);
  }
  return mesh;
}

/** A piece of the preview at this depth, to tell it from the others. */
export const pieceKey = (outline: Vec2[], depth: number): string => `${Math.round(depth)}|${outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(";")}`;

export class JoineryView {
  private readonly group = new THREE.Group();
  private nicheMeshes: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {
    scene.add(this.group);
  }

  /**
   * Draws the niches (each in its state) and the pieces (outlines of the sketch); `depth` along the sketch normal (mm).
   * `solids`: other pieces, as boxes of the world given by two opposite corners (the parts of a penderie or drawers).
   */
  show(frame: SketchFrame, depth: number, niches: { box: NicheBox; state: NicheState; outline?: Vec2[] | null }[], pieces: Vec2[][], solids: [Vec3, Vec3][] = []): void {
    this.clear();
    this.nicheMeshes = niches.map(({ box, state, outline }, index) => {
      // In a body furnished: its shape between the walls (sketcher/niche-outline.ts), else its box.
      const mesh = outline ? prismMesh(frame, depth, outline, STYLE[state]) : boxMesh(frame, depth, box, 0.6, STYLE[state]);
      // Its edges too: the ray meets the outline's lines as well as the box, and either names the niche (a click
      // near an edge found no niche, about one time in three: « Cliquez dans une niche »).
      mesh.traverse((o) => (o.userData.niche = index));
      return mesh;
    });
    const slabs = [...pieces.map((outline) => prismMesh(frame, depth, outline, STYLE.piece)), ...solids.map(([a, b]) => worldBoxMesh(a, b, STYLE.piece))];
    // Three.js complains about an `add` with nothing to add.
    const objects = [...this.nicheMeshes, ...slabs];
    if (objects.length) this.group.add(...objects);
  }

  /** The niche meshes, to find the one under the pointer (`userData.niche`: its index in `show`). */
  targets(): THREE.Object3D[] {
    return this.nicheMeshes;
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.nicheMeshes = [];
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
