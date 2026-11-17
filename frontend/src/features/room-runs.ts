/**
 * Les murs d'une Pièce relevée (features/room-plan.ts) lus par les assistants Cuisine et Dressing. Les assistants
 * travaillent dans leur propre repère — leur mur A dans le plan Y = 0 vers +X, le mur B (en L, en U) partant de
 * l'origine vers −Y, le mur C du bout de A vers −Y — ; on choisit le mur de la pièce qui sera leur mur A, le mur B est
 * celui d'avant (la pièce tourne à droite), le mur C celui d'après. On en tire les longueurs, la hauteur sous
 * plafond, le placement (un quart de tour et un point) et ce qui gêne le long de chaque mur, en distance depuis le
 * début du mur tel que l'assistant le mesure : portes et fenêtres (des plages où ne pas mettre de meuble), retombées
 * et rampants (le plafond plus bas près du mur). Pur.
 */
import type { PlaneFrame, Vec3 } from "../document/types";
import { closingGap, wallFrames, wallName, type P2, type RoomInput } from "./room-plan";

export type RunWall = "A" | "B" | "C";

/** A place along a wall where furniture cannot go: under it (`low`, a door or a low window) or high (a window). */
export interface Span {
  from: number;
  to: number;
  what: string;
  /** Up to where the span blocks (mm from the floor): the top of a door, the top of a window. */
  top: number;
  /** From where it blocks: 0 for a door, the sill of a window. */
  bottom: number;
}

export interface RunInfo {
  /** The room's wall it is, and its inner length. */
  index: number;
  length: number;
  spans: Span[];
  /** The ceiling height `into` mm from the wall's face (lowered by a drop or a slope on this wall). */
  ceiling: (into: number) => number;
  /**
   * Wall B or C out of square with wall A: the corner's angle less 90° (°). Above 0 the wall opens away from the room,
   * below it comes in; its length is then measured square to wall A.
   */
  skew?: number;
}

/** A quarter turn (counterclockwise, seen from above) about the origin, then a shift in the plane. */
export interface Placement {
  quarter: 0 | 1 | 2 | 3;
  origin: P2;
}

const TOLERANCE = 0.5;
/** A survey whose last wall ends this near its first one's start is a closed room (mm). */
export const CLOSING = 50;

/** The ceiling over a wall, `into` mm into the room. */
function ceilingOf(room: RoomInput, wall: number): (into: number) => number {
  return (into) => {
    let h = room.height;
    for (const o of room.obstacles) {
      if (o.wall !== wall) continue;
      if (o.kind === "beam" && into < o.depth) h = Math.min(h, room.height - o.drop);
      if (o.kind === "slope") h = Math.min(h, o.knee + ((room.height - o.knee) * Math.min(Math.max(into, 0), o.depth)) / o.depth);
    }
    return h;
  };
}

/** A side wall out of square: its skew, and its length square to wall A. */
const skewed = (info: RunInfo, skew: number): RunInfo => (Math.abs(skew) <= TOLERANCE ? info : { ...info, skew, length: info.length * Math.cos((skew * Math.PI) / 180) });

/** The walls of the room an assistant uses, from the room's wall `a` as its wall A, or why it cannot; side walls up to `skewMax`° out of square. */
export function roomRuns(room: RoomInput, a: number, layout: "I" | "L" | "R" | "U", skewMax = TOLERANCE): { place: Placement; walls: Partial<Record<RunWall, RunInfo>> } | string {
  const n = room.walls.length;
  // A surveyed room never closes to the millimetre: a few centimetres apart, its last wall still meets its first.
  const closed = n >= 3 && closingGap(room) < CLOSING;
  const at = (i: number) => (i >= 0 && i < n ? i : closed ? (i + n) % n : null);
  const frames = wallFrames(room);
  const fa = frames[a];
  if (!fa) return "Ce mur n'est pas dans la pièce.";
  const heading = (Math.atan2(fa.u[1], fa.u[0]) * 180) / Math.PI;
  const quarter = ((Math.round(heading / 90) % 4) + 4) % 4;
  if (Math.abs(heading - Math.round(heading / 90) * 90) > TOLERANCE) return `Le ${wallName(a)} n'est pas d'équerre avec les axes : l'assistant pose ses meubles le long des axes X et Y.`;
  const walls: Partial<Record<RunWall, RunInfo>> = {};
  const info = (i: number, from: "start" | "corner"): RunInfo => {
    const w = room.walls[i]!;
    // Along the wall from its start, or back from its end (wall B runs away from the corner at its end).
    const map = (x: number) => (from === "start" ? x : w.length - x);
    const spans: Span[] = [];
    for (const o of room.obstacles) {
      if (o.wall !== i || (o.kind !== "door" && o.kind !== "window")) continue;
      const [p, q] = [map(o.at), map(o.at + o.width)].sort((x, y) => x - y) as [number, number];
      const bottom = o.kind === "window" ? o.sill : 0;
      spans.push({ from: p, to: q, what: `${o.kind === "door" ? "la porte" : "la fenêtre"} du ${wallName(i)}`, bottom, top: bottom + o.height });
    }
    return { index: i, length: w.length, spans: spans.sort((x, y) => x.from - y.from), ceiling: ceilingOf(room, i) };
  };
  walls.A = info(a, "start");
  if (layout === "L" || layout === "U") {
    const b = at(a - 1);
    if (b === null) return `Il n'y a pas de mur avant le ${wallName(a)} pour le mur B : choisissez un autre mur A.`;
    if (Math.abs(room.walls[b]!.angle - 90) > skewMax) return `L'angle entre le ${wallName(b)} et le ${wallName(a)} n'est pas droit (${room.walls[b]!.angle}°)${skewMax > TOLERANCE ? ` : ${skewMax}° d'écart au plus` : ""}.`;
    walls.B = skewed(info(b, "corner"), room.walls[b]!.angle - 90);
  }
  if (layout === "R" || layout === "U") {
    const c = at(a + 1);
    if (c === null) return `Il n'y a pas de mur après le ${wallName(a)} pour le mur C : choisissez un autre mur A.`;
    if (Math.abs(room.walls[a]!.angle - 90) > skewMax) return `L'angle entre le ${wallName(a)} et le ${wallName(c)} n'est pas droit (${room.walls[a]!.angle}°)${skewMax > TOLERANCE ? ` : ${skewMax}° d'écart au plus` : ""}.`;
    walls.C = skewed(info(c, "start"), room.walls[a]!.angle - 90);
  }
  return { place: { quarter: quarter as Placement["quarter"], origin: fa.start }, walls };
}

/** A direction turned by the placement (no shift). */
export function turn(place: Placement, v: Vec3): Vec3 {
  let [x, y] = [v[0], v[1]];
  for (let k = 0; k < place.quarter; k++) [x, y] = [-y, x];
  return [x + 0, y + 0, v[2]];
}

/** A point of the assistant's frame, in the room's. */
export function placePoint(place: Placement, p: Vec3): Vec3 {
  const t = turn(place, p);
  return [t[0] + place.origin[0], t[1] + place.origin[1], t[2]];
}

/** A box of the assistant's frame (its two corners), in the room's: still along the axes. */
export function placeBox(place: Placement, from: Vec3, to: Vec3): [Vec3, Vec3] {
  const [a, b] = [placePoint(place, from), placePoint(place, to)];
  return [[0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)) as Vec3, [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)) as Vec3];
}

/** A sketch plane of the assistant's frame, in the room's. */
export function placeFrame(place: Placement, frame: PlaneFrame): PlaneFrame {
  return { origin: placePoint(place, frame.origin), xDir: turn(place, frame.xDir), normal: turn(place, frame.normal) };
}

/** The free stretches of a run between `start` and `end`, around the spans that reach between `low` and `high`. */
export function freeStretches(spans: readonly Span[], start: number, end: number, low: number, high: number, margin = 0): [number, number][] {
  const out: [number, number][] = [];
  let from = start;
  for (const s of [...spans].sort((x, y) => x.from - y.from)) {
    if (s.top <= low || s.bottom >= high) continue;
    if (s.from - margin > from) out.push([from, Math.min(end, s.from - margin)]);
    from = Math.max(from, s.to + margin);
  }
  if (end > from) out.push([from, end]);
  return out.filter(([a, b]) => b - a > 1);
}
