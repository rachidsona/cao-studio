/**
 * « Place libre » d'un linéaire de cuisine : un vide d'une rangée — la place restée ouverte ou gardée par un « Espace
 * libre » — rempli de 2, 3 ou 4 caissons égaux, bas ou hauts selon la rangée (une porte jusqu'à 60 cm, deux au-delà).
 * Les autres meubles ne bougent pas ; refusé, avec la raison, quand les caissons ne tiendraient pas là. Pur.
 */
import { fillRun, insertItem, isSpace, itemEntry, newItem, rowOf, sizeLimits, type Placed } from "./kitchen-run-items";
import type { RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../document/types";

type Heights = Parameters<typeof fillRun>[2];

/** The model of `n` equal caissons of `width` in `row`. */
export const equalModel = (row: "base" | "wall", width: number): string => (row === "wall" ? (width <= 600 ? "wall-haut-1-porte" : "wall-haut-2-portes") : width <= 600 ? "base-bas-1-porte" : "base-bas-2-portes");

/** Each unit standing (not a space), where it stands. */
const standing = (placed: readonly Placed[]) => new Map(placed.filter((pl) => !isSpace(pl.item) || pl.item.furnished).map((pl) => [pl.item.id, pl.at]));

/** The run's items with the empty stretch `a`…`b` of `row` filled by `n` equal caissons (their ids); or why not. */
export function equalFill(plan: KitchenFloorPlan, g: RunGeometry, items: KitchenRunItem[], heights: Heights, row: "base" | "wall", [a, b]: [number, number], n: number): { items: KitchenRunItem[]; ids: string[] } | string {
  const width = Math.floor(((b - a) / n) * 10) / 10;
  const model = equalModel(row, width);
  const [lo, hi] = sizeLimits(plan, itemEntry(newItem(items, model, width))).width;
  if (width < lo - 0.05 || width > hi + 0.05) return `${n} caissons de ${width / 10} cm : la largeur va de ${lo / 10} à ${hi / 10} cm.`;
  const fill = fillRun(g, items, heights);
  // The room kept free in that stretch goes: the caissons take it.
  const kept = new Set(fill.spaces.filter((pl) => pl.row === row && !pl.item.furnished && pl.at < b - 0.5 && pl.at + pl.item.width > a + 0.5).map((pl) => pl.item.id));
  let next = items.filter((i) => !kept.has(i.id));
  // After the unit standing just before it in its row, or first in the row.
  const stands = [...fill.placed, ...fill.spaces.filter((pl) => pl.item.furnished)];
  const before = stands.filter((pl) => pl.row === row && pl.at + pl.item.width <= a + 0.5).sort((x, y) => y.at - x.at)[0];
  const ids: string[] = [];
  for (let k = 0; k < n; k++) {
    const unit = newItem(next, model, width);
    const after = ids.at(-1) ?? before?.item.id;
    if (after) next = insertItem(next, unit, after);
    else {
      const first = next.findIndex((i) => rowOf(itemEntry(i)) === row);
      next = first < 0 ? insertItem(next, unit) : [...next.slice(0, first), unit, ...next.slice(first)];
    }
    ids.push(unit.id);
  }
  // Checked: each where it should be, and the others where they were.
  const made = fillRun(g, next, heights);
  const at = standing([...made.placed, ...made.spaces]);
  const ok = ids.every((id, k) => Math.abs((at.get(id) ?? Infinity) - (a + k * width)) < 1) && [...standing(stands)].every(([id, x]) => Math.abs((at.get(id) ?? Infinity) - x) < 1);
  return ok ? { items: next, ids } : `${n} caissons égaux ne se posent pas dans ce vide sans pousser les autres meubles.`;
}
