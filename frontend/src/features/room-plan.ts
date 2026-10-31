/**
 * Relevé de pièce, en géométrie pure : les murs comme on les mesure — la longueur de chacun et l'angle de chaque coin
 * (90° quand la pièce est d'équerre, sinon l'angle relevé) —, leur hauteur et leur épaisseur, et ce qui gêne un
 * meuble : fenêtres et portes (des ouvertures dans le mur), prises, retombées de plafond (une poutre ou un soffite le
 * long d'un mur) et rampants (une sous-pente qui descend vers un mur). Le premier mur part de l'origine vers +X, la
 * pièce à sa droite (vers −Y, là où se posent les meubles), les suivants en tournant à droite. Donne les pièces que le
 * noyau construit (des prismes droits) et les heurts d'un meuble avec elles.
 */
import type { Vec3 } from "../document/types";

export type P2 = [number, number];

export interface RoomWall {
  length: number;
  /** Angle inside the room at the end of this wall, with the next one (degrees). */
  angle: number;
}

export type Obstacle =
  | { kind: "window"; wall: number; at: number; width: number; height: number; sill: number }
  | { kind: "door"; wall: number; at: number; width: number; height: number }
  | { kind: "socket"; wall: number; at: number; height: number }
  /** A drop of the ceiling all along a wall: `depth` into the room, `drop` below the ceiling. */
  | { kind: "beam"; wall: number; depth: number; drop: number }
  /** A sloped ceiling coming down to a wall: `knee` high at the wall, reaching the ceiling `depth` into the room. */
  | { kind: "slope"; wall: number; knee: number; depth: number };

export interface RoomInput {
  walls: RoomWall[];
  height: number;
  thickness: number;
  obstacles: Obstacle[];
}

/** A straight prism: a 2D outline in the plane (origin, xDir, normal), pushed `length` along the normal. */
export interface Prism {
  origin: Vec3;
  xDir: Vec3;
  normal: Vec3;
  points: P2[];
  length: number;
}

export interface RoomPiece {
  name: string;
  kind: "wall" | "socket" | "beam" | "slope";
  prism: Prism;
}

export const WALL_NAMES = "ABCDEFGHIJ";
export const wallName = (i: number) => `mur ${WALL_NAMES[i] ?? i + 1}`;

const add = (a: P2, b: P2, k = 1): P2 => [a[0] + b[0] * k, a[1] + b[1] * k];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];

export interface WallFrame {
  start: P2;
  end: P2;
  /** Along the wall, and outwards (away from the room, to its left). */
  u: P2;
  n: P2;
  length: number;
  /** Outline seen from above: start and end on the room side, then the outer side (mitred at the corners). */
  outline: P2[];
}

/** Where each wall stands: the chain of corners, turning right by 180° − the angle at each corner. */
export function wallFrames(room: Pick<RoomInput, "walls" | "thickness">): WallFrame[] {
  let at: P2 = [0, 0];
  let heading = 0;
  const raw = room.walls.map((w) => {
    const u: P2 = [Math.cos(heading), Math.sin(heading)];
    const start = at;
    at = add(at, u, w.length);
    heading -= ((180 - w.angle) * Math.PI) / 180;
    return { start, end: at, u, n: [-u[1], u[0]] as P2, length: w.length };
  });
  const t = room.thickness;
  /** The outer corner between wall i and i + 1: where their outer faces meet. */
  const mitre = (a: (typeof raw)[number], b: (typeof raw)[number]): P2 => {
    const pa = add(a.start, a.n, t);
    const pb = add(b.start, b.n, t);
    const d = cross(a.u, b.u);
    if (Math.abs(d) < 1e-9) return add(a.end, a.n, t);
    const s = cross([pb[0] - pa[0], pb[1] - pa[1]], b.u) / d;
    return add(pa, a.u, s);
  };
  // A room that closes (its last wall ends where the first starts) is mitred at that corner too.
  const last = raw.at(-1);
  const closed = raw.length >= 3 && !!last && Math.hypot(last.end[0], last.end[1]) < 1;
  return raw.map((w, i) => {
    const before = i > 0 ? mitre(raw[i - 1]!, w) : closed ? mitre(last!, w) : add(w.start, w.n, t);
    const after = i < raw.length - 1 ? mitre(w, raw[i + 1]!) : closed ? mitre(w, raw[0]!) : add(w.end, w.n, t);
    return { ...w, outline: [w.start, w.end, after, before] };
  });
}

const v3 = (p: P2, z = 0): Vec3 => [p[0], p[1], z];

/** The bodies of the room: its walls, then the sockets, drops and slopes; and the openings cut in each wall. */
export function roomPieces(room: RoomInput): { pieces: RoomPiece[]; openings: { wall: number; prism: Prism }[] } {
  const frames = wallFrames(room);
  const H = room.height;
  const t = room.thickness;
  const up: Vec3 = [0, 0, 1];
  const pieces: RoomPiece[] = frames.map((f, i) => ({ name: `Mur ${WALL_NAMES[i] ?? i + 1}`, kind: "wall", prism: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: up, points: f.outline, length: H } }));
  const openings: { wall: number; prism: Prism }[] = [];
  const count = { socket: 0, beam: 0, slope: 0 };
  for (const o of room.obstacles) {
    const f = frames[o.wall];
    if (!f) continue;
    const inward: Vec3 = [-f.n[0], -f.n[1], 0];
    const along: Vec3 = [f.u[0], f.u[1], 0];
    const back: Vec3 = [-f.u[0], -f.u[1], 0];
    if (o.kind === "window" || o.kind === "door") {
      // Drawn on the outer face, pushed through the wall (and a millimetre past each face).
      const bottom = o.kind === "window" ? o.sill : 0;
      openings.push({ wall: o.wall, prism: { origin: v3(add(add(f.start, f.u, o.at), f.n, t + 1)), xDir: along, normal: inward, points: [[0, bottom], [o.width, bottom], [o.width, bottom + o.height], [0, bottom + o.height]], length: t + 2 } });
    } else if (o.kind === "socket") {
      count.socket++;
      pieces.push({ name: `Prise ${count.socket} (${wallName(o.wall)})`, kind: "socket", prism: { origin: v3(add(f.start, f.u, o.at)), xDir: along, normal: inward, points: [[-40, o.height - 40], [40, o.height - 40], [40, o.height + 40], [-40, o.height + 40]], length: 8 } });
    } else {
      // In the vertical plane across the wall, from its end, pushed back along it: x into the room, y up.
      const profile: P2[] = o.kind === "beam" ? [[0, H - o.drop], [o.depth, H - o.drop], [o.depth, H], [0, H]] : [[0, o.knee], [0, H], [o.depth, H]];
      count[o.kind]++;
      pieces.push({ name: `${o.kind === "beam" ? "Retombée" : "Rampant"} ${count[o.kind]} (${wallName(o.wall)})`, kind: o.kind, prism: { origin: v3(f.end), xDir: inward, normal: back, points: profile, length: f.length } });
    }
  }
  return { pieces, openings };
}

/** The gap between the end of the last wall and the start of the first (a closed survey that does not close). */
export function closingGap(room: Pick<RoomInput, "walls" | "thickness">): number {
  const frames = wallFrames(room);
  const last = frames.at(-1);
  return last ? Math.hypot(last.end[0], last.end[1]) : 0;
}

type Box = [Vec3, Vec3];

/** Do a convex outline and a rectangle (min, max) overlap by more than `tol` (separating axes)? */
function overlap2d(poly: P2[], lo: P2, hi: P2, tol = 0.5): boolean {
  const rect: P2[] = [lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]];
  const axes: P2[] = [[1, 0], [0, 1], ...poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    return [-(q[1] - p[1]), q[0] - p[0]] as P2;
  })];
  return axes.every((a) => {
    const l = Math.hypot(a[0], a[1]) || 1;
    const proj = (pts: P2[]) => pts.map((p) => (p[0] * a[0] + p[1] * a[1]) / l);
    const [pa, pb] = [proj(poly), proj(rect)];
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > tol;
  });
}

/** What of the room a piece of furniture (its box) runs into, by name; and the sockets it hides. */
export function roomClashes(room: RoomInput, box: Box): { hits: string[]; hidden: string[] } {
  const frames = wallFrames(room);
  const H = room.height;
  const lo: P2 = [box[0][0], box[0][1]];
  const hi: P2 = [box[1][0], box[1][1]];
  const [z0, z1] = [box[0][2], box[1][2]];
  const hits: string[] = [];
  const hidden: string[] = [];
  frames.forEach((f, i) => {
    if (z1 > 0.5 && z0 < H - 0.5 && overlap2d(f.outline, lo, hi)) hits.push(`le ${wallName(i)}`);
  });
  const strip = (f: WallFrame, depth: number): P2[] => [f.start, f.end, add(f.end, f.n, -depth), add(f.start, f.n, -depth)];
  const corners: P2[] = [lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]];
  for (const o of room.obstacles) {
    const f = frames[o.wall];
    if (!f) continue;
    if (o.kind === "beam" && z1 > H - o.drop + 0.5 && overlap2d(strip(f, o.depth), lo, hi)) hits.push(`la retombée du ${wallName(o.wall)}`);
    if (o.kind === "slope" && overlap2d(strip(f, o.depth), lo, hi)) {
      // The ceiling over the box's nearest point to the wall.
      const into = Math.max(0, Math.min(o.depth, ...corners.map((c) => -((c[0] - f.start[0]) * f.n[0] + (c[1] - f.start[1]) * f.n[1]))));
      if (z1 > o.knee + ((H - o.knee) * into) / o.depth + 0.5) hits.push(`le rampant du ${wallName(o.wall)}`);
    }
    if (o.kind === "socket") {
      const c = add(add(f.start, f.u, o.at), f.n, -5);
      if (c[0] > lo[0] && c[0] < hi[0] && c[1] > lo[1] && c[1] < hi[1] && o.height > z0 && o.height < z1) hidden.push(`la prise du ${wallName(o.wall)} à ${Math.round(o.at)} mm`);
    }
  }
  return { hits, hidden };
}
