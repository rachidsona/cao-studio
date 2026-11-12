/**
 * Les formes simples dont on fait les pièces d'un appareil d'électroménager (features/appliance-parts.ts) : pavé
 * (évidé de trous, pour la plage d'un évier), cuve ouverte, cylindre entre deux points, prisme (un profil dans le plan
 * de côté, tiré sur la largeur : la façade inclinée d'une hotte), et les pièces qui reviennent d'un appareil à l'autre
 * — poignée barre sur ses deux pieds, manette à jupe, anneau d'un foyer, cadre d'un joint. Pur.
 */
import type { Vec3 } from "../document/types";

export type ApplianceShape =
  | { kind: "box"; from: Vec3; to: Vec3; holes?: [Vec3, Vec3][] }
  | { kind: "bowl"; from: Vec3; to: Vec3; wall: number }
  | { kind: "cyl"; a: Vec3; b: Vec3; r: number }
  /** A profile (y, z points, in order) drawn on the side, pulled along x from x[0] to x[1]. */
  | { kind: "prism"; x: [number, number]; yz: [number, number][] };

export interface AppliancePart {
  name: string;
  /** An appearance of appearance/library.ts. */
  look: string;
  /** Put together into one body (side by side, no boolean between them). */
  shapes: ApplianceShape[];
}

/** The looks of a finish: its face, its body, its glass, its trim (handles, knobs). */
export interface Looks {
  face: string;
  body: string;
  glass: string;
  trim: string;
}

export const box = (from: Vec3, to: Vec3, holes?: [Vec3, Vec3][]): ApplianceShape => ({ kind: "box", from, to, ...(holes ? { holes } : {}) });
export const cyl = (a: Vec3, b: Vec3, r: number): ApplianceShape => ({ kind: "cyl", a, b, r });
export const prism = (x0: number, x1: number, yz: [number, number][]): ApplianceShape => ({ kind: "prism", x: [x0, x1], yz });

/**
 * A bar handle along x (or z) in front of a face at y = `face`, on two standoffs: its bar `out` in front of the face,
 * of radius `r`, from `a` to `b`, at `at` (its z for a bar along x, its x for a bar along z).
 */
export function handle(axis: "x" | "z", a: number, b: number, at: number, face: number, out = 32, r = 8): ApplianceShape[] {
  const y = face - out;
  const foot = r * 0.75;
  if (axis === "x") return [cyl([a, y, at], [b, y, at], r), cyl([a + 18, face, at], [a + 18, y, at], foot), cyl([b - 18, face, at], [b - 18, y, at], foot)];
  return [cyl([at, y, a], [at, y, b], r), cyl([at, face, a + 18], [at, y, a + 18], foot), cyl([at, face, b - 18], [at, y, b - 18], foot)];
}

/** A knob on a front face at y = `face`: its skirt against the face, its grip standing out `out` (mm). */
export function knob(x: number, z: number, face: number, r = 18, out = 24): ApplianceShape[] {
  return [cyl([x, face, z], [x, face - 3, z], r + 4), cyl([x, face - 3, z], [x, face - out, z], r)];
}

/** A knob on a top face at z = `top` (a gas hob's). */
export function topKnob(x: number, y: number, top: number, r = 17, out = 22): ApplianceShape[] {
  return [cyl([x, y, top], [x, y, top + 3], r + 4), cyl([x, y, top + 3], [x, y, top + out], r)];
}

/** A flat ring on a top face at z = `top`: an outer disc, then the same face's colour inside (two discs, no hole cut). */
export const ringDisc = (x: number, y: number, top: number, r: number, h = 0.3): ApplianceShape => cyl([x, y, top], [x, y, top + h], r);

/** A thin frame in a plane y = y0…y1 around x0…x1, z0…z1, `w` wide (a door's seal, a window's surround). */
export function frame(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, w: number): ApplianceShape[] {
  return [box([x0, y0, z0], [x1, y1, z0 + w]), box([x0, y0, z1 - w], [x1, y1, z1]), box([x0, y0, z0 + w], [x0 + w, y1, z1 - w]), box([x1 - w, y0, z0 + w], [x1, y1, z1 - w])];
}

/** The box a shape takes (min, max corners). */
export function shapeBox(s: ApplianceShape): [Vec3, Vec3] {
  if (s.kind === "box" || s.kind === "bowl") return [[Math.min(s.from[0], s.to[0]), Math.min(s.from[1], s.to[1]), Math.min(s.from[2], s.to[2])], [Math.max(s.from[0], s.to[0]), Math.max(s.from[1], s.to[1]), Math.max(s.from[2], s.to[2])]];
  if (s.kind === "prism") {
    const ys = s.yz.map((p) => p[0]);
    const zs = s.yz.map((p) => p[1]);
    return [[Math.min(...s.x), Math.min(...ys), Math.min(...zs)], [Math.max(...s.x), Math.max(...ys), Math.max(...zs)]];
  }
  // A cylinder: its two end discs, each within r of its centre across the axis.
  const d = [0, 1, 2].map((i) => s.b[i]! - s.a[i]!);
  const len = Math.hypot(...d) || 1;
  const spread = d.map((c) => s.r * Math.sqrt(Math.max(0, 1 - (c / len) ** 2)));
  return [[0, 1, 2].map((i) => Math.min(s.a[i]!, s.b[i]!) - spread[i]!) as Vec3, [0, 1, 2].map((i) => Math.max(s.a[i]!, s.b[i]!) + spread[i]!) as Vec3];
}
