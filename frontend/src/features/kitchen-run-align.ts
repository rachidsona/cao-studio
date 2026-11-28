/**
 * « Aligner sur le meuble du dessous » : un meuble haut d'un linéaire de cuisine mis d'aplomb avec le meuble bas qui est
 * sous lui (celui qu'il recouvre le plus, sinon le suivant) — leurs bords gauches l'un au-dessus de l'autre, sinon
 * leurs bords droits. La rangée haute se remplit
 * d'elle-même, meuble contre meuble : le décalage se fait par de la place gardée libre (un « Espace libre » du haut)
 * mise avant ou après lui, ou reprise à celle qui s'y trouve ; les autres meubles hauts se poussent d'autant. Refusé
 * quand un meuble n'aurait plus sa place. Pur.
 */
import type { RunGeometry } from "../document/kitchen-plan-shapes";
import type { KitchenRunItem } from "../document/types";
import { fillRun, heldUnits, isSpace, itemEntry, newItem, rowOf, SPACE_WALL, type Placed } from "./kitchen-run-items";

type Heights = { worktop: number; wallBottom: number; wallTop: number };
const NEAR = 0.5;

/** The items with a free room of the wall row taken in or put, `by` mm, before or after the unit at `k`. */
function shifted(items: readonly KitchenRunItem[], k: number, where: "before" | "after", by: number): KitchenRunItem[] | null {
  const wall = (i: KitchenRunItem | undefined) => !!i && rowOf(itemEntry(i)) === "wall";
  // The item of its row next to it, that way.
  let j = k + (where === "before" ? -1 : 1);
  while (j >= 0 && j < items.length && !wall(items[j])) j += where === "before" ? -1 : 1;
  const beside = items[j];
  const free = beside && isSpace(beside) && !beside.furnished ? beside : null;
  if (by < 0) {
    // Less room there: only what a free room has.
    if (!free || free.width < -by - NEAR) return null;
    const left = free.width + by;
    return items.flatMap((i) => (i === free ? (left >= 1 ? [{ ...i, width: left }] : []) : [i]));
  }
  if (free) return items.map((i) => (i === free ? { ...i, width: i.width + by } : i));
  const space = newItem(items, SPACE_WALL, by);
  const at = where === "before" ? k : k + 1;
  return [...items.slice(0, at), space, ...items.slice(at)];
}

/**
 * The run with the wall unit `id` set over the base unit under it; what it was aligned on and by which side. A
 * string: why it cannot be.
 */
export function alignedOver(g: RunGeometry, items: readonly KitchenRunItem[], heights: Heights, id: string): { items: KitchenRunItem[]; on: string; side: "gauche" | "droit" } | string {
  const fill = fillRun(g, items, heights);
  const unit = fill.placed.find((pl) => pl.item.id === id);
  if (!unit || unit.row !== "wall") return "Choisissez un meuble haut à aligner sur le meuble du dessous.";
  const base = [...fill.placed, ...heldUnits(fill)].filter((pl) => pl.row === "base" && pl.entry.kind !== "tall");
  if (!base.length) return "Il n'y a pas de meuble bas sous lui sur ce linéaire.";
  // Under it: the base unit it stands over the most, then the others, the nearest first — for when it cannot be set
  // over the first (a wall unit beside it in the way).
  const [u0, u1] = [unit.at, unit.at + unit.item.width];
  const over = (pl: Placed) => Math.max(0, Math.min(u1, pl.at + pl.item.width) - Math.max(u0, pl.at));
  const away = (pl: Placed) => Math.abs(pl.at + pl.item.width / 2 - (u0 + u1) / 2);
  const below = [...base].sort((a, b) => over(b) - over(a) || away(a) - away(b));
  const first = below[0]!;
  const edges = (pl: Placed): ["gauche" | "droit", number][] => [["gauche", pl.at], ["droit", pl.at + pl.item.width - unit.item.width]];
  if (edges(first).some(([, target]) => Math.abs(target - unit.at) < NEAR)) return `« ${unit.entry.name} » est déjà aligné sur « ${first.entry.name} ».`;
  const stood = new Set(fill.missing.map((m) => m.id));
  const list = fill.items;
  const k = list.findIndex((i) => i.id === id);
  for (const under of below) {
    for (const [side, target] of edges(under)) {
      const delta = target - unit.at;
      if (Math.abs(delta) < NEAR) continue;
      // Towards the right: room put before it, or taken in after it; towards the left: taken in before it, or put
      // after it. The rest of the wall shared at both ends moves it by half of what is put: twice as much is tried too.
      const tries: ["before" | "after", number][] = [["before", delta], ["after", -delta], ["before", 2 * delta], ["after", -2 * delta]];
      for (const [where, by] of tries) {
        const next = shifted(list, k, where, by);
        if (!next) continue;
        const made = fillRun(g, next, heights);
        const now = made.placed.find((pl) => pl.item.id === id);
        if (now && Math.abs(now.at - target) < NEAR && !made.missing.some((m) => !stood.has(m.id))) return { items: next, on: under.entry.name, side };
      }
    }
  }
  return `Pas de place pour aligner « ${unit.entry.name} » sur « ${first.entry.name} » : un meuble haut n'aurait plus la sienne. Retirez ou rétrécissez un meuble haut d'abord.`;
}
