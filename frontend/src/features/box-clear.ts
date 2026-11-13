/**
 * Un meuble qu'on déplace ne se pose pas dans un autre : là où sa boîte entrerait dans celle d'un autre corps, elle
 * est remise à côté de lui, au ras — du côté le plus proche de l'endroit visé, sur l'axe où il y a le moins à
 * reculer ; si cette place est prise aussi, à la suivante. Elle recule vers là d'où elle vient, sans aller plus loin ;
 * elle n'avance au-delà d'un meuble que si elle l'a déjà passé de plus de la moitié de sa largeur (un meuble serré
 * entre ses voisins reste à sa place, il ne saute pas derrière le mur du bout). Ce que la boîte touche déjà là où
 * elle est (la plinthe qui passe sous elle, la crédence derrière elle) ne la gêne pas. Géométrie pure.
 */
import type { Vec3 } from "../document/types";
import type { Box } from "./smart-align";

/** Two boxes are in one another when they overlap by more than this on every axis (mm): touching is not. */
export const CLEARANCE = 1;

const overlap = (a: Box, b: Box, axis: number, eps: number) => a[0][axis]! < b[1][axis]! - eps && a[1][axis]! > b[0][axis]! + eps;
const inside = (a: Box, b: Box, eps: number) => [0, 1, 2].every((axis) => overlap(a, b, axis, eps));
const shifted = (box: Box, by: Vec3): Box => [box[0].map((v, i) => v + by[i]!) as Vec3, box[1].map((v, i) => v + by[i]!) as Vec3];

/**
 * The move of `box` (by `translate`) kept out of the `others`: the same move when it stands in none of them, else the
 * nearest one that does, changed along one of `axes` only. Null: no place clear along these axes.
 */
export function clearOf(box: Box, others: readonly Box[], translate: Vec3, axes: readonly number[], eps = CLEARANCE): Vec3 | null {
  // What it already stands in where it is, is not in its way.
  const obstacles = others.filter((o) => !inside(box, o, eps));
  const moved = shifted(box, translate);
  if (!obstacles.some((o) => inside(moved, o, eps))) return translate;
  let best: { axis: number; by: number } | null = null;
  for (const axis of axes) {
    const [b, c] = [0, 1, 2].filter((i) => i !== axis) as [number, number];
    // Along this axis, where the others across its path are.
    const blocked = obstacles.filter((o) => overlap(moved, o, b, eps) && overlap(moved, o, c, eps)).map((o) => [o[0][axis]!, o[1][axis]!] as const);
    const at = moved[0][axis]!;
    const size = moved[1][axis]! - at;
    const free = (x: number) => blocked.every(([lo, hi]) => x + size <= lo + eps || x >= hi - eps);
    const come = translate[axis]!;
    // Back towards where it comes from (no further than that); or on, past what it is already half through.
    const reach = (by: number) => (by * come < 0 ? Math.abs(by) <= Math.abs(come) + 1e-9 : Math.abs(by) <= size / 2 + 1e-9);
    for (const x of [at - come, ...blocked.flatMap(([lo, hi]) => [lo - size, hi])]) {
      if (free(x) && reach(x - at) && (!best || Math.abs(x - at) < Math.abs(best.by) - 1e-9)) best = { axis, by: x - at };
    }
  }
  if (!best) return null;
  const out: Vec3 = [...translate];
  out[best.axis] = out[best.axis]! + best.by;
  return out;
}
