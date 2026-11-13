/**
 * Façades décor, en calcul pur : une porte cannelée (des cannelures rondes, côte à côte, usinées à la fraise
 * hémisphérique) ou à tasseaux (des rainures droites qui laissent des lames en relief), sur sa face avant. Les
 * rainures sont verticales, toutes à l'entraxe `pitch`, centrées sur la largeur de la porte ; elles courent sur toute
 * sa hauteur ou s'arrêtent à `frameWidth` de ses chants haut et bas (une bordure lisse), à `frameDepth` de profondeur.
 * Quand des boîtiers de charnière sont percés au dos, les rainures s'écartent des chants de côté pour que la fraise ne
 * les rejoigne pas. La façade reste une seule planche, débitée comme une porte plate. Pur.
 */
import type { Vec3 } from "../document/types";

export type DecorStyle = "fluted" | "slats";

export const isDecor = <T extends { style?: string }>(f: T): f is T & { style: DecorStyle } => f.style === "fluted" || f.style === "slats";

/** The usual settings of each style (mm): its pitch and depth; a fluted door runs full height, slats keep a border. */
export const DECOR_DEFAULTS: Record<DecorStyle, { pitch: number; frameDepth: number; frameWidth: number }> = {
  fluted: { pitch: 30, frameDepth: 3, frameWidth: 0 },
  slats: { pitch: 45, frameDepth: 4, frameWidth: 0 },
};

/** Width of the gap between two slats (mm); a flute takes the whole pitch but a 2 mm crest. */
export const SLAT_GAP = 10;
const CREST = 2;
/** How far the grooves keep from the side edges when hinge cups are drilled behind (the cup's edge and more). */
export const HINGE_CLEAR = 45;
/** The thinnest wood left under a groove (mm). */
const MIN_LEFT = 3;

export interface DecorSettings {
  style?: string;
  pitch?: number;
  frameWidth?: number;
  frameDepth?: number;
}

/** A groove across the face: its middle and width along the door's width, its ends along its height, its depth. */
export interface Groove {
  u: number;
  width: number;
  v0: number;
  v1: number;
  depth: number;
  round: boolean;
  /** It runs out of the top and bottom edges (no border). */
  through: boolean;
}

const pitchOf = (f: DecorSettings & { style: DecorStyle }) => f.pitch ?? DECOR_DEFAULTS[f.style].pitch;
const depthOf = (f: DecorSettings & { style: DecorStyle }) => f.frameDepth ?? DECOR_DEFAULTS[f.style].frameDepth;
const borderOf = (f: DecorSettings & { style: DecorStyle }) => f.frameWidth ?? DECOR_DEFAULTS[f.style].frameWidth;
export const grooveWidth = (f: DecorSettings & { style: DecorStyle }) => (f.style === "slats" ? SLAT_GAP : pitchOf(f) - CREST);

/** Whether the grooves must keep clear of hinge cups `cups` deep drilled behind a door this thick. */
export const decorClear = (f: DecorSettings, thickness: number, cups: number): boolean => isDecor(f) && cups > 0 && depthOf(f) + cups > thickness - 1;

/** Why doors of these sizes and thickness cannot be grooved this way, or null. */
export function decorProblem(f: DecorSettings, doors: readonly { width: number; height: number }[], thickness: number, cups = 0): string | null {
  if (!isDecor(f)) return null;
  const [pitch, depth, border] = [pitchOf(f), depthOf(f), borderOf(f)];
  if (!(pitch >= (f.style === "slats" ? SLAT_GAP + 10 : 8) && pitch <= 200)) return f.style === "slats" ? `L'entraxe des tasseaux va de ${SLAT_GAP + 10} à 200 mm.` : "L'entraxe des cannelures va de 8 à 200 mm.";
  if (!(depth > 0)) return "La profondeur des rainures doit être positive.";
  if (thickness - depth < MIN_LEFT) return `Les rainures sont trop profondes : il reste moins de ${MIN_LEFT} mm de bois.`;
  if (f.style === "fluted" && depth > grooveWidth(f) / 2) return "Une cannelure n'est pas plus profonde que la moitié de sa largeur : augmentez l'entraxe ou réduisez la profondeur.";
  if (!(border >= 0)) return "La bordure ne peut pas être négative.";
  if (doors.some((d) => d.height - 2 * border < 50)) return "La bordure est trop large pour ces portes.";
  if (doors.some((d) => !decorGrooves(f, 0, d.width, 0, d.height, decorClear(f, thickness, cups)).length)) return "Ces portes sont trop étroites pour une rainure.";
  return null;
}

/**
 * The grooves of a face from `u0` to `u1` across and `v0` to `v1` up: as many as fit at the pitch, centred, their
 * edges a crest from the side edges (flutes) or a whole slat (slats) — or clear of the hinge cups (`clear`).
 */
export function decorGrooves(f: DecorSettings, u0: number, u1: number, v0: number, v1: number, clear = false): Groove[] {
  if (!isDecor(f)) return [];
  const [pitch, depth, border] = [pitchOf(f), depthOf(f), borderOf(f)];
  const width = grooveWidth(f);
  const margin = Math.max(clear ? HINGE_CLEAR : 0, f.style === "slats" ? pitch - SLAT_GAP : CREST / 2);
  // Where the middles of the grooves may go.
  const span = u1 - u0 - 2 * margin - width;
  if (span < -1e-9) return [];
  const count = Math.floor(Math.max(0, span) / pitch + 1e-9) + 1;
  const first = (u0 + u1) / 2 - ((count - 1) * pitch) / 2;
  return Array.from({ length: count }, (_, i) => ({ u: first + i * pitch, width, v0: v0 + border, v1: v1 - border, depth, round: f.style === "fluted", through: border <= 0 }));
}

/**
 * How a groove is cut from the face at `face` (third coordinate), `into` the sign of the way into the wood: a box, or
 * a rod (its axis and radius) — in the door's frame [across, up, through].
 */
export function grooveTool(g: Groove, face: number, into: -1 | 1): { box: [Vec3, Vec3] } | { from: Vec3; to: Vec3; radius: number } {
  // The tool overshoots the face (and the edges it runs out of) by 1 mm, for clean cuts.
  const [v0, v1] = g.through ? [g.v0 - 1, g.v1 + 1] : [g.v0, g.v1];
  const bottom = face + into * g.depth;
  if (!g.round) return { box: [[g.u - g.width / 2, v0, Math.min(bottom, face - into)], [g.u + g.width / 2, v1, Math.max(bottom, face - into)]] };
  // A ball-nosed cutter: a rod whose bottom is `depth` into the face, as wide as the groove at the face.
  const r = (g.width / 2) ** 2 / (2 * g.depth) + g.depth / 2;
  const axis = bottom - into * r;
  return { from: [g.u, v0, axis], to: [g.u, v1, axis], radius: r };
}

/** What a change to a decor style sets: its usual pitch, depth and border unless already that style. */
export function decorChange(style: DecorStyle, current: DecorSettings): DecorSettings & { style: DecorStyle } {
  const d = DECOR_DEFAULTS[style];
  return current.style === style ? { style, pitch: current.pitch ?? d.pitch, frameDepth: current.frameDepth ?? d.frameDepth, frameWidth: current.frameWidth ?? d.frameWidth } : { style, ...d };
}

export const DECOR_LABELS: [DecorStyle, string][] = [
  ["fluted", "Cannelée (cannelures rondes)"],
  ["slats", "À tasseaux (rainures droites)"],
];
