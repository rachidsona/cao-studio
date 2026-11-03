/* Rendu 3D photoréaliste hors écran (matériaux PBR, studio, ombres douces). */
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

/* ------------------------------------------------------------------ */
/* Textures procédurales (bois / studio)                               */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const woodCache = new Map();

function makeWoodTexture(hexColor, seed) {
  const key = `${hexColor}|${seed}`;
  if (woodCache.has(key)) return woodCache.get(key);

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(seed);
  const base = new THREE.Color(hexColor);
  const hsl = {};
  base.getHSL(hsl);

  // fond : couleur de base légèrement éclaircie
  const fill = new THREE.Color().setHSL(hsl.h, hsl.s * 0.92, Math.min(0.95, hsl.l * 1.12));
  ctx.fillStyle = `#${fill.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  // larges bandes de teinte (cernes) horizontales
  for (let i = 0; i < 26; i++) {
    const y = rng() * size;
    const h = 4 + rng() * 22;
    const shade = 1 - (0.04 + rng() * 0.09);
    const band = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l * shade));
    ctx.fillStyle = `#${band.getHexString()}`;
    ctx.globalAlpha = 0.35 + rng() * 0.3;
    ctx.fillRect(0, y, size, h);
  }
  ctx.globalAlpha = 1;

  // grain vertical : lignes sinueuses fines et sombres
  for (let i = 0; i < 68; i++) {
    const x0 = rng() * size;
    const amp = 5 + rng() * 16;
    const period = 90 + rng() * 190;
    const phase = rng() * Math.PI * 2;
    const width = 0.6 + rng() * 1.9;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 + rng() * 0.1})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let y = 0; y <= size; y += 6) {
      const x = x0 + Math.sin((y / period) * Math.PI * 2 + phase) * amp;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // stries claires fines
  for (let i = 0; i < 40; i++) {
    const x0 = rng() * size;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + rng() * 0.05})`;
    ctx.lineWidth = 0.8 + rng() * 1.4;
    ctx.beginPath();
    for (let y = 0; y <= size; y += 8) {
      const x = x0 + Math.sin((y / 160) * Math.PI * 2 + rng() * 0.4) * 9;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // bruit fin
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 2600; i++) {
    const shade = rng() > 0.5 ? '#000' : '#fff';
    ctx.fillStyle = shade;
    ctx.fillRect(rng() * size, rng() * size, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  woodCache.set(key, texture);
  return texture;
}

function makeStudioBackdrop() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#e9eaec');
  gradient.addColorStop(0.55, '#d5d6da');
  gradient.addColorStop(1, '#b9bbbf');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 60, size / 2, size / 2, size * 0.72);
  gradient.addColorStop(0, '#cfcbc2');
  gradient.addColorStop(1, '#a8a49b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(99);
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(rng() * size, rng() * size, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Construction de la scène photo                                      */
/* ------------------------------------------------------------------ */

const PHOTO_KINDS = new Set(['carcass', 'back', 'door', 'shelf', 'divider', 'plinth', 'foot', 'base', 'skirt']);

function buildPhotoScene(sceneData) {
  const scene = new THREE.Scene();
  const boxes = (sceneData.boxes || []).filter((box) => PHOTO_KINDS.has(box.kind));

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    minZ = Math.min(minZ, box.z);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
    maxZ = Math.max(maxZ, box.z + box.d);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const depth = Math.max(1, maxZ - minZ);

  // Chaque panneau reçoit un grain de bois légèrement différent (feuilles distinctes)
  let seed = 7;
  for (const box of boxes) {
    seed += 13;
    const baseTexture = makeWoodTexture(box.color || '#ffffff', seed);
    const texture = baseTexture.clone();
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const across = Math.max(1, Math.round(box.w / 620));
    const along = Math.max(1, Math.round(box.h / 620));
    const verticalPanel = box.h > box.w;
    texture.repeat.set(
      verticalPanel ? along : across,
      verticalPanel ? across : along,
    );
    const isDoor = box.kind === 'door';
    const isBack = box.kind === 'back';
    const material = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: 0xffffff,
      roughness: isDoor ? 0.34 : isBack ? 0.72 : 0.44,
      metalness: 0.02,
      clearcoat: isDoor ? 0.7 : 0.45,
      clearcoatRoughness: isDoor ? 0.22 : 0.34,
      envMapIntensity: 0.85,
    });
    const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      box.x - minX + box.w / 2,
      box.y - minY + box.h / 2,
      box.z - minZ + box.d / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Sol studio (cyclorama)
  const floorTexture = makeFloorTexture();
  floorTexture.repeat.set(6, 6);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(width, depth) * 2.6, 64),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2, -2, depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  return { scene, width, height, depth };
}

/* ------------------------------------------------------------------ */
/* Rendu hors écran                                                   */
/* ------------------------------------------------------------------ */

export const PHOTO_PRESETS = {
  threequarters: { azimuth: 38, elevation: 18, distance: 1.35 },
  front: { azimuth: 0, elevation: 6, distance: 1.25 },
  top: { azimuth: 24, elevation: 58, distance: 1.5 },
};

export function renderPhoto(sceneData, presetKey = 'threequarters', pixelWidth = 1680) {
  const preset = PHOTO_PRESETS[presetKey] || PHOTO_PRESETS.threequarters;
  const { scene, width, height, depth } = buildPhotoScene(sceneData);
  const aspect = 4 / 3;
  const renderWidth = Math.max(640, Math.min(2400, pixelWidth));
  const renderHeight = Math.round(renderWidth / aspect);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(renderWidth, renderHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Environnement studio
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.03);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.9;
  scene.background = makeStudioBackdrop();
  scene.backgroundIntensity = 0.9;
  room.dispose?.();
  pmrem.dispose();

  // Éclairage
  const center = new THREE.Vector3(width / 2, height / 2, depth / 2);
  const sceneRadius = Math.hypot(width, height, depth) / 2;

  const key = new THREE.DirectionalLight(0xfff4e6, 3.4);
  key.position.set(
    center.x + sceneRadius * 1.6,
    center.y + sceneRadius * 2.6,
    center.z + sceneRadius * 2.2,
  );
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -(sceneRadius * 1.8);
  key.shadow.camera.right = sceneRadius * 1.8;
  key.shadow.camera.top = sceneRadius * 1.8;
  key.shadow.camera.bottom = -(sceneRadius * 1.8);
  key.shadow.camera.near = 10;
  key.shadow.camera.far = sceneRadius * 10;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xd6e4ff, 0.85);
  fill.position.set(
    center.x - sceneRadius * 2.2,
    center.y + sceneRadius * 1.2,
    center.z + sceneRadius * 1.1,
  );
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(
    center.x - sceneRadius * 0.6,
    center.y + sceneRadius * 1.6,
    center.z - sceneRadius * 2.6,
  );
  scene.add(rim);

  // Caméra : vue paramétrée par azimut / élévation
  const azimuth = THREE.MathUtils.degToRad(preset.azimuth);
  const elevation = THREE.MathUtils.degToRad(preset.elevation);
  const distance = sceneRadius * 2 * preset.distance;
  const camera = new THREE.PerspectiveCamera(30, aspect, 1, sceneRadius * 40);
  camera.position.set(
    center.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
    center.y + Math.sin(elevation) * distance + height * 0.18,
    center.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
  );
  camera.lookAt(center.x, center.y * 0.94, center.z);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  // nettoyage
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        m.map?.dispose?.();
        m.dispose?.();
      });
    }
  });
  environment.texture.dispose?.();
  renderer.dispose();

  return { dataUrl, width: renderWidth, height: renderHeight };
}
