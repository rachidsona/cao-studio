/**
 * Bodies drawn in the 3D view, from the meshes of the geometry worker: one subtle tint per body (separate
 * pieces stand out), their appearance (library: wood, stone, metal, glass… or their material's), the see-through
 * look of the sketch mode, and a pose that shows a door open without changing the model.
 */
import * as THREE from "three";
import type { BodyAppearance } from "../appearance/assign";
import { appearanceKey } from "../appearance/library";
import { appearanceMaterial, applyUvs, tileOf } from "../appearance/three-materials";
import type { BodyMesh } from "../geometry/protocol";
import type { Vec3 } from "../sketcher/frame";
import { addDistinct, bodyVertices, type Point3 } from "./body-points";

export type { BodyAppearance };

export interface BodyObject {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  data: BodyMesh;
  /** The plain colour of the body, put back when it has no appearance. */
  tint: THREE.Material;
}

/** The edge lines drawn for a body, and which B-rep edge each run of their vertices is (for picking). */
export interface DrawnEdges {
  positions: Float32Array;
  /** Vertex ranges of `positions` (in vertex units), each with the index of its edge in the body's edges. */
  groups: { start: number; count: number; edge: number }[];
}

/**
 * The edge lines drawn for a body: all its edges but the seams between coplanar faces. Leaving the seams out shifts
 * the vertices of the edges after them: `groups` keeps, for each drawn run, the number of the edge it is, so that a
 * click on a line selects that very edge.
 */
export function drawnEdges(data: Pick<BodyMesh, "edges" | "edgeGroups" | "seams">): DrawnEdges {
  const seams = new Set(data.seams ?? []);
  if (seams.size === 0) return { positions: data.edges, groups: data.edgeGroups.map((g, edge) => ({ start: g.start, count: g.count, edge })) };
  const groups: DrawnEdges["groups"] = [];
  let at = 0;
  data.edgeGroups.forEach((g, edge) => {
    if (seams.has(edge)) return;
    groups.push({ start: at, count: g.count, edge });
    at += g.count;
  });
  const positions = new Float32Array(at * 3);
  groups.forEach((g) => {
    const source = data.edgeGroups[g.edge] as { start: number; count: number };
    positions.set(data.edges.subarray(source.start * 3, (source.start + source.count) * 3), g.start * 3);
  });
  return { positions, groups };
}

/** The B-rep edge of a drawn vertex of a body's edge lines (-1 for none). */
export function drawnEdgeAt(groups: DrawnEdges["groups"], vertexIndex: number): number {
  return groups.find((g) => vertexIndex >= g.start && vertexIndex < g.start + g.count)?.edge ?? -1;
}

/** Colour of the bodies by default (no appearance, no material shown). */
export const BODY_COLOR = 0xf8f8f8;

export class BodyLayer {
  readonly bodies = new Map<string, BodyObject>();
  /** Second material of every mesh: the selected faces. */
  readonly highlightMaterial: THREE.MeshStandardMaterial;
  readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });
  /** The colour of a body without appearance: #F8F8F8 for all (their dark edges tell the pieces apart). */
  private tints: THREE.MeshStandardMaterial[] = [];
  private appearance: ((bodyId: string) => BodyAppearance | null) | null = null;
  private appearanceMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private opacity = 1;

  /** `environment`: what the appearances reflect (a studio), so metals and lacquers look like them. */
  constructor(
    private readonly scene: THREE.Scene,
    private readonly environment: THREE.Texture | null = null,
  ) {
    const base = new THREE.MeshStandardMaterial({ color: BODY_COLOR, metalness: 0, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.highlightMaterial = base.clone();
    this.highlightMaterial.color.set(0x0ea5e9);
    for (const color of [BODY_COLOR]) {
      const material = base.clone();
      material.color.set(color);
      this.tints.push(material);
    }
  }

  /** Every material of the bodies (the section of the view and the sketch mode change them all). */
  materials(): THREE.Material[] {
    return [...this.tints, ...this.appearanceMaterials.values(), this.highlightMaterial, this.edgeMaterial];
  }

  /** Replaces the bodies drawn by these meshes. */
  replace(meshes: BodyMesh[]): void {
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.bodies.clear();
    for (const [index, data] of meshes.entries()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      for (const group of data.faceGroups) geometry.addGroup(group.start, group.count, 0);
      geometry.computeBoundingSphere();
      const tint = this.tints[index % this.tints.length] as THREE.MeshStandardMaterial;
      const mesh = new THREE.Mesh(geometry, [tint, this.highlightMaterial]);
      mesh.userData.bodyId = data.bodyId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const edgeGeometry = new THREE.BufferGeometry();
      const drawn = drawnEdges(data);
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(drawn.positions, 3));
      const edges = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
      edges.userData.bodyId = data.bodyId;
      // Which edge each drawn line is (the seams left out shift them).
      edges.userData.drawnGroups = drawn.groups;
      this.scene.add(mesh, edges);
      this.bodies.set(data.bodyId, { mesh, edges, data, tint });
    }
    this.applyAppearance();
  }

  meshes(): THREE.Mesh[] {
    return [...this.bodies.values()].map((b) => b.mesh);
  }

  /** A rotation (row-major 3×3) and a translation applied to a body's mesh and edges; null puts it back. */
  setPose(bodyId: string, pose: { rotation: number[]; translation: Vec3 } | null): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    const r = pose?.rotation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const t = pose?.translation ?? [0, 0, 0];
    for (const object of [body.mesh, body.edges]) {
      object.matrixAutoUpdate = false;
      object.matrix.set(r[0]!, r[1]!, r[2]!, t[0], r[3]!, r[4]!, r[5]!, t[1], r[6]!, r[7]!, r[8]!, t[2], 0, 0, 0, 1);
      object.updateMatrixWorld(true);
    }
  }

  /** Shows or hides a body's mesh and edges (view only: a step of the assembly instructions). */
  setVisible(bodyId: string, visible: boolean): void {
    const body = this.bodies.get(bodyId);
    if (body) body.mesh.visible = body.edges.visible = visible;
  }

  /** Colours the bodies by their material; null puts the plain tints back. Applied again to every regeneration. */
  setAppearance(appearance: ((bodyId: string) => BodyAppearance | null) | null): void {
    this.appearance = appearance;
    this.applyAppearance();
  }

  private applyAppearance(): void {
    for (const [id, body] of this.bodies) {
      const look = this.appearance?.(id);
      (body.mesh.material as THREE.Material[])[0] = look ? this.appearanceMaterial(look) : body.tint;
      if (!look || look.appearance.pattern === "plain") continue;
      // Texture coordinates along the board's grain, redone only when the axis or the motif's tile changes (or a photo
      // goes over the whole board).
      const key = `${look.grainAxis}|${look.appearance.whole ? "whole" : tileOf(look.appearance).join("x")}`;
      if (body.mesh.geometry.userData.uvKey === key) continue;
      applyUvs(body.mesh.geometry, look);
      body.mesh.geometry.userData.uvKey = key;
    }
  }

  /** One material per appearance and colour (library: colour or computed texture, relief, glass see-through). */
  private appearanceMaterial(look: BodyAppearance): THREE.MeshPhysicalMaterial {
    const key = `${appearanceKey(look.appearance)}|${look.color ?? ""}`;
    let material = this.appearanceMaterials.get(key);
    if (material) return material;
    material = appearanceMaterial(look.appearance, look.color, "view");
    material.envMap = this.environment;
    material.envMapIntensity = 0.7;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.userData.baseOpacity = material.opacity;
    this.fade(material);
    material.clippingPlanes = (this.tints[0] as THREE.Material).clippingPlanes;
    this.appearanceMaterials.set(key, material);
    return material;
  }

  /** The sketch mode's see-through look over a material's own opacity (glass stays more transparent). */
  private fade(material: THREE.Material): void {
    const opacity = this.opacity * ((material.userData.baseOpacity as number | undefined) ?? 1);
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthWrite = opacity === 1;
    material.needsUpdate = true;
  }

  /** See-through bodies (sketch mode) or solid ones. */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    for (const material of this.materials()) this.fade(material);
  }

  /** Corners of the displayed bodies (model coordinates, mm), merged by position. */
  vertices(): Point3[] {
    const all: Point3[] = [];
    for (const body of this.bodies.values()) for (const p of bodyVertices(body.data)) addDistinct(all, p);
    return all;
  }

  /**
   * Corner of a body within `reach` pixels of a canvas point (the nearer one to the eye when they overlap);
   * `size` is the canvas size in pixels.
   */
  vertexNear(camera: THREE.Camera, size: { width: number; height: number }, px: number, py: number, reach: number): { bodyId: string; point: Point3 } | null {
    let best: { pick: { bodyId: string; point: Point3 }; screen: number; depth: number } | null = null;
    const v = new THREE.Vector3();
    for (const body of this.bodies.values()) {
      for (const point of bodyVertices(body.data)) {
        v.set(...point).project(camera);
        if (v.z < -1 || v.z > 1) continue;
        const screen = Math.hypot(((v.x + 1) / 2) * size.width - px, ((1 - v.y) / 2) * size.height - py);
        if (screen > reach) continue;
        const depth = v.z;
        if (!best || screen < best.screen - 1 || (screen < best.screen + 1 && depth < best.depth)) {
          best = { pick: { bodyId: body.data.bodyId, point }, screen, depth };
        }
      }
    }
    return best?.pick ?? null;
  }

  /** Thickness of a body under a point of its surface: how far a ray going in (along `inward`) travels inside it. */
  depthAt(bodyId: string, point: Vec3, inward: Vec3): number | null {
    const body = this.bodies.get(bodyId);
    if (!body) return null;
    const ray = new THREE.Raycaster(new THREE.Vector3(...point).addScaledVector(new THREE.Vector3(...inward), 1e-3), new THREE.Vector3(...inward).normalize());
    const hit = ray.intersectObject(body.mesh, false)[0];
    return hit ? hit.distance + 1e-3 : null;
  }

  /** Box around the bodies (a default box when there is none). */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const body of this.bodies.values()) box.expandByObject(body.mesh);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
    return box;
  }

  private disposeBody(body: BodyObject): void {
    this.scene.remove(body.mesh, body.edges);
    body.mesh.geometry.dispose();
    body.edges.geometry.dispose();
  }

  dispose(): void {
    for (const body of this.bodies.values()) this.disposeBody(body);
  }
}
