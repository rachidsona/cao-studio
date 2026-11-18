/**
 * Combler le vide d'un linéaire en prolongeant un meuble (« Place libre » de l'éditeur de linéaire) : le meuble choisi
 * prend en largeur le reste de sa rangée — la place restée ouverte, celle que des fileurs fermaient, celle des fileurs
 * muraux —, dans ses limites ; ses voisins se poussent d'autant. Pas la place gardée par un « Espace libre », voulue.
 * Refusé, avec la raison, quand rien n'est à combler ou que la rangée ne le tient pas. Pur.
 */
import { applianceOf, fillRun, isFiller, isSpace, itemEntry, sizeLimits, type RunFill } from "./kitchen-run-items";
import type { RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../document/types";

type Heights = Parameters<typeof fillRun>[2];
/** What a caisson furnished by hand may be made to (mm), as on the strip (app/kitchen/kitchen-strip-edit.ts). */
const HELD_WIDTH: [number, number] = [150, 2400];

/** `gaps` less the stretches `cut`. */
const less = (gaps: readonly [number, number][], cut: readonly [number, number][]): [number, number][] =>
  gaps.flatMap(([a, b]) => cut.reduce<[number, number][]>((parts, [c0, c1]) => parts.flatMap(([p0, p1]): [number, number][] => (c1 <= p0 || c0 >= p1 ? [[p0, p1]] : ([[p0, Math.max(p0, c0)], [Math.min(p1, c1), p1]] as [number, number][]).filter(([x, y]) => y - x > 0.5))), [[a, b]]));

/** The rest of a row left to fill (mm): open, closed by fillers, between the walls and the units; not the room kept free. */
export function restToFill(g: RunGeometry, fill: RunFill, row: "base" | "wall"): number {
  const kept = fill.spaces.filter((pl) => pl.row === row).map((pl): [number, number] => [pl.at, pl.at + pl.item.width]);
  const gaps = row === "wall" ? fill.wallFree : [...fill.free, ...fill.fillers];
  const walls = row === "base" && g.rest === "walls" ? fill.walls[0] + fill.walls[1] : 0;
  return less(gaps, kept).reduce((sum, [a, b]) => sum + b - a, 0) + walls;
}

/** Whether a unit may be prolonged so: not a filler, the room kept free, nor an appliance (its widths are its own). */
export const widenable = (item: KitchenRunItem): boolean => (!isFiller(item) || (isSpace(item) && !!item.furnished)) && !applianceOf(item);

/** The run's items with the unit `id` as wide as it is and the rest of its row; or why not. */
export function widenedToFill(plan: KitchenFloorPlan, g: RunGeometry, items: KitchenRunItem[], heights: Heights, id: string): { items: KitchenRunItem[]; by: number } | string {
  const fill = fillRun(g, items, heights);
  const pl = [...fill.placed, ...fill.spaces].find((p) => p.item.id === id);
  if (!pl || !widenable(pl.item)) return "Ce meuble ne se prolonge pas.";
  const rest = Math.round(restToFill(g, fill, pl.row) * 10) / 10;
  if (rest < 1) return "Rien à combler dans cette rangée.";
  const [, hi] = pl.item.furnished ? HELD_WIDTH : sizeLimits(plan, itemEntry(pl.item)).width;
  const width = Math.min(hi, Math.round((pl.item.width + rest) * 10) / 10);
  if (width <= pl.item.width + 0.5) return "Ce meuble est déjà aussi large qu'il peut l'être.";
  const next = items.map((i) => (i.id === id ? { ...i, width } : i));
  const check = fillRun(g, next, heights);
  if (check.missing.length > fill.missing.length || check.problems.length > fill.problems.length) return "Cette rangée ne le tient pas plus large (une fenêtre, une porte ou une colonne la coupe) : choisissez-en un autre.";
  return { items: next, by: width - pl.item.width };
}
