/**
 * La scène du rendu, à part de celle de l'édition : copies des corps affichés (avec leur pose, porte ouverte
 * comprise) en matières physiques, un sol (ombres seules, studio ou parquet) et l'environnement d'éclairage HDR.
 */
import * as THREE from "three";
import { ENV_ROTATION_X, environmentNorm, environmentPixels } from "./environments";
import type { BodyAppearance } from "../appearance/assign";
import { DEFAULT_APPEARANCE, appearanceById } from "../appearance/library";
import { appearanceMaterial, applyUvs, motifTextures, tileOf } from "../appearance/three-materials";
import type { RenderSettings } from "./settings";

/** How one body looks in the render: its appearance, or null for the default one. */
export type BodyLook = BodyAppearance | null;

/** The path tracer reads `matte` on a material: the surface shows what is behind it and only catches shadows. */
type GroundMaterial = THREE.MeshPhysicalMaterial & { matte?: boolean };

const ENV_WIDTH = 1024;
/** The parquet of the "Parquet" ground. */
const FLOOR = appearanceById("wood-oak")!;

export class RenderScene {
  readonly scene = new THREE.Scene();
  private bodies = new THREE.Group();
  private ground: THREE.Mesh<THREE.PlaneGeometry, GroundMaterial>;
  private materials = new Map<string, THREE.MeshPhysicalMaterial>();
  private environment: THREE.DataTexture | null = null;
  private environmentKey = "";
  private norm = 1;
  private box = new THREE.Box3();
  /** The path tracer turns `matte` surfaces into shadow catchers (see shadow-catcher.ts); otherwise "shadows" is a white floor. */
  shadowCatcher = true;

  constructor() {
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhysicalMaterial({ color: 0xffffff }) as GroundMaterial);
    this.scene.add(this.bodies, this.ground);
    this.scene.environmentRotation.set(ENV_ROTATION_X, 0, 0);
    this.scene.backgroundRotation.set(ENV_ROTATION_X, 0, 0);
  }

  /** Box around the bodies (model coordinates, mm). */
  get bounds(): THREE.Box3 {
    return this.box;
  }

  /** The ground is a shadow catcher: invisible in the quick preview, only its shadows show in the render. */
  get groundIsMatte(): boolean {
    return this.ground.material.matte === true;
  }

  /** Light of a white ground with nothing around it, at the current brightness (for the shadow catcher). */
  get catcherNorm(): number {
    return this.norm * this.scene.environmentIntensity;
  }

  get groundMesh(): THREE.Mesh {
    return this.ground;
  }

  /** Replaces the bodies by copies of these editing meshes, each with its look. */
  setBodies(meshes: THREE.Mesh[], look: (bodyId: string) => BodyLook, settings: RenderSettings): void {
    for (const child of this.bodies.children) (child as THREE.Mesh).geometry.dispose();
    this.bodies.clear();
    this.box.makeEmpty();
    for (const source of meshes) {
      const id = source.userData.bodyId as string;
      const src = source.geometry;
      const position = src.getAttribute("position");
      const normal = src.getAttribute("normal");
      if (!position || !normal) continue;
      const appearance: BodyAppearance = look(id) ?? { appearance: DEFAULT_APPEARANCE, grainAxis: 0 };
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", position.clone());
      geometry.setAttribute("normal", normal.clone());
      applyUvs(geometry, appearance);
      if (src.index) geometry.setIndex(src.index.clone());
      const mesh = new THREE.Mesh(geometry, this.material(appearance, settings));
      mesh.userData.look = appearance;
      source.updateMatrixWorld();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.matrixWorld);
      mesh.userData.bodyId = id;
      this.bodies.add(mesh);
      geometry.computeBoundingBox();
      this.box.union(geometry.boundingBox!.clone().applyMatrix4(mesh.matrix));
    }
    if (this.box.isEmpty()) this.box.set(new THREE.Vector3(-500, -500, 0), new THREE.Vector3(500, 500, 500));
    this.scene.updateMatrixWorld(true);
    this.applyGround(settings);
  }

  /** One physical material per appearance, colour and finish (library: textures, relief, glass, metals…). */
  private material(look: BodyAppearance, settings: RenderSettings): THREE.MeshPhysicalMaterial {
    const finish = settings.finishes[look.appearance.id] ?? "auto";
    const key = `${look.appearance.id}|${look.color ?? ""}|${finish}`;
    let material = this.materials.get(key);
    if (!material) {
      material = appearanceMaterial(look.appearance, look.color, "render", finish);
      this.materials.set(key, material);
    }
    return material;
  }

  /** Finishes changed (lacquered, satin…): the bodies take their new materials (the tracer then reads the scene again). */
  applyFinishes(settings: RenderSettings): void {
    for (const child of this.bodies.children) {
      const mesh = child as THREE.Mesh;
      mesh.material = this.material(mesh.userData.look as BodyAppearance, settings);
    }
  }

  /** The ground under the bodies: shadow catcher, studio floor or parquet, wide enough to reach the horizon. */
  applyGround(settings: RenderSettings): void {
    const size = this.box.getSize(new THREE.Vector3());
    const extent = Math.max(20000, Math.max(size.x, size.y, size.z) * 40);
    const material = this.ground.material;
    this.ground.visible = settings.ground !== "none";
    this.ground.scale.set(extent, extent, 1);
    this.ground.position.set((this.box.min.x + this.box.max.x) / 2, (this.box.min.y + this.box.max.y) / 2, this.box.min.z - 0.05);
    material.matte = settings.ground === "shadows" && this.shadowCatcher;
    const parquet = settings.ground === "wood" ? motifTextures(FLOOR) : null;
    material.map = parquet?.map ?? null;
    material.normalMap = parquet?.normal ?? null;
    material.color.set(settings.ground === "studio" ? settings.groundColor : 0xffffff);
    material.roughness = 1 - 0.92 * settings.reflections;
    material.clearcoat = settings.ground === "wood" ? 0.3 : 0;
    material.clearcoatRoughness = 0.2;
    // The parquet's boards: the plane's 0…1 texture coordinates in tiles of the wood texture.
    const uv = this.ground.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const [cu, cv] = [extent / tileOf(FLOOR)[0], extent / (tileOf(FLOOR)[1] * 0.6)];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (i % 2) * cu, Math.floor(i / 2) * cv);
    uv.needsUpdate = true;
    material.needsUpdate = true;
    this.ground.updateMatrixWorld(true);
  }

  /** Environment light (recomputed only when it changes), its brightness, and what is seen behind the model. */
  applyEnvironment(settings: RenderSettings): void {
    const key = `${settings.environment}|${settings.rotation}|${settings.environment === "outdoor" ? settings.hour : ""}`;
    if (key !== this.environmentKey) {
      this.environment?.dispose();
      const height = ENV_WIDTH / 2;
      const pixels = environmentPixels(settings.environment, ENV_WIDTH, settings.rotation, settings.hour);
      this.norm = environmentNorm(pixels, ENV_WIDTH);
      const texture = new THREE.DataTexture(pixels, ENV_WIDTH, height, THREE.RGBAFormat, THREE.FloatType);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.magFilter = texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.environment = texture;
      this.environmentKey = key;
    }
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = settings.brightness;
    this.scene.backgroundIntensity = settings.brightness;
    this.scene.backgroundBlurriness = settings.backgroundBlur;
    this.scene.background = settings.background === "environment" ? this.environment : settings.background === "color" ? new THREE.Color(settings.backgroundColor) : null;
  }

  dispose(): void {
    for (const child of this.bodies.children) (child as THREE.Mesh).geometry.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    // The textures are shared with the editing view (appearance/three-materials.ts): they stay.
    for (const material of this.materials.values()) material.dispose();
    this.environment?.dispose();
  }
}
