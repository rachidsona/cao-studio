/**
 * Poids et stabilité d'un meuble, en calcul pur : la masse de chaque pièce (son volume × la masse volumique de sa
 * matière), le poids total et le centre de gravité ; puis l'essai de basculement : tous les tiroirs sortis et chargés,
 * le centre de gravité doit rester derrière l'arête avant du pied du meuble (sinon il bascule vers l'avant). Un meuble
 * haut et peu profond est signalé à fixer au mur, comme le demande la norme (EN 14749).
 */
import type { Vec3 } from "../document/types";

/** Density (kg/m³) of the workshop's materials; an unknown one is taken as particleboard. */
export const DENSITY: Record<string, number> = {
  "melamine-white": 650,
  "melamine-oak": 650,
  "melamine-walnut": 650,
  "melamine-anthracite": 650,
  mdf: 750,
  "lacquer-white": 760,
  "birch-plywood": 680,
  "solid-oak": 700,
  hdf: 900,
};
const DEFAULT_DENSITY = 650;

/** Mass (kg) of a part of `volume` mm³. */
export const partMass = (volume: number, material: string | undefined) => volume * 1e-9 * (DENSITY[material ?? ""] ?? DEFAULT_DENSITY);

export interface MassPart {
  mass: number;
  center: Vec3;
}

export interface Drawer {
  /** The drawer's own parts and where they go when it is pulled out. */
  parts: MassPart[];
  slide: Vec3;
}

export interface StabilityReport {
  mass: number;
  center: Vec3;
  /** Height of the centre of gravity above the floor (mm). */
  height: number;
  /** With every drawer out and loaded: how far the centre of gravity stays behind the front edge (mm; < 0: it tips). */
  margin: number;
  tips: boolean;
  /** High and shallow: to fix to the wall. */
  fixToWall: boolean;
}

const centerOf = (parts: readonly MassPart[]): Vec3 => {
  const m = parts.reduce((s, p) => s + p.mass, 0) || 1;
  return [0, 1, 2].map((i) => parts.reduce((s, p) => s + p.mass * p.center[i]!, 0) / m) as Vec3;
};

/**
 * The report of the furniture (its box; `front`: the axis and side it faces, −Y by default), its footprint the boxes
 * that stand on the floor; `load` kg in each drawer, at the middle of its box.
 */
export function stability(parts: readonly MassPart[], drawers: readonly Drawer[], footprint: readonly [Vec3, Vec3][], box: [Vec3, Vec3], load: number, front: { axis: 0 | 1; sign: -1 | 1 } = { axis: 1, sign: -1 }): StabilityReport {
  const mass = parts.reduce((s, p) => s + p.mass, 0);
  const center = centerOf(parts);
  const a = front.axis;
  const lo = box[0][2];
  const frontEdge = front.sign < 0 ? Math.min(...footprint.map((b) => b[0][a]!)) : Math.max(...footprint.map((b) => b[1][a]!));
  const depth = box[1][a] - box[0][a];
  const tall = box[1][2] - lo;
  // Every drawer pulled out: its parts moved by its slide, plus its load at its middle.
  const inDrawers = new Set(drawers.flatMap((d) => d.parts));
  const open: MassPart[] = [
    ...parts.filter((p) => !inDrawers.has(p)),
    ...drawers.flatMap((d) => {
      const moved = d.parts.map((p): MassPart => ({ mass: p.mass, center: [0, 1, 2].map((i) => p.center[i]! + d.slide[i]!) as Vec3 }));
      return load > 0 ? [...moved, { mass: load, center: centerOf(moved) }] : moved;
    }),
  ];
  const opened = centerOf(open);
  // Behind the front edge: towards the inside of the furniture.
  const margin = (opened[a]! - frontEdge) * -front.sign;
  return { mass, center, height: center[2]! - lo, margin, tips: margin < 0, fixToWall: tall >= 1000 && tall / Math.max(depth, 1) > 2.5 };
}
