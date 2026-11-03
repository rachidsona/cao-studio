// Matériaux 3D procéduraux (bois, marbre, verre, métal…).
// Génère un motif CanvasTexture par famille de matière, sans ressource externe.
import * as THREE from 'three';

const textureCache = new Map();

function baseColor(hex) {
  return new THREE.Color(hex || '#ffffff');
}

function hexStr(color) {
  return `#${color.getHexString()}`;
}

function shade(color, factor) {
  const clone = color.clone();
  clone.r = Math.max(0, Math.min(1, clone.r * factor));
  clone.g = Math.max(0, Math.min(1, clone.g * factor));
  clone.b = Math.max(0, Math.min(1, clone.b * factor));
  return clone;
}

function rnd(n) {
  return Math.random() * n;
}

function surfaceTexture(category, hex, size = 512) {
  const key = `${category}:${hex}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = baseColor(hex);
  ctx.fillStyle = hexStr(base);
  ctx.fillRect(0, 0, size, size);

  if (category === 'wood') {
    const dark = shade(base, 0.72);
    const light = shade(base, 1.14);
    for (let i = 0; i < 42; i += 1) {
      const y = rnd(size);
      const h = 1 + rnd(3);
      const w = size * (0.4 + rnd(0.6));
      const x = rnd(size) - w / 2;
      ctx.strokeStyle = i % 2 ? hexStr(dark) : hexStr(light);
      ctx.lineWidth = h;
      ctx.globalAlpha = 0.18 + rnd(0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + w * 0.3, y + rnd(9) - 4, x + w * 0.7, y + rnd(9) - 4, x + w, y);
      ctx.stroke();
    }
    for (let i = 0; i < 3; i += 1) {
      const nx = rnd(size);
      const ny = rnd(size);
      const nr = 4 + rnd(8);
      ctx.strokeStyle = hexStr(dark);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(nx, ny, nr, nr * 0.45, rnd(Math.PI), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (category === 'marble') {
    for (let i = 0; i < 26; i += 1) {
      const x = rnd(size);
      const y = rnd(size);
      const w = 50 + rnd(140);
      ctx.strokeStyle = i % 2 ? hexStr(shade(base, 0.78)) : hexStr(shade(base, 0.92));
      ctx.lineWidth = 0.5 + rnd(1.6);
      ctx.globalAlpha = 0.4 + rnd(0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + w * 0.4, y + rnd(40) - 20,
        x + w * 0.8, y + rnd(40) - 20,
        x + w * 1.3, y + rnd(30) - 15,
      );
      ctx.stroke();
    }
  } else if (category === 'stone' || category === 'laminate' || category === 'melamine') {
    for (let i = 0; i < 2600; i += 1) {
      const x = rnd(size);
      const y = rnd(size);
      ctx.fillStyle = i % 2 ? hexStr(shade(base, 0.86)) : hexStr(shade(base, 1.1));
      ctx.globalAlpha = 0.18 + rnd(0.3);
      ctx.fillRect(x, y, 1 + rnd(2), 1 + rnd(2));
    }
  } else if (category === 'metal') {
    for (let i = 0; i < 220; i += 1) {
      const x = rnd(size);
      ctx.strokeStyle = i % 2 ? hexStr(shade(base, 0.88)) : hexStr(shade(base, 1.08));
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 0.5 + rnd(1);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + rnd(6) - 3, size);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function surfaceMaterial(category, hex, options = {}) {
  const color = baseColor(hex);
  if (category === 'glass') {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      ...options,
    });
  }
  const params = { color, roughness: 0.6, metalness: 0.0 };
  if (category === 'metal') {
    params.roughness = 0.35;
    params.metalness = 0.85;
  } else if (category === 'marble' || category === 'stone') {
    params.roughness = 0.28;
    params.metalness = 0.05;
  } else if (category === 'solid') {
    params.roughness = 0.5;
    params.metalness = 0.02;
  } else if (category === 'wood' || category === 'laminate' || category === 'melamine') {
    params.roughness = 0.55;
    params.metalness = 0.0;
  }
  if (category !== 'solid') {
    params.map = surfaceTexture(category, hex);
  }
  Object.assign(params, options);
  return new THREE.MeshStandardMaterial(params);
}
