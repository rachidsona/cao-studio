/**
 * La pièce d'un Plan de cuisine qui n'est pas posé sur une Pièce relevée, fermée d'office : aux murs que le plan
 * dessine derrière ses linéaires s'ajoutent ceux qui manquent pour faire le tour (à gauche, à droite, en face, et la
 * suite d'un mur plus court que la pièce), un sol en parquet et un plafond. La pièce est large comme le mur A, profonde
 * comme le plus long de ses murs de côté (3 m au moins), jusqu'au mur d'en face d'une cuisine parallèle, 1,20 m de
 * passage au-delà d'un îlot ou d'une péninsule. Et d'où on la regarde « de l'intérieur ». Pur.
 */
import type { KitchenBox } from "../features/kitchen-layout";
import { WALL_THICKNESS as T } from "./joinery-defaults";
import { kitchenRuns, runAt, type KitchenRun } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan, Vec3 } from "./types";

/** Where the plan keeps the pieces of its room (KitchenFloorPlan.made), beside those of its runs. */
export const ROOM_MADE = "room";
/** The least depth of the room, the passage kept past an island or a peninsula, the floor's and the ceiling's thickness (mm); the floor's look. */
export const ROOM_SHELL = { depth: 3000, passage: 1200, slab: 20, floor: "wood-oak" };

type Span = [number, number];
/** The face of each wall the plan draws behind a run: its two ends (plan frame). */
const faces = (runs: KitchenRun[]): [[number, number], [number, number]][] => runs.filter((r) => r.wall).map((r) => [runAt(r, 0, r.back), runAt(r, r.length, r.back)]);

/** The room, seen from above (plan frame: wall A along x at y = 0, the room towards −y). */
export function roomBounds(p: KitchenFloorPlan): { x: Span; y: Span } {
  const runs = kitchenRuns(p);
  const xs = (r: KitchenRun) => r.zone.outline.map((pt) => pt[0]);
  // A peninsula (a run with no wall behind it, not the island) stands in the room: the room goes on past it.
  const free = runs.filter((r) => !r.wall && r.id !== "I");
  const x0 = free.some((r) => Math.min(...xs(r)) < 1) ? -ROOM_SHELL.passage : 0;
  const x1 = free.some((r) => Math.max(...xs(r)) > p.lengthA - 1) ? p.lengthA + ROOM_SHELL.passage : p.lengthA;
  // A wall facing wall A (a parallel kitchen's) is the room's far side.
  const far = faces(runs).find(([a, b]) => Math.abs(a[1] - b[1]) < 1e-6 && a[1] < -1);
  const reach = Math.max(...runs.map((r) => Math.max(...r.zone.outline.map((pt) => -pt[1])) + (r.wall ? 0 : ROOM_SHELL.passage)));
  return { x: [x0, x1], y: [far ? far[0][1] : -Math.max(ROOM_SHELL.depth, reach), 0] };
}

/** `[a, b]` less what is covered. */
function gaps([a, b]: Span, covered: Span[]): Span[] {
  const out: Span[] = [];
  let at = a;
  for (const [c0, c1] of [...covered].sort((u, v) => u[0] - v[0])) {
    if (c0 - at > 1) out.push([at, Math.min(c0, b)]);
    at = Math.max(at, c1);
  }
  if (b - at > 1) out.push([at, b]);
  return out.filter(([u, v]) => v - u > 1);
}

/**
 * What closes the room round the walls of the runs: the walls missing, the floor, the ceiling (plan frame).
 * shortcut: a square room only — a wall out of square or a peninsula's wall A overlap the walls added by a wall's thickness; a room of another shape is surveyed with « Pièce ».
 */
export function roomShell(p: KitchenFloorPlan): KitchenBox[] {
  const { x, y } = roomBounds(p);
  const walls = faces(kitchenRuns(p));
  /** What the runs' walls cover of the side at `at` across `axis`. */
  const covered = (axis: 0 | 1, at: number): Span[] => walls.filter(([a, b]) => Math.abs(a[1 - axis]! - at) < 1 && Math.abs(b[1 - axis]! - at) < 1).map(([a, b]): Span => [Math.min(a[axis]!, b[axis]!), Math.max(a[axis]!, b[axis]!)]);
  const out: KitchenBox[] = [];
  const wall = (name: string, from: [number, number], to: [number, number], i: number, more: boolean) => out.push({ name: `${name}${more ? ", suite" : ""}${i ? ` ${i + 1}` : ""}`, kind: "wall", from: [from[0], from[1], 0], to: [to[0], to[1], p.height] });
  // Along wall A and along the far side: between the side walls.
  for (const [name, at, lo, hi] of [["Mur A", 0, 0, T], ["Mur D", y[0], y[0] - T, y[0]]] as const) {
    const has = covered(0, at);
    gaps(x, has).forEach(([a, b], i) => wall(name, [a, lo], [b, hi], i, has.length > 0));
  }
  // The side walls, through the corners (a run's wall there: wall A already goes through the corner).
  for (const [name, at, lo, hi] of [["Mur B", x[0], x[0] - T, x[0]], ["Mur C", x[1], x[1], x[1] + T]] as const) {
    const has = covered(1, at);
    gaps([y[0] - T, has.length ? 0 : T], has).forEach(([a, b], i) => wall(name, [lo, a], [hi, b], i, has.length > 0));
  }
  out.push({ name: "Sol", kind: "wall", from: [x[0], y[0], -ROOM_SHELL.slab], to: [x[1], 0, 0], look: ROOM_SHELL.floor });
  out.push({ name: "Plafond", kind: "wall", from: [x[0] - T, y[0] - T, p.height], to: [x[1] + T, T, p.height + ROOM_SHELL.slab] });
  return out;
}

/**
 * Where the kitchen is looked at from « inside its room »: what to aim at (the middle of its walls, at mid-height),
 * the way to the eye (unit, a little above: towards the room, off the corner the runs make) and the box to frame
 * (plan frame). The eye lower than the ceiling: it stays in view, the walls in the way go (app/wall-cutaway.ts).
 */
export function roomLook(p: KitchenFloorPlan): { target: Vec3; way: Vec3; box: [Vec3, Vec3] } {
  const { x } = roomBounds(p);
  const walls = faces(kitchenRuns(p));
  const side = (at: number) => walls.filter(([a, b]) => Math.abs(a[0] - at) < 1 && Math.abs(b[0] - at) < 1).map(([a, b]) => Math.max(-a[1], -b[1]));
  const [left, right] = [side(x[0]), side(x[1])];
  // As deep as its side runs, else as its units.
  const depth = Math.max(p.depth, ...left, ...right);
  // Off the corner: from the right of a kitchen on walls A and B, from the left of one on A and C; else a little from the right.
  const turn = left.length && !right.length ? 0.6 : right.length && !left.length ? -0.6 : 0.3;
  const norm = Math.hypot(turn, 1, 0.12);
  return { target: [p.lengthA / 2, -depth / 2, p.height * 0.45], way: [turn / norm, -1 / norm, 0.12 / norm], box: [[0, -depth, 0], [p.lengthA, 0, p.height]] };
}
