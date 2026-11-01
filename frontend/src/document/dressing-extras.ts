/**
 * Ce qui s'ajoute à un dressing (document/dressing-plan.ts) hors de ses Répartitions : les portes coulissantes (des
 * panneaux sur deux voies, qui se recouvrent, et leurs rails, au mètre), les accessoires achetés (porte-pantalons,
 * penderie escamotable) comme quincaillerie du devis, et les hauteurs à vérifier — une tringle ou une étagère qu'on
 * n'atteint pas sans marchepied. Le tout dans le repère de l'assistant (mur A dans le plan Y = 0 vers +X, mur B le
 * long de X = 0, mur C le long de X = longueur de A, le dressing devant). Pur.
 */
import type { TrimFeature, Vec3 } from "./types";

export type WallSide = "A" | "B" | "C";

/** A box beside a wall, between `p` and `q` along it (from its start, or from the corner for B and C), `a` to `b` off it. */
export function wallBand(wall: WallSide, lengthA: number, p: number, q: number, a: number, b: number, z0: number, z1: number): [Vec3, Vec3] {
  if (wall === "A") return [[p, -b, z0], [q, -a, z1]];
  if (wall === "B") return [[a, -q, z0], [b, -p, z1]];
  return [[lengthA - b, -q, z0], [lengthA - a, -p, z1]];
}

type Part = TrimFeature["parts"][number];

/** Above this, a rod is not reached without a step: a pull-down rod is advised (mm). */
export const REACH_ROD = 1900;
/** Shelves above this need a step (mm). */
export const REACH_SHELF = 2000;
const OVERLAP = 30;
const TRACK = 25;
const RAIL = 40;

/**
 * Sliding doors in front of a run from `p` to `q` (`depth`: the front of the dressing off the wall), `count` doors
 * (about a metre each) on two tracks that overlap, from the plinth to under the top rail; and the two rails.
 */
export function slidingDoors(wall: WallSide, lengthA: number, p: number, q: number, depth: number, height: number, plinth: number, thickness: number): Part[] {
  const length = q - p;
  const count = Math.max(2, Math.round(length / 1000));
  const width = (length + (count - 1) * OVERLAP) / count;
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const at = p + i * (width - OVERLAP);
    // Alternate tracks, the first at the back.
    const off = depth + 10 + (i % 2) * TRACK;
    const [from, to] = wallBand(wall, lengthA, at, at + width, off, off + thickness, Math.max(plinth, 10) + 5, height - RAIL - 5);
    parts.push({ name: `Porte coulissante ${wall}${i + 1}`, from, to });
  }
  const railDepth = 10 + TRACK + thickness + 10;
  const [t0, t1] = wallBand(wall, lengthA, p, q, depth, depth + railDepth, height - RAIL, height);
  const [b0, b1] = wallBand(wall, lengthA, p, q, depth, depth + railDepth, 0, Math.max(plinth, 10));
  parts.push({ name: `Rail haut ${wall}`, from: t0, to: t1, hardware: true, item: "Rail de porte coulissante", per: "m" }, { name: `Rail bas ${wall}`, from: b0, to: b1, hardware: true, item: "Rail de porte coulissante", per: "m" });
  return parts;
}

/** A bought accessory in a case from `x0` to `x1` along the run (`p` its start), at height `z`. */
export function accessory(wall: WallSide, lengthA: number, x0: number, x1: number, depth: number, z: number, item: "Porte-pantalons coulissant" | "Penderie escamotable"): Part {
  const [from, to] = item === "Penderie escamotable" ? wallBand(wall, lengthA, x0 + 20, x1 - 20, depth / 2 - 20, depth / 2 + 20, z - 20, z + 20) : wallBand(wall, lengthA, x0 + 20, x1 - 20, 30, depth - 30, z, z + 80);
  return { name: item, from, to, hardware: true, item };
}
