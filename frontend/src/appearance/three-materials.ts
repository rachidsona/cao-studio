/**
 * Matières three.js des apparences, communes à la vue d'édition, au rendu et aux vignettes : couleur, texture
 * calculée ou photo (son relief tiré de ses nuances), carte de relief, rugosité, métal, vernis, velours, et pour le verre la transmission (rendu) ou une simple
 * transparence (vue d'édition). Coordonnées de texture des planches posées dans le sens du fil, le motif décalé
 * d'une planche à l'autre (deux planches voisines ne montrent pas le même veinage).
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
 * grain axis wherever the face contains it; in tiles of `tile` (mm) — or, given the board's box (`whole`), from 0 to 1
 * across the whole board, so that one image covers it in one piece.
 */
export function boardUvs(positions: ArrayLike<number>, normals: ArrayLike<number>, grainAxis: 0 | 1 | 2, tile: [number, number], whole?: { min: number[]; size: number[] }, shift: [number, number] = [0, 0]): Float32Array {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const n = [Math.abs(normals[i * 3]!), Math.abs(normals[i * 3 + 1]!), Math.abs(normals[i * 3 + 2]!)];
    const facing = n[0]! >= n[1]! && n[0]! >= n[2]! ? 0 : n[1]! >= n[2]! ? 1 : 2;
    const inPlane = [0, 1, 2].filter((a) => a !== facing);
    const u = inPlane.includes(grainAxis) ? grainAxis : inPlane[0]!;
    const v = inPlane.find((a) => a !== u)!;
    if (whole) {
      uvs[i * 2] = (positions[i * 3 + u]! - whole.min[u]!) / (whole.size[u]! || 1);
      uvs[i * 2 + 1] = (positions[i * 3 + v]! - whole.min[v]!) / (whole.size[v]! || 1);
    } else {
      uvs[i * 2] = positions[i * 3 + u]! / tile[0] + shift[0];
      uvs[i * 2 + 1] = positions[i * 3 + v]! / tile[1] + shift[1];
    }
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
  let whole: { min: number[]; size: number[] } | undefined;
  if (look.appearance.whole) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    whole = { min: box.min.toArray(), size: box.max.clone().sub(box.min).toArray() };
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(boardUvs(position.array, normal.array, look.grainAxis, tileOf(look.appearance), whole, look.shift), 2));
}

/** The key of the texture coordinates a look needs: the same key, the same coordinates. */
export const uvKeyOf = (look: BodyAppearance) => `${look.grainAxis}|${look.appearance.whole ? "whole" : tileOf(look.appearance).join("x")}|${look.shift?.join(",") ?? ""}`;

/**
 * Sets the texture coordinates of one face of a body's geometry (its triangles `start`…`start + count` of the index)
 * for a look of its own; the other faces keep theirs. A photo covers the whole board, as on the body.
 */
export function applyFaceUvs(geometry: THREE.BufferGeometry, look: BodyAppearance, start: number, count: number): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!position || !normal || !index) return;
  if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  let whole: { min: number[]; size: number[] } | undefined;
  if (look.appearance.whole) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    whole = { min: box.min.toArray(), size: box.max.clone().sub(box.min).toArray() };
  }
  const vertices = [...new Set(Array.from({ length: count }, (_, k) => index.getX(start + k)))];
  const pick = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => vertices.flatMap((v) => [attribute.getX(v), attribute.getY(v), attribute.getZ(v)]);
  const uvs = boardUvs(pick(position), pick(normal), look.grainAxis, tileOf(look.appearance), whole);
  vertices.forEach((v, k) => uv.setXY(v, uvs[k * 2]!, uvs[k * 2 + 1]!));
  uv.needsUpdate = true;
}

const textures = new Map<string, { map: THREE.Texture; normal: THREE.Texture | null }>();
/** The photos being loaded (or loaded), by URL. */
const photos = new Map<string, { map: THREE.Texture; normal: THREE.DataTexture; ready: Promise<void> }>();

/** The photo of an appearance as textures, loaded once and shared; its relief computed from its shades on load. */
function photoTextures(appearance: Appearance & { image: string }): { map: THREE.Texture; normal: THREE.DataTexture | null; ready: Promise<void> } {
  let found = photos.get(appearance.image);
  if (!found) {
    // Flat until the photo is there.
    const normal = dataTexture(new Uint8Array([128, 128, 255, 255]), 1, false);
    let done = () => {};
    const ready = new Promise<void>((resolve) => (done = resolve));
    const map = new THREE.TextureLoader().load(
      appearance.image,
      (texture) => {
        const image = texture.image as HTMLImageElement;
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(image, 0, 0, size, size);
          const pixels = context.getImageData(0, 0, size, size).data;
          const height = new Float32Array(size * size);
          for (let i = 0; i < height.length; i++) height[i] = (0.299 * pixels[i * 4]! + 0.587 * pixels[i * 4 + 1]! + 0.114 * pixels[i * 4 + 2]!) / 255;
          normal.image = { data: normalMap(height, size, (appearance.relief ?? 0.2) * 6), width: size, height: size };
          normal.needsUpdate = true;
        }
        done();
      },
      undefined,
      () => done(),
    );
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    found = { map, normal, ready };
    photos.set(appearance.image, found);
  }
  return { ...found, normal: (appearance.relief ?? 0) > 0 ? found.normal : null };
}

/** Resolves once the textures of an appearance can be drawn (at once, but for a photo still loading). */
export function motifReady(appearance: Appearance): Promise<void> {
  return appearance.image ? photoTextures(appearance as Appearance & { image: string }).ready : Promise.resolve();
}

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
export function motifTextures(appearance: Appearance, color = appearance.color, small = false): { map: THREE.Texture; normal: THREE.Texture | null } | null {
  if (appearance.image) return photoTextures(appearance as Appearance & { image: string });
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
