/**
 * Bodies drawn in the 3D view, from the meshes of the geometry worker: one subtle tint per body (separate
 * pieces stand out), the colour and wood grain of their material, the see-through look of the sketch mode, and a
 * pose that shows a door open without changing the model.
 */
import * as THREE from "three";
import type { BodyMesh } from "../geometry/protocol";
import type { Vec3 } from "../sketcher/frame";
import { addDistinct, bodyVertices, type Point3 } from "./body-points";

export interface BodyObject {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  data: BodyMesh;
  /** The plain colour of the body, put back when it has no appearance. */
  tint: THREE.Material;
}

/** How a body looks when it has a material (cabinet making): its colour, and a wood grain along an axis. */
export interface BodyAppearance {
  color: string;
  wood?: boolean;
  /** Axis of the grain (the boards' length): the stripes run along it. */
  grainAxis?: 0 | 1 | 2;
}

export class BodyLayer {
  readonly bodies = new Map<string, BodyObject>();
  /** Second material of every mesh: the selected faces. */
  readonly highlightMaterial: THREE.MeshStandardMaterial;
  readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });
  /** One subtle tint per body, so separate pieces (e.g. boards of a split frame) stand out. */
  private tints: THREE.MeshStandardMaterial[] = [];
  private appearance: ((bodyId: string) => BodyAppearance | null) | null = null;
  private appearanceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private opacity = 1;

  constructor(private readonly scene: THREE.Scene) {
    const base = new THREE.MeshStandardMaterial({ color: 0xb8c4d1, metalness: 0.25, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.highlightMaterial = base.clone();
    this.highlightMaterial.color.set(0x0ea5e9);
    for (const color of [0xb8c4d1, 0xc8bba4, 0xaec4b6, 0xbfb6cc, 0xb4c0d8, 0xcfc3a9]) {
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

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(data.edges, 3));
      const edges = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
      edges.userData.bodyId = data.bodyId;
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

  /** Colours the bodies by their material; null puts the plain tints back. Applied again to every regeneration. */
  setAppearance(appearance: ((bodyId: string) => BodyAppearance | null) | null): void {
    this.appearance = appearance;
    this.applyAppearance();
  }

  private applyAppearance(): void {
    for (const [id, body] of this.bodies) {
      const look = this.appearance?.(id);
      (body.mesh.material as THREE.Material[])[0] = look ? this.appearanceMaterial(look) : body.tint;
    }
  }

  /** One material per look; the wood grain is stripes in world space along the grain axis, drawn by the shader. */
  private appearanceMaterial(look: BodyAppearance): THREE.MeshStandardMaterial {
    const wood = look.wood === true;
    const axis = look.grainAxis ?? 0;
    const key = `${look.color}|${wood}|${axis}`;
    let material = this.appearanceMaterials.get(key);
    if (material) return material;
    material = (this.tints[0] as THREE.MeshStandardMaterial).clone();
    material.color.set(look.color);
    material.metalness = 0;
    material.roughness = wood ? 0.75 : 0.6;
    material.transparent = this.opacity < 1;
    material.opacity = this.opacity;
    material.depthWrite = this.opacity === 1;
    if (wood) {
      const across = [1, 1, 1].map((c, i) => (i === axis ? 0 : c));
      const length = Math.hypot(...across);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uAcross = { value: new THREE.Vector3(...across).divideScalar(length) };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nuniform vec3 uAcross;")
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n{ float t = dot(vWorld, uAcross) * 0.35; float ring = sin(t + 2.2 * sin(t * 0.21) + 0.9 * sin(dot(vWorld, vec3(0.013, 0.011, 0.017)))); diffuseColor.rgb *= 0.84 + 0.16 * (0.5 + 0.5 * ring) + 0.05 * sin(t * 5.3); }",
          );
      };
      material.customProgramCacheKey = () => key;
    }
    material.clippingPlanes = (this.tints[0] as THREE.Material).clippingPlanes;
    this.appearanceMaterials.set(key, material);
    return material;
  }

  /** See-through bodies (sketch mode) or solid ones. */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    for (const material of this.materials()) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity === 1;
      material.needsUpdate = true;
    }
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
