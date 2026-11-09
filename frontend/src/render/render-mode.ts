/**
 * Mode Rendu (comme l'espace Rendu de Fusion) : la vue montre le modèle en lancer de rayons progressif — l'image
 * s'affine tant que la caméra ne bouge pas, en basse résolution pendant qu'on tourne autour. On y règle
 * l'environnement, le sol, la caméra (focale, exposition, profondeur de champ) et on rend des images en haute
 * résolution. L'édition reste intacte : la scène du rendu est une copie, refaite quand le modèle change.
 */
import * as THREE from "three";
import type { PhysicalCamera, WebGLPathTracer } from "three-gpu-pathtracer";
import type { FaceAppearance } from "../appearance/assign";
import { motifsPending } from "../appearance/three-materials";
import type { Viewport } from "../viewport/viewport";
import { RenderScene, type BodyLook } from "./render-scene";
import { installShadowCatcher, setCatcherNorm } from "./shadow-catcher";
import { focalToFov, type RenderSettings } from "./settings";

export interface RenderProgress {
  samples: number;
  target: number;
  paused: boolean;
  /** Rendering an image (final render): its size. */
  capture: { width: number; height: number } | null;
}

/** What changed in the settings, so the render redoes only that. */
export type RenderChange = "environment" | "ground" | "materials" | "camera" | "quality";

const TONE: Record<RenderSettings["toneMapping"], THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/** The path tracing library, loaded when the render mode first opens (see app/render-workspace.ts). */
export type PathTracerLibrary = typeof import("three-gpu-pathtracer");

interface Capture {
  width: number;
  height: number;
  samples: number;
  resolve(url: string): void;
  reject(error: Error): void;
}

export class RenderMode {
  private tracer: WebGLPathTracer | null = null;
  private world: RenderScene | null = null;
  private readonly camera: PhysicalCamera;
  private saved: { toneMapping: THREE.ToneMapping; exposure: number; fov: number; clickOverride: Viewport["clickOverride"] } | null = null;
  private signature = "";
  private dirty = false;
  private capturing: Capture | null = null;
  private restoreSize: (() => void) | null = null;
  paused = false;
  /** The next click in the view sets the sharp distance (depth of field). */
  focusPicking = false;
  onProgress: (progress: RenderProgress) => void = () => {};
  onFocusPicked: (distance: number) => void = () => {};

  constructor(
    private readonly library: PathTracerLibrary,
    private readonly viewport: Viewport,
    private readonly look: (bodyId: string) => BodyLook,
    public settings: RenderSettings,
    /** The faces of a body with a motif of their own. */
    private readonly faces: (bodyId: string) => FaceAppearance[] = () => [],
  ) {
    this.camera = new library.PhysicalCamera(40, 1, 1, 200000);
  }

  get active(): boolean {
    return this.tracer !== null;
  }

  enter(): void {
    if (this.tracer) return;
    const { renderer, camera } = this.viewport;
    this.saved = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, fov: camera.fov, clickOverride: this.viewport.clickOverride };
    this.viewport.clearSelection();
    // Clicks no longer select (the editing scene is not shown); one may set the focus.
    this.viewport.clickOverride = (event) => {
      if (this.focusPicking) this.pickFocus(event);
      return true;
    };
    const world = new RenderScene();
    const tracer = new this.library.WebGLPathTracer(renderer);
    tracer.dynamicLowRes = true;
    tracer.lowResScale = 0.3;
    tracer.minSamples = 2;
    tracer.fadeDuration = 250;
    tracer.renderDelay = 0;
    tracer.filterGlossyFactor = 0.5;
    // The quick preview (while the shaders compile): the shadow-catching ground is not drawn.
    tracer.rasterizeSceneCallback = (scene, view) => {
      const ground = world.groundMesh;
      const visible = ground.visible;
      if (world.groundIsMatte) ground.visible = false;
      renderer.render(scene, view);
      ground.visible = visible;
    };
    world.shadowCatcher = installShadowCatcher(this.tracingMaterial(tracer));
    this.world = world;
    this.tracer = tracer;
    this.paused = false;
    this.rebuild();
    this.viewport.setDrawOverride(this.draw);
  }

  exit(): void {
    if (!this.tracer || !this.saved) return;
    this.capturing?.reject(new Error("Rendu interrompu."));
    this.endCapture();
    this.viewport.setDrawOverride(null);
    this.tracer.dispose();
    this.world?.dispose();
    this.tracer = null;
    this.world = null;
    const { renderer, camera } = this.viewport;
    renderer.toneMapping = this.saved.toneMapping;
    renderer.toneMappingExposure = this.saved.exposure;
    camera.fov = this.saved.fov;
    camera.updateProjectionMatrix();
    this.viewport.clickOverride = this.saved.clickOverride;
    this.saved = null;
    this.focusPicking = false;
  }

  /** The path tracing material inside the tracer (the shadow catcher changes its shader and reads a value of it). */
  private tracingMaterial(tracer: WebGLPathTracer): THREE.ShaderMaterial {
    return (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })._pathTracer.material;
  }

  private applyEnvironment(): void {
    if (!this.tracer || !this.world) return;
    this.world.applyEnvironment(this.settings);
    setCatcherNorm(this.tracingMaterial(this.tracer), this.world.catcherNorm);
  }

  /** The model changed (regeneration, materials): the render scene is redone at the next frame. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Starts refining again from the first sample. */
  restart(): void {
    this.tracer?.reset();
  }

  /** Applies changed settings, redoing only what they touch. */
  update(change: RenderChange): void {
    const { tracer, world } = this;
    if (!tracer || !world) return;
    if (change === "environment") {
      this.applyEnvironment();
      tracer.updateEnvironment();
    } else if (change === "ground") {
      world.applyGround(this.settings);
      tracer.setScene(world.scene, this.camera);
    } else if (change === "materials") {
      world.applyFinishes(this.settings);
      tracer.setScene(world.scene, this.camera);
    } else if (change === "quality") {
      tracer.bounces = this.settings.bounces;
      tracer.reset();
    } else {
      this.applyCamera(true);
    }
  }

  private bodiesSignature(): string {
    return this.viewport
      .bodyMeshes()
      .map((m) => `${m.geometry.uuid}:${m.matrixWorld.elements.map((e) => e.toFixed(2)).join(",")}`)
      .join("|");
  }

  private rebuild(): void {
    const { tracer, world } = this;
    if (!tracer || !world) return;
    world.setBodies(this.viewport.bodyMeshes(), this.look, this.settings, this.faces);
    this.applyEnvironment();
    tracer.bounces = this.settings.bounces;
    this.applyCamera(false);
    tracer.setScene(world.scene, this.camera);
    this.signature = this.bodiesSignature();
    this.dirty = false;
    // A wood whose grain's photo is still loading: the tracer takes its textures again once drawn.
    void motifsPending()?.then(() => {
      if (this.tracer === tracer && this.world === world) tracer.setScene(world.scene, this.camera);
    });
  }

  /** Lens, depth of field and tone of the image; with `reset`, the refining starts again. */
  private applyCamera(reset: boolean): void {
    const { renderer, camera: view } = this.viewport;
    const s = this.settings;
    renderer.toneMapping = TONE[s.toneMapping];
    renderer.toneMappingExposure = 2 ** s.exposure;
    view.fov = focalToFov(s.focal);
    view.updateProjectionMatrix();
    const c = this.camera;
    c.position.copy(view.position);
    c.quaternion.copy(view.quaternion);
    c.fov = view.fov;
    if (!this.capturing) c.aspect = view.aspect;
    c.near = view.near;
    c.far = view.far;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    c.fStop = s.depthOfField ? s.fStop : Infinity;
    c.apertureBlades = 6;
    c.focusDistance = s.focusDistance ?? this.centreDistance();
    if (reset) this.tracer?.updateCamera();
  }

  /** Distance from the eye to the middle of the model, along the view. */
  private centreDistance(): number {
    const centre = this.world?.bounds.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return Math.max(10, centre.sub(this.camera.position).dot(forward));
  }

  private pickFocus(event: PointerEvent): void {
    this.focusPicking = false;
    const face = this.viewport.pickFace(event);
    if (!face) return;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.viewport.camera.quaternion);
    const distance = Math.max(10, face.point.clone().sub(this.viewport.camera.position).dot(forward));
    this.settings = { ...this.settings, focusDistance: distance };
    this.applyCamera(true);
    this.onFocusPicked(distance);
  }

  private cameraMoved(): boolean {
    const v = this.viewport.camera;
    const c = this.camera;
    return !c.position.equals(v.position) || !c.quaternion.equals(v.quaternion) || (!this.capturing && c.aspect !== v.aspect);
  }

  private draw = (): void => {
    const tracer = this.tracer;
    if (!tracer) return;
    if (this.capturing) return this.drawCapture(tracer, this.capturing);
    if (this.dirty || this.bodiesSignature() !== this.signature) this.rebuild();
    if (this.cameraMoved()) this.applyCamera(true);
    tracer.pausePathTracing = this.paused || tracer.samples >= this.settings.samples;
    tracer.renderSample();
    this.onProgress({ samples: Math.floor(tracer.samples), target: this.settings.samples, paused: this.paused, capture: null });
  };

  /**
   * Renders an image of `width` × `height` pixels with `samples` samples (the view shows it, letterboxed) and
   * resolves with it as a PNG data URL; the camera is the current one.
   */
  capture(width: number, height: number, samples: number): Promise<string> {
    const tracer = this.tracer;
    if (!tracer) return Promise.reject(new Error("Le mode Rendu n'est pas ouvert."));
    if (this.capturing) return Promise.reject(new Error("Une image est déjà en cours de rendu."));
    const { renderer } = this.viewport;
    const canvas = renderer.domElement;
    const size = renderer.getSize(new THREE.Vector2());
    const ratio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    canvas.style.objectFit = "contain";
    this.restoreSize = () => {
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
      canvas.style.objectFit = "";
    };
    return new Promise<string>((resolve, reject) => {
      this.capturing = { width, height, samples, resolve, reject };
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      tracer.dynamicLowRes = false;
      tracer.tiles.set(Math.ceil(width / 1920), Math.ceil(height / 1080));
      tracer.pausePathTracing = false;
      tracer.updateCamera();
    });
  }

  /** Stops the image being rendered (its promise is rejected). */
  cancelCapture(): void {
    this.capturing?.reject(new Error("Rendu de l'image annulé."));
    this.endCapture();
  }

  private drawCapture(tracer: WebGLPathTracer, job: Capture): void {
    tracer.renderSample();
    const samples = Math.floor(tracer.samples);
    this.onProgress({ samples, target: job.samples, paused: false, capture: { width: job.width, height: job.height } });
    if (samples < job.samples) return;
    // Read right after drawing, before the frame is shown (the drawing buffer is not kept).
    const url = this.viewport.renderer.domElement.toDataURL("image/png");
    job.resolve(url);
    this.endCapture();
  }

  private endCapture(): void {
    if (!this.capturing && !this.restoreSize) return;
    this.capturing = null;
    this.restoreSize?.();
    this.restoreSize = null;
    if (this.tracer) {
      this.tracer.dynamicLowRes = true;
      this.tracer.tiles.set(1, 1);
      this.applyCamera(true);
    }
  }
}
