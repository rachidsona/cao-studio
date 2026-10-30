/**
 * Vignettes des apparences (comme les sphères de la bibliothèque de Fusion) : chaque apparence rendue une fois sur une
 * sphère éclairée en studio, posée devant un damier (on voit le verre), puis gardée en image. Rendues quelques-unes par
 * image affichée pour ne pas figer l'éditeur ; sans WebGL, une pastille de couleur les remplace.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Appearance } from "./library";
import { appearanceMaterial, tileOf } from "./three-materials";

const SIZE = 112;
/** Diameter of the sphere (mm), so the motifs show at their real scale. */
const DIAMETER = 360;

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sphere: THREE.Mesh<THREE.SphereGeometry, THREE.Material>;
  uvs: Float32Array;
}

let stage: Stage | null | undefined;
const cache = new Map<string, string>();
const waiting = new Map<string, { appearance: Appearance; color?: string; done: ((url: string | null) => void)[] }>();
let scheduled = false;

function checker(): THREE.DataTexture {
  const n = 8;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const on = (Math.floor(i / n) + (i % n)) % 2 === 0;
    data.set(on ? [235, 236, 238, 255] : [186, 189, 194, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, n, n);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeStage(): Stage | null {
  try {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: checker() }));
    backdrop.position.set(0, 0, -1.6);
    scene.add(backdrop);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial());
    sphere.rotation.x = 0.35;
    scene.add(sphere);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0.35, 4);
    camera.lookAt(0, 0, 0);
    const uvs = Float32Array.from(sphere.geometry.getAttribute("uv").array);
    return { renderer, scene, camera, sphere, uvs };
  } catch {
    return null;
  }
}

function draw(s: Stage, appearance: Appearance, color?: string): string {
  const material = appearanceMaterial(appearance, color, "swatch");
  // Texture coordinates at the motif's real scale over the sphere (around it, then pole to pole).
  const [tu, tv] = tileOf(appearance);
  const uv = s.sphere.geometry.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (s.uvs[i * 2]! * Math.PI * DIAMETER) / tu, (s.uvs[i * 2 + 1]! * Math.PI * DIAMETER) / 2 / tv);
  uv.needsUpdate = true;
  // The previous material is kept: disposing of it would throw away its compiled shader, shared with the next ones.
  s.sphere.material = material;
  s.renderer.render(s.scene, s.camera);
  return s.renderer.domElement.toDataURL("image/png");
}

function work(): void {
  scheduled = false;
  stage ??= makeStage();
  // A few milliseconds per displayed frame, so the editor stays fluid.
  const start = performance.now();
  for (const [key, job] of waiting) {
    if (performance.now() - start > 12) break;
    waiting.delete(key);
    const url = stage ? draw(stage, job.appearance, job.color) : null;
    if (url) cache.set(key, url);
    for (const done of job.done) done(url);
  }
  if (waiting.size && !scheduled) {
    scheduled = true;
    requestAnimationFrame(work);
  }
}

/** The swatch of an appearance (PNG data URL), or null without WebGL; drawn soon after the first call. */
export function swatch(appearance: Appearance, color?: string): Promise<string | null> {
  const key = `${appearance.id}|${color ?? ""}`;
  const known = cache.get(key);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const job = waiting.get(key);
    if (job) job.done.push(resolve);
    else waiting.set(key, { appearance, color, done: [resolve] });
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(work);
    }
  });
}
