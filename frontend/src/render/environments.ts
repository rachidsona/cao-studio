/**
 * Environnements d'éclairage du rendu, calculés (pas de fichier HDR à télécharger) : studios à boîtes à lumière
 * (comme KeyShot), intérieur avec fenêtre, ciel avec soleil selon l'heure (comme Enscape), ciel couvert. Chacun est une
 * image équirectangulaire en lumière linéaire (HDR), lue de la même façon par l'aperçu et par le lancer de rayons.
 */
import { sunPosition, type EnvironmentId } from "./settings";

type RGB = [number, number, number];

/** The vertical of the model (+Z) seen by an equirectangular texture (whose vertical is +Y): see `ENV_ROTATION_X`. */
export const ENV_ROTATION_X = Math.PI / 2;

const DEG = Math.PI / 180;
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
/** Difference of two azimuths (degrees) in -180…180. */
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** A rectangular light (softbox, window) seen at azimuth/elevation (degrees), soft-edged. */
function box(az: number, el: number, az0: number, el0: number, width: number, height: number, soft = 3): number {
  const dx = Math.abs(wrap(az - az0)) * Math.cos(el0 * DEG);
  const dy = Math.abs(el - el0);
  return (1 - smooth(width / 2 - soft, width / 2 + soft, dx)) * (1 - smooth(height / 2 - soft, height / 2 + soft, dy));
}

/** Light coming from a direction of the model (azimuth from +Y towards +X, elevation above the horizon; degrees). */
export function radiance(env: EnvironmentId, az: number, el: number, hour: number): RGB {
  const up = Math.sin(el * DEG);
  switch (env) {
    case "studio-light": {
      // A seamless backdrop: the same grey at the horizon from above and below.
      const base: RGB = up >= 0 ? mix([0.5, 0.51, 0.53], [0.68, 0.69, 0.7], Math.sqrt(up)) : mix([0.5, 0.51, 0.53], [0.4, 0.4, 0.41], Math.min(1, -up * 2));
      const light = 8 * box(az, el, -45, 35, 30, 22) + 2.5 * box(az, el, 120, 25, 40, 25) + 4 * box(az, el, 0, 75, 50, 30) + 3 * box(az, el, 180, 15, 15, 40);
      return [base[0] + light, base[1] + light, base[2] + light];
    }
    case "studio-dark": {
      const base = up >= 0 ? 0.015 : 0.012;
      const light = 18 * box(az, el, -40, 40, 28, 20) + 12 * box(az, el, 160, 20, 10, 45) + 1.5 * box(az, el, 70, 10, 30, 15);
      return [base + light, base + light, base + light * 1.02];
    }
    case "interior": {
      const wall: RGB = up > 0.6 ? [0.55, 0.53, 0.5] : up > -0.1 ? [0.42, 0.36, 0.3] : [0.22, 0.15, 0.1];
      const window = box(az, el, 40, 18, 55, 38, 2);
      const lamp = box(az, el, -120, 50, 10, 10, 2);
      return [wall[0] * (1 - window) + 9 * window + 6 * lamp, wall[1] * (1 - window) + 9 * window + 4.8 * lamp, wall[2] * (1 - window) + 9.5 * window + 3.3 * lamp];
    }
    case "overcast": {
      // CIE overcast sky: three times brighter at the zenith than at the horizon.
      if (up < 0) return mix([0.3, 0.3, 0.29], [0.22, 0.21, 0.2], Math.min(1, -up * 4));
      return scale([0.95, 0.97, 1], 1.2 * ((1 + 2 * up) / 3));
    }
    case "outdoor": {
      const sun = sunPosition(hour);
      const sunUp = Math.sin(sun.elevation * DEG);
      const warm = 1 - smooth(0.05, 0.45, sunUp);
      const sunColor = mix([1, 0.96, 0.9], [1, 0.58, 0.32], warm);
      const daylight = 0.25 + 0.75 * smooth(0, 0.5, sunUp);
      const zenith = mix([0.16, 0.34, 0.85], [0.2, 0.25, 0.55], warm);
      const horizon = mix([0.74, 0.82, 0.96], [1, 0.62, 0.42], warm);
      const sky = up >= 0 ? scale(mix(horizon, zenith, Math.pow(up, 0.45)), 0.9 * daylight) : mix(scale(horizon, 0.8 * daylight), scale([0.2, 0.19, 0.17], daylight), Math.min(1, -up * 6));
      // Angle to the sun (degrees): a bright disk (about twice the real one, for soft-edged shadows) and a glow; the
      // sun brings about two thirds of the light, the sky the rest.
      const cos = Math.sin(el * DEG) * sunUp + Math.cos(el * DEG) * Math.cos(sun.elevation * DEG) * Math.cos(wrap(az - sun.azimuth) * DEG);
      const angle = Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
      const glow = (up >= -0.02 ? 1 : 0) * (1200 * (1 - smooth(1.6, 2.2, angle)) + 1.2 * Math.exp(-angle / 9));
      return [sky[0] + sunColor[0] * glow, sky[1] + sunColor[1] * glow, sky[2] + sunColor[2] * glow];
    }
  }
}

/**
 * Light (luminance) leaving a white matte ground lit by this environment with nothing around: the irradiance of the
 * upper half divided by π. 1 for an environment of luminance 1 everywhere. `data` as made by `environmentPixels`.
 */
export function environmentNorm(data: Float32Array, width: number): number {
  const height = width / 2;
  const cell = ((2 * Math.PI) / width) * (Math.PI / height);
  let sum = 0;
  for (let row = 0; row < height; row++) {
    const lat = ((row + 0.5) / height - 0.5) * Math.PI;
    const up = Math.sin(lat);
    if (up <= 0) continue;
    const weight = up * Math.cos(lat) * cell;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      sum += (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) * weight;
    }
  }
  return sum / Math.PI;
}

/**
 * The environment as an equirectangular image (RGBA, linear light, rows from the bottom) of `width` × `width / 2`
 * texels, turned by `rotation` degrees around the vertical. Texture directions follow three.js (u around +Y from +X
 * towards +Z, v up +Y); the model's +Z is the texture's +Y once `ENV_ROTATION_X` is applied (world = x, −z, y).
 */
export function environmentPixels(env: EnvironmentId, width: number, rotation: number, hour: number): Float32Array {
  const height = width / 2;
  const data = new Float32Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const lat = ((row + 0.5) / height - 0.5) * Math.PI;
    for (let col = 0; col < width; col++) {
      const lon = ((col + 0.5) / width - 0.5) * 2 * Math.PI;
      // Texture direction (x, y, z), then the model's: (x, −z, y).
      const tx = Math.cos(lat) * Math.cos(lon);
      const tz = Math.cos(lat) * Math.sin(lon);
      const [wx, wy, wz] = [tx, -tz, Math.sin(lat)];
      const az = Math.atan2(wx, wy) / DEG - rotation;
      const el = Math.asin(Math.min(1, Math.max(-1, wz))) / DEG;
      const [r, g, b] = radiance(env, az, el, hour);
      const i = (row * width + col) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }
  return data;
}
