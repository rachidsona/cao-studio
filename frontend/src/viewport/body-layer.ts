/**
 * Bodies drawn in the 3D view, from the meshes of the geometry worker: one subtle tint per body (separate
 * pieces stand out), their appearance (library: wood, stone, metal, glass… or their material's), the see-through
 * look of the sketch mode, and a pose that shows a door open without changing the model.
 */
import * as THREE from "three";
import type { BodyAppearance, FaceAppearance } from "../appearance/assign";
import { faceMarks, matchFace, type FaceMark } from "../appearance/face-looks";
import { appearanceKey } from "../appearance/library";
import { appearanceMaterial, applyFaceUvs, applyUvs, uvKeyOf } from "../appearance/three-materials";
import type { BodyMesh } from "../geometry/protocol";
import type { Vec3 } from "../sketcher/frame";
import { addDistinct, bodyVertices, type Point3 } from "./body-points";
import { hideJoints, isBoxBody } from "./joint-edges";

export type { BodyAppearance, FaceAppearance };

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

/** The layer of the bodies taken out of the view (the camera draws layer 0 only). */
const CUT_LAYER = 5;

export class BodyLayer {
  readonly bodies = new Map<string, BodyObject>();
  /** Second material of every mesh: the selected faces. */
  readonly highlightMaterial: THREE.MeshStandardMaterial;
  readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });
  /** The colour of a body without appearance: #F8F8F8 for all (their dark edges tell the pieces apart). */
  private tints: THREE.MeshStandardMaterial[] = [];
  private appearance: ((bodyId: string) => BodyAppearance | null) | null = null;
  private faceAppearance: ((bodyId: string) => FaceAppearance[]) | null = null;
  /** The marks of the faces of each mesh (to find the faces with a motif of their own). */
  private readonly marks = new WeakMap<BodyMesh, FaceMark[]>();
  private appearanceMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private opacity = 1;
  /** « Rayons X »: the bodies see-through, to look inside without hiding anything. */
  private xray = false;
  /** Joint lines between flush pieces left out (Curic Hidden). */
  private jointsHidden = false;
  /**
   * The bodies drawn a hair behind where they are (the walls of the room): a back panel or a unit against a wall lies
   * in its very plane, and the two would show in patches, one through the other. Their materials, pushed back.
   */
  private behind = new Set<string>();
  private behindMaterials = new Map<THREE.Material, THREE.Material>();

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
    return [...this.tints, ...this.appearanceMaterials.values(), ...this.behindMaterials.values(), this.highlightMaterial, this.edgeMaterial];
  }

  /**
   * Replaces the bodies drawn by these meshes. A body whose mesh is the very same object as before (unchanged: the
   * kernel did not send it again, geometry/worker.ts meshesOf) keeps its geometry — put back as a new one would be
   * (in view, at its place) — instead of being built again (audit of 11/11/2026).
   */
  replace(meshes: BodyMesh[]): void {
    const previous = new Map(this.bodies);
    this.bodies.clear();
    // New meshes, all in view: the walls in the way are taken out again at the next frame.
    this.cut = new Set();
    for (const [index, data] of meshes.entries()) {
      const kept = previous.get(data.bodyId);
      if (kept && kept.data === data) {
        previous.delete(data.bodyId);
        this.bodies.set(data.bodyId, kept);
        kept.mesh.visible = kept.edges.visible = true;
        this.setPose(data.bodyId, null);
        continue;
      }
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

      const edges = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMaterial);
      edges.userData.bodyId = data.bodyId;
      this.scene.add(mesh, edges);
      this.bodies.set(data.bodyId, { mesh, edges, data, tint });
    }
    for (const body of previous.values()) this.disposeBody(body);
    this.drawEdges();
    this.applyAppearance();
  }

  /** Hides (or shows again) the joint lines between pieces that meet flush (as Curic Hidden): the view only. */
  setJointsHidden(hidden: boolean): void {
    this.jointsHidden = hidden;
    this.drawEdges();
  }

  /** The edge lines of every body: its seams left out, and its joints when they are hidden. */
  private drawEdges(): void {
    const boxes = this.jointsHidden ? [...this.bodies.values()].filter((b) => isBoxBody(b.data.metrics.bbox, b.data.metrics.volume)).map((b) => [b.data.bodyId, b.data.metrics.bbox] as const) : [];
    for (const body of this.bodies.values()) {
      let drawn = drawnEdges(body.data);
      if (this.jointsHidden) drawn = hideJoints(drawn, body.data.metrics.bbox, boxes.filter(([id]) => id !== body.data.bodyId).map(([, box]) => box));
      body.edges.geometry.dispose();
      body.edges.geometry = new THREE.BufferGeometry();
      body.edges.geometry.setAttribute("position", new THREE.BufferAttribute(drawn.positions, 3));
      // Which edge each drawn line is (the seams and joints left out shift them).
      body.edges.userData.drawnGroups = drawn.groups;
    }
  }

  meshes(): THREE.Mesh[] {
    return [...this.bodies.values()].map((b) => b.mesh);
  }

  /** The bodies in sight: a ray goes through the hidden ones, as the eye does. */
  private shown(): BodyObject[] {
    return [...this.bodies.values()].filter((b) => b.mesh.visible && !this.cut.has(b.data.bodyId));
  }

  /** The walls taken out of the view because they stand between the eye and the room (app/wall-cutaway.ts). */
  private cut = new Set<string>();

  /** Whether this body is out of the view that way. */
  isCut(bodyId: string): boolean {
    return this.cut.has(bodyId);
  }

  /**
   * Takes these bodies out of the view, and out of reach of a click, without hiding them: on a layer the camera does
   * not draw. The others back on the camera's.
   */
  setCut(ids: ReadonlySet<string>): void {
    for (const [id, body] of this.bodies) {
      const out = ids.has(id);
      if (out === this.cut.has(id)) continue;
      for (const object of [body.mesh, body.edges]) object.layers.set(out ? CUT_LAYER : 0);
    }
    this.cut = new Set([...ids].filter((id) => this.bodies.has(id)));
  }

  /** The meshes a pick can hit. */
  shownMeshes(): THREE.Mesh[] {
    return this.shown().map((b) => b.mesh);
  }

  /** The edges a pick can hit. */
  shownEdges(): THREE.Object3D[] {
    return this.shown().map((b) => b.edges);
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

  /**
   * Colours the bodies by their material, and the faces with a motif of their own; null puts the plain tints back.
   * Applied again to every regeneration.
   */
  setAppearance(appearance: ((bodyId: string) => BodyAppearance | null) | null, faces: ((bodyId: string) => FaceAppearance[]) | null = null): void {
    this.appearance = appearance;
    this.faceAppearance = appearance ? faces : null;
    this.applyAppearance();
  }

  /** The walls of the room, drawn behind what stands against them in their plane (app/wall-cutaway.ts). */
  setBehind(ids: ReadonlySet<string>): void {
    if (ids.size === this.behind.size && [...ids].every((id) => this.behind.has(id))) return;
    this.behind = new Set(ids);
    this.applyAppearance();
  }

  /** A material pushed back in depth: what lies in the same plane in front of it wins, whatever the angle. */
  private pushedBack(material: THREE.Material): THREE.Material {
    let back = this.behindMaterials.get(material);
    if (!back) {
      back = material.clone();
      back.polygonOffset = true;
      back.polygonOffsetFactor = 4;
      back.polygonOffsetUnits = 8;
      // The section of the view cuts it as the others.
      back.clippingPlanes = material.clippingPlanes;
      this.behindMaterials.set(material, back);
    }
    return back;
  }

  private applyAppearance(): void {
    for (const [id, body] of this.bodies) {
      const look = this.appearance?.(id);
      const own = (m: THREE.Material) => (this.behind.has(id) ? this.pushedBack(m) : m);
      // Materials: the body's, the selection's, then one per motif of its faces (mesh.userData.faceMaterials).
      const materials: THREE.Material[] = [own(look ? this.appearanceMaterial(look) : body.tint), this.highlightMaterial];
      const perFace = body.data.faceGroups.map(() => 0);
      const ownFaces: { face: number; look: BodyAppearance }[] = [];
      const faces = this.faceAppearance?.(id) ?? [];
      if (faces.length) {
        let marks = this.marks.get(body.data);
        if (!marks) this.marks.set(body.data, (marks = faceMarks(body.data)));
        for (const f of faces) {
          const face = matchFace(marks, f.mark);
          if (face < 0) continue;
          const material = own(this.appearanceMaterial(f.look));
          const k = materials.indexOf(material);
          perFace[face] = k >= 0 ? k : materials.push(material) - 1;
          ownFaces.push({ face, look: f.look });
        }
      }
      body.mesh.material = materials;
      body.mesh.userData.faceMaterials = perFace;
      body.mesh.geometry.groups.forEach((group, i) => {
        if (group.materialIndex !== 1) group.materialIndex = perFace[i] ?? 0;
      });
      // Texture coordinates along the board's grain, redone only when the axis or the motif's tile changes (or a photo
      // goes over the whole board), each face with a motif of its own after its own.
      const base = look && look.appearance.pattern !== "plain" ? look : (ownFaces[0]?.look ?? null);
      if (!base) continue;
      const key = [uvKeyOf(base), ...ownFaces.map((f) => `${f.face}:${uvKeyOf(f.look)}`)].join(";");
      if (body.mesh.geometry.userData.uvKey === key) continue;
      applyUvs(body.mesh.geometry, base);
      for (const f of ownFaces) {
        const group = body.data.faceGroups[f.face]!;
        applyFaceUvs(body.mesh.geometry, f.look, group.start, group.count);
      }
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
    const opacity = this.opacity * (this.xray ? 0.68 : 1) * ((material.userData.baseOpacity as number | undefined) ?? 1);
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

  /** X-ray (translucent bodies, « Rayons X ») on or off; combined with the sketch mode's look. */
  setXray(on: boolean): void {
    this.xray = on;
    for (const material of this.materials()) this.fade(material);
  }

  /** Corners of the bodies in sight (model coordinates, mm), merged by position. */
  vertices(): Point3[] {
    const all: Point3[] = [];
    for (const body of this.shown()) for (const p of bodyVertices(body.data)) addDistinct(all, p);
    return all;
  }

  /**
   * Corner of a body within `reach` pixels of a canvas point (the nearer one to the eye when they overlap);
   * `size` is the canvas size in pixels.
   */
  vertexNear(camera: THREE.Camera, size: { width: number; height: number }, px: number, py: number, reach: number): { bodyId: string; point: Point3 } | null {
    let best: { pick: { bodyId: string; point: Point3 }; screen: number; depth: number } | null = null;
    const v = new THREE.Vector3();
    for (const body of this.shown()) {
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

  /** Box around the bodies in sight (a default box when there is none). */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3();
    const shown = this.shown();
    for (const body of shown.length ? shown : this.bodies.values()) box.expandByObject(body.mesh);
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
