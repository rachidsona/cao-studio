/**
 * Snack et comptoir, en géométrie pure : un plan pour s'asseoir, qui déborde d'un plan de travail — au dos d'un îlot
 * (le côté opposé aux façades) ou au bout d'un plan —, à sa hauteur (comptoir, 90 cm environ) ou relevé en bar
 * (105 cm, une rehausse le porte sur le plan). Sous le débord, une console tous les 60 cm environ. Il dit combien de
 * tabourets tiennent (60 cm chacun), leur hauteur d'assise, et ce qui gêne : un débord de moins de 25 cm (pas de place
 * pour les genoux) ou de plus de 40 cm (des pieds plutôt que des consoles). Pur.
 */
import type { Vec3 } from "../document/types";
import type { FinishPart } from "./finish-parts";

export type Box = [Vec3, Vec3];

export interface SnackSettings {
  /** The worktop it comes out of (its feature id). */
  worktop: string;
  side: "back" | "start" | "end";
  height: "counter" | "bar";
  /** How far it comes out (mm), and how long it is (0: the worktop's length, or its depth at an end). */
  overhang: number;
  length: number;
}

export const SNACK_DEFAULTS: Omit<SnackSettings, "worktop"> = { side: "back", height: "counter", overhang: 300, length: 0 };
export const SNACK_CONSOLE = "Console de snack";
/** A stool's width; the bar's height; the consoles' spacing (mm). */
const STOOL = 600;
const BAR = 1050;
const STEP = 600;

/**
 * The parts of the snack out of `top` (the worktop's box), its front towards `frontSign` across it (−1: its low side),
 * `t` thick; the stools that fit and what to say.
 */
export function snackParts(top: Box, frontSign: -1 | 1, s: SnackSettings, t: number): { parts: FinishPart[]; stools: number; seat: number; notes: string[]; problems: string[] } {
  const [lo, hi] = top;
  const axis = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
  const across = 1 - axis;
  const z = s.height === "bar" ? BAR : hi[2];
  const notes: string[] = [];
  const problems: string[] = [];
  if (!(s.overhang > 0)) return { parts: [], stools: 0, seat: 0, notes, problems: ["Le débord doit être positif."] };
  if (s.overhang < 250) problems.push("Moins de 25 cm de débord : pas de place pour les genoux.");
  if (s.overhang > 400) notes.push("Plus de 40 cm de débord : des pieds plutôt que des consoles.");
  const box = (a: [number, number], b: [number, number], up: [number, number]): Box => {
    const from: Vec3 = [0, 0, up[0]];
    const to: Vec3 = [0, 0, up[1]];
    [from[axis], to[axis]] = a;
    [from[across], to[across]] = b;
    return [from, to];
  };
  const parts: FinishPart[] = [];
  let seating: number;
  let consoles: { at: number; ends: [number, number] }[] = [];
  if (s.side === "back") {
    // The side away from the fronts: out of the worktop by the overhang, over the length wanted, centred.
    const len = Math.min(s.length > 0 ? s.length : hi[axis]! - lo[axis]!, hi[axis]! - lo[axis]!);
    const mid = (lo[axis]! + hi[axis]!) / 2;
    const along: [number, number] = [mid - len / 2, mid + len / 2];
    const edge = frontSign < 0 ? hi[across]! : lo[across]!;
    const out = frontSign < 0 ? 1 : -1;
    // A bar stands on a rise along the worktop's edge, on the worktop.
    const reach: [number, number] = s.height === "bar" ? [edge - out * t, edge + out * s.overhang] : [edge, edge + out * s.overhang];
    parts.push({ name: s.height === "bar" ? "Plan de bar" : "Plan de snack", ...asParts(box(along, ordered(reach), [z - t, z])) });
    if (s.height === "bar") parts.push({ name: "Rehausse du bar", ...asParts(box(along, ordered([edge - out * t, edge]), [hi[2], z - t])) });
    seating = len;
    const count = Math.max(2, Math.round(len / STEP) + 1);
    consoles = Array.from({ length: count }, (_, i) => ({ at: along[0] + 50 + ((len - 100) * i) / (count - 1), ends: ordered([edge, edge + out * (s.overhang - 50)]) }));
  } else {
    // At an end: out along the worktop, as wide as its depth (or the length wanted).
    const width = Math.min(s.length > 0 ? s.length : hi[across]! - lo[across]!, hi[across]! - lo[across]!);
    const mid = (lo[across]! + hi[across]!) / 2;
    const side: [number, number] = [mid - width / 2, mid + width / 2];
    const end = s.side === "start" ? lo[axis]! : hi[axis]!;
    const out = s.side === "start" ? -1 : 1;
    parts.push({ name: s.height === "bar" ? "Plan de bar" : "Plan de snack", ...asParts(box(ordered([end, end + out * s.overhang]), side, [z - t, z])) });
    if (s.height === "bar") parts.push({ name: "Rehausse du bar", ...asParts(box(ordered([end - out * t, end]), side, [hi[2], z - t])) });
    seating = width;
    const count = Math.max(2, Math.round(width / STEP) + 1);
    consoles = Array.from({ length: count }, (_, i) => ({ at: side[0] + 50 + ((width - 100) * i) / (count - 1), ends: ordered([end, end + out * (s.overhang - 50)]) }));
    // A console runs along the overhang, here across the length: drawn turned.
    for (const c of consoles) parts.push({ name: SNACK_CONSOLE, ...asParts(box(c.ends, [c.at - 20, c.at + 20], [z - t - 40, z - t])), hardware: true, item: SNACK_CONSOLE });
    consoles = [];
  }
  for (const c of consoles) parts.push({ name: SNACK_CONSOLE, ...asParts(box([c.at - 20, c.at + 20], c.ends, [z - t - 40, z - t])), hardware: true, item: SNACK_CONSOLE });
  const stools = Math.floor(seating / STOOL);
  const seat = s.height === "bar" ? 750 : 650;
  notes.unshift(`${stools} tabouret${stools > 1 ? "s" : ""} de ${seat / 10} cm d'assise (60 cm chacun)${s.height === "bar" ? ", plan à 105 cm" : `, plan à ${Math.round(z / 10)} cm`}.`);
  if (!stools) problems.push("Trop court pour un tabouret : 60 cm au moins.");
  return { parts, stools, seat, notes, problems };
}

const ordered = ([a, b]: [number, number]): [number, number] => (a <= b ? [a, b] : [b, a]);
const asParts = ([from, to]: Box) => ({ from, to });
