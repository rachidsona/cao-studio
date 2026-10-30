/**
 * Matières three.js des apparences, communes à la vue d'édition, au rendu et aux vignettes : couleur ou texture
 * calculée, carte de relief, rugosité, métal, vernis, velours, et pour le verre la transmission (rendu) ou une simple
 * transparence (vue d'édition). Coordonnées de texture des planches posées dans le sens du fil.
 */
import * as THREE from "three";
import type { BodyAppearance } from "./assign";
import type { Appearance } from "./library";
import { motifMaps, normalMap } from "./textures";

export type Finish = "auto" | "matte" | "satin" | "gloss" | "lacquer";

const FINISHES: Record<Exclude<Finish, "auto">, { roughness: number; clearcoat: number; clearcoatRoughness: number }> = {
  matte: { roughness: 0.85, clearcoat: 0, clearcoatRoughness: 0 },
  satin: { roughness: 0.45, clearcoat: 0, clearcoatRoughness: 0 },
  gloss: { roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  lacquer: { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 },
};

/** Finishes make sense for these categories (not for glass, metals or fabrics). */
export const FINISHED_CATEGORIES = new Set(["wood", "melamine", "paint", "plastic", "stone", "concrete"]);

const DEFAULT_TILE: [number, number] = [500, 500];

/**
 * Texture coordinates of a board, projected on the plane of each face (by the main axis of its normal), u along the
 * grain axis wherever the face contains it; in tiles of `tile` (mm).
 */
export function boardUvs(positions: ArrayLike<number>, normals: ArrayLike<number>, grainAxis: 0 | 1 | 2, tile: [number, number]): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const n = [Math.abs(normals[i * 3]!), Math.abs(normals[i * 3 + 1]!), Math.abs(normals[i * 3 + 2]!)];
    const facing = n[0]! >= n[1]! && n[0]! >= n[2]! ? 0 : n[1]! >= n[2]! ? 1 : 2;
    const inPlane = [0, 1, 2].filter((a) => a !== facing);
    const u = inPlane.includes(grainAxis) ? grainAxis : inPlane[0]!;
    const v = inPlane.find((a) => a !== u)!;
    uvs[i * 2] = positions[i * 3 + u]! / tile[0];
    uvs[i * 2 + 1] = positions[i * 3 + v]! / tile[1];
  }
  return uvs;
}

/** Tile (mm) of an appearance's motif. */
export const tileOf = (appearance: Appearance): [number, number] => appearance.tile ?? DEFAULT_TILE;

/** Sets the texture coordinates of a body's geometry for its appearance (none needed for a plain one). */
export function applyUvs(geometry: THREE.BufferGeometry, look: BodyAppearance): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position || !normal) return;
  geometry.setAttribute("uv", new THREE.BufferAttribute(boardUvs(position.array, normal.array, look.grainAxis, tileOf(look.appearance)), 2));
}

const textures = new Map<string, { map: THREE.DataTexture; normal: THREE.DataTexture | null }>();

function dataTexture(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The motif's colour and relief textures (computed once per appearance, colour and size, then shared); `small` for
 * the library's swatches.
 */
export function motifTextures(appearance: Appearance, color = appearance.color, small = false): { map: THREE.DataTexture; normal: THREE.DataTexture | null } | null {
  if (appearance.pattern === "plain") return null;
  const size = small ? 128 : appearance.pattern === "fabric" || appearance.pattern === "leather" ? 256 : 512;
  const key = `${appearance.id}|${color}|${size}`;
  let found = textures.get(key);
  if (!found) {
    const maps = motifMaps(appearance, size, color);
    const relief = appearance.relief ?? 0;
    found = { map: dataTexture(maps.color, size, true), normal: relief > 0 ? dataTexture(normalMap(maps.height, size, relief * 6), size, false) : null };
    textures.set(key, found);
  }
  return found;
}

/**
 * A physical material for an appearance. "render" and "swatch": glass lets light through; "view": glass is only
 * see-through (fast); "swatch" uses small textures. `finish` replaces the roughness and varnish of finishable
 * appearances.
 */
export function appearanceMaterial(appearance: Appearance, color: string | undefined, mode: "view" | "render" | "swatch", finish: Finish = "auto"): THREE.MeshPhysicalMaterial {
  const base = color ?? appearance.color;
  const motif = motifTextures(appearance, base, mode === "swatch");
  const material = new THREE.MeshPhysicalMaterial({ color: motif ? 0xffffff : base });
  material.map = motif?.map ?? null;
  material.normalMap = motif?.normal ?? null;
  const surface = finish !== "auto" && FINISHED_CATEGORIES.has(appearance.category) ? FINISHES[finish] : appearance;
  material.roughness = surface.roughness;
  material.metalness = appearance.metalness ?? 0;
  material.clearcoat = surface.clearcoat ?? 0;
  material.clearcoatRoughness = surface.clearcoatRoughness ?? 0;
  if (appearance.sheen) {
    material.sheen = appearance.sheen;
    material.sheenColor.set(base).lerp(new THREE.Color(0xffffff), 0.3);
    material.sheenRoughness = 0.5;
  }
  const transmission = appearance.transmission ?? 0;
  if (transmission > 0 && mode !== "view") {
    material.transmission = transmission;
    material.ior = appearance.ior ?? 1.5;
    material.thickness = 6;
    material.attenuationColor.set(base);
    material.attenuationDistance = 40;
  } else if (transmission > 0) {
    material.transparent = true;
    material.opacity = 1 - 0.7 * transmission;
    material.depthWrite = false;
  }
  material.userData.appearance = appearance.id;
  return material;
}
