/**
 * Textures calculées des apparences : bois (cernes, fibres ; tiré d'une photo de vrai bois dès qu'elle est là), marbre (veines), granit et quartz (mouchetures),
 * terrazzo (éclats), béton, ardoise, liège, tissu (armure), cuir (grain) et métal brossé. Chaque motif donne une
 * couleur (mélange des deux couleurs de l'apparence) et un relief, rendu en carte de normales. Toutes les textures se
 * raccordent dans les deux sens (bruits périodiques).
 */
import type { Appearance, Pattern } from "./library";

/** Random value of a lattice point (wrapped to `px` × `py`), in 0…1: an integer hash, much faster than a sine. */
function hash(ix: number, iy: number, px: number, py: number, seed: number): number {
  const x = ((ix % px) + px) % px;
  const y = ((iy % py) + py) % py;
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise over a lattice that wraps every `px` cells across and `py` cells down, smooth, in 0…1. */
function noise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, px, py, seed);
  const b = hash(x0 + 1, y0, px, py, seed);
  const c = hash(x0, y0 + 1, px, py, seed);
  const d = hash(x0 + 1, y0 + 1, px, py, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** Fractal noise over 0…1 × 0…1, periodic, `octaves` layers from `base` cells; in 0…1. */
function fbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let cells = base;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(u * cells, v * cells, cells, cells, seed + o * 13);
    weight += amplitude;
    amplitude *= 0.5;
    cells *= 2;
  }
  return sum / weight;
}

/** Random value of a lattice cell (periodic), in 0…1. */
const cell = (ix: number, iy: number, period: number, seed: number): number => hash(ix, iy, period, period, seed + 7919);

/** Noise over the tile with `cu` cells across and `cv` down: it tiles whatever the two counts. */
const n = (u: number, v: number, cu: number, cv: number, seed: number) => noise(u * cu, v * cv, cu, cv, seed);

/** Distance to the nearest random point of a periodic grid of `cells` × `cells`, and that point's random value. */
function voronoi(u: number, v: number, cells: number, seed: number): { distance: number; value: number } {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let distance = 9;
  let value = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + cell(cx, cy, cells, seed);
      const py = cy + cell(cx, cy, cells, seed + 1);
      const d = Math.hypot(px - x, py - y);
      if (d < distance) {
        distance = d;
        value = cell(cx, cy, cells, seed + 2);
      }
    }
  }
  return { distance, value };
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * One point of a motif, at (u, v) in its tile: how much of the second colour (0…1), the relief (0…1) and a lightness
 * change (−1…1).
 */
export function sampleMotif(pattern: Pattern, u: number, v: number, seed = 1): [mix: number, height: number, light: number] {
  switch (pattern) {
    case "wood": {
      // Rings: a few broad stripes across v, bent by a slow noise along the grain; fine fibres along it.
      const bend = n(u, v, 3, 2, seed) * 1.1 + n(u, v, 6, 4, seed + 1) * 0.3;
      const ring = 0.5 + 0.5 * Math.sin((v * 6 + bend) * Math.PI * 2);
      const late = Math.pow(ring, 4);
      const fibre = n(u, v, 4, 96, seed + 2) * 0.6 + n(u, v, 12, 192, seed + 3) * 0.4;
      const patch = n(u, v, 2, 3, seed + 4);
      return [Math.min(1, 0.55 * late + 0.25 * fibre * late + 0.1 * patch), 0.6 * fibre + 0.4 * (1 - late), 0.06 * (fibre - 0.5) + 0.05 * (patch - 0.5)];
    }
    case "marble": {
      // One or two broad, soft veins across the slab, a few fine cracks, and clouds in the stone.
      const turbulence = fbm(u, v, 2, 5, seed);
      const vein = Math.abs(Math.sin((u + v * 0.6 + turbulence * 1.6) * Math.PI * 2));
      const fine = Math.abs(Math.sin((u * 2 - v * 1.4 + fbm(u, v, 3, 3, seed + 5) * 2) * Math.PI * 2));
      const main = Math.pow(1 - vein, 6) * 0.8;
      const thin = Math.pow(1 - fine, 60) * 0.45;
      const cloud = fbm(u, v, 3, 4, seed + 9);
      return [Math.min(1, main + thin + 0.15 * cloud), 1 - main * 0.2, 0.04 * (cloud - 0.5)];
    }
    case "granite": {
      const big = n(u, v, 48, 48, seed);
      const small = n(u, v, 128, 128, seed + 3);
      const dark = smooth(0.62, 0.7, big * 0.6 + small * 0.4);
      const light = smooth(0.3, 0.22, small) * 0.8;
      return [dark, 0.5, light * 0.5 - 0.05 * fbm(u, v, 8, 3, seed + 7)];
    }
    case "terrazzo": {
      const chip = voronoi(u, v, 18, seed);
      const inside = smooth(0.42, 0.36, chip.distance);
      const tone = chip.value;
      return [inside * (tone < 0.55 ? 1 : 0.3), inside * 0.3, inside * (tone > 0.8 ? 0.35 : tone > 0.55 ? -0.25 : 0)];
    }
    case "concrete": {
      const base = fbm(u, v, 4, 6, seed);
      const pores = smooth(0.86, 0.9, n(u, v, 220, 220, seed + 2));
      return [Math.min(1, base * 0.75 + pores * 0.3), base * 0.8 + (1 - pores) * 0.2, -0.1 * pores];
    }
    case "slate": {
      const layers = 0.6 * n(u, v, 1, 6, seed) + 0.3 * n(u, v, 2, 12, seed + 1) + 0.1 * n(u, v, 4, 24, seed + 2);
      const cleft = smooth(0.48, 0.5, Math.abs(n(u, v, 3, 24, seed + 4) - 0.5) * 2) * 0.5;
      return [layers, layers * 0.8 + cleft * 0.2, 0.08 * (layers - 0.5)];
    }
    case "cork": {
      const grains = voronoi(u, v, 48, seed);
      const speck = n(u, v, 96, 96, seed + 2);
      return [Math.min(1, grains.value * 0.7 + speck * 0.4), 1 - grains.distance, 0.1 * (speck - 0.5)];
    }
    case "fabric": {
      // Plain weave: threads across u and v passing over and under each other; slub yarn.
      const threads = 16;
      const tu = u * threads;
      const tv = v * threads;
      const over = (Math.floor(tu) + Math.floor(tv)) % 2 === 0;
      const along = over ? Math.sin((tv % 1) * Math.PI) : Math.sin((tu % 1) * Math.PI);
      const slub = n(u, v, 8, 64, seed) * 0.6 + n(u, v, 64, 8, seed + 1) * 0.4;
      return [slub, 0.3 + 0.7 * along, 0.1 * (along - 0.5)];
    }
    case "leather": {
      const ridge = 1 - Math.abs(fbm(u, v, 8, 4, seed) - 0.5) * 2;
      const crease = Math.pow(ridge, 6);
      const pores = smooth(0.8, 0.88, n(u, v, 200, 200, seed + 3));
      return [Math.min(1, crease * 0.8 + pores * 0.3), 1 - crease * 0.7 - pores * 0.3, -0.05 * crease];
    }
    case "brushed": {
      const streak = n(u, v, 2, 300, seed) * 0.7 + n(u, v, 6, 900, seed + 1) * 0.3;
      return [streak, streak, 0.04 * (streak - 0.5)];
    }
    default:
      return [0, 0.5, 0];
  }
}

const hex = (color: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

/** The motif's colour (RGBA bytes, sRGB) and relief (heights 0…1) over `size` × `size` texels; `color` replaces the base colour. */
export function motifMaps(appearance: Appearance, size: number, color = appearance.color): { color: Uint8Array; height: Float32Array } {
  const c1 = hex(color);
  // A chosen colour keeps the motif: the second colour follows it, darker.
  const c2 = appearance.color2 ? (color === appearance.color ? hex(appearance.color2) : c1.map((c) => c * 0.72) as [number, number, number]) : c1;
  const out = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [mix, h, light] = sampleMotif(appearance.pattern, x / size, y / size);
      const i = y * size + x;
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, (c1[k]! + (c2[k]! - c1[k]!) * mix) * (1 + light)));
      out[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  return { color: out, height };
}

/**
 * The shades of a photo (RGBA bytes): each texel's lightness as a gap to the photo's mean, in standard deviations —
 * the same whatever the photo's own colour and contrast.
 */
export function shadesOf(pixels: ArrayLike<number>): Float32Array {
  const count = Math.floor(pixels.length / 4);
  const shade = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += shade[i] = 0.299 * pixels[i * 4]! + 0.587 * pixels[i * 4 + 1]! + 0.114 * pixels[i * 4 + 2]!;
  const mean = sum / (count || 1);
  let spread = 0;
  for (let i = 0; i < count; i++) spread += (shade[i]! - mean) ** 2;
  const deviation = Math.sqrt(spread / (count || 1)) || 1;
  for (let i = 0; i < count; i++) shade[i] = (shade[i]! - mean) / deviation;
  return shade;
}

/**
 * A wood's colour and relief (as motifMaps) from the shades of a photo of real wood (shadesOf, `size` × `size`): its
 * dark grain towards the second colour, its light towards the first; the relief follows the photo, its pores deep.
 */
export function grainMaps(shade: Float32Array, size: number, appearance: Appearance, color = appearance.color): { color: Uint8Array; height: Float32Array } {
  const c1 = hex(color);
  const c2 = appearance.color2 ? (color === appearance.color ? hex(appearance.color2) : c1.map((c) => c * 0.72) as [number, number, number]) : c1;
  const out = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const z = shade[i] ?? 0;
    const mix = Math.min(1, Math.max(0, 0.32 - 0.3 * z));
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(c1[k]! + (c2[k]! - c1[k]!) * mix);
    out[i * 4 + 3] = 255;
    height[i] = Math.min(1, Math.max(0, 0.5 + 0.15 * z));
  }
  return { color: out, height };
}

/** A normal map (RGBA bytes, tangent space) from heights that tile; `strength` scales the slopes. */
export function normalMap(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
