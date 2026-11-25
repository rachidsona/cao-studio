/**
 * Un meuble du Plan de cuisine poussé le long de son mur dans la 3D (Pousser, Déplacer…) : le plan le garde là, par la
 * place libre qu'il laisse — un « Espace libre » de la rangée devant lui (features/kitchen-run-items.ts), et celui
 * d'après le dernier meuble poussé qui rétrécit (ou grandit) d'autant. Les meubles d'une même rangée poussés ensemble gardent leurs écarts. Refusé (null) quand le
 * linéaire ne peut pas le dire : deux meubles l'un dans l'autre, un meuble au-delà du mur. Pur.
 */
import { findFeature } from "./operations";
import { runAt, type KitchenRun, type RunGeometry } from "./kitchen-plan-shapes";
import type { CabinetFeature, CadDocument, KitchenFloorPlan, KitchenRunItem } from "./types";
import type { KitchenUnit } from "../features/kitchen-layout";
import { placePoint, turn } from "../features/room-runs";
import { fillRun, isSpace, itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";

type Heights = Parameters<typeof fillRun>[2];
/** Less than this along the run (mm): not moved. */
const STILL = 0.5;

/**
 * The items with `extra` more room kept just before `id` in its row (less when negative), or null when there is none to
 * take; `open`: what is missing is taken from the room the run leaves open there (its rest, before a column at its end).
 */
function withRoomBefore(items: KitchenRunItem[], id: string, extra: number, open = false): KitchenRunItem[] | null {
  const k = items.findIndex((i) => i.id === id);
  if (k < 0) return null;
  const row = rowOf(itemEntry(items[k]!));
  let j = k - 1;
  while (j >= 0 && rowOf(itemEntry(items[j]!)) !== row) j--;
  const before = j >= 0 && isSpace(items[j]!) ? items[j]! : null;
  const width = Math.round(((before?.width ?? 0) + extra) * 10) / 10;
  if (width < -STILL) return open ? items.filter((i) => i !== before) : null;
  if (before) return width <= STILL ? items.filter((i) => i !== before) : items.map((i) => (i === before ? { ...i, width } : i));
  if (width <= STILL) return items;
  return [...items.slice(0, k), newItem(items, row === "wall" ? SPACE_WALL : SPACE, width), ...items.slice(k)];
}

/**
 * The items with the room kept just after `id` in its row `delta` wider (narrower when negative, gone at none); a
 * furnished caisson's is not touched. `make`: with none there, room is kept after it (the run's rest, now behind it).
 */
function withRoomAfter(items: KitchenRunItem[], id: string, delta: number, make = false): KitchenRunItem[] {
  const k = items.findIndex((i) => i.id === id);
  const row = rowOf(itemEntry(items[k]!));
  let j = k + 1;
  while (j < items.length && rowOf(itemEntry(items[j]!)) !== row) j++;
  const after = j < items.length && isSpace(items[j]!) && !items[j]!.furnished ? items[j]! : null;
  if (!after) return make && delta > STILL ? [...items.slice(0, k + 1), newItem(items, row === "wall" ? SPACE_WALL : SPACE, Math.round(delta * 10) / 10), ...items.slice(k + 1)] : items;
  const width = Math.round(Math.max(0, after.width + delta) * 10) / 10;
  return width <= STILL ? items.filter((i) => i !== after) : items.map((i) => (i === after ? { ...i, width } : i));
}

/**
 * The run's items with each unit `moved` (item id → mm along the run, towards its end) kept where it now stands, or
 * null. By the room kept free around it first; else by the room the run leaves open (a column at the end of the wall
 * pushed back against its neighbour: the rest goes behind it, where the plinth and the finishing side then stop).
 */
export function itemsMoved(g: RunGeometry, items: KitchenRunItem[], heights: Heights, moved: Record<string, number>): KitchenRunItem[] | null {
  return movedBy(g, items, heights, moved, false) ?? movedBy(g, items, heights, moved, true);
}

function movedBy(g: RunGeometry, items: KitchenRunItem[], heights: Heights, moved: Record<string, number>, open: boolean): KitchenRunItem[] | null {
  const fill = fillRun(g, items, heights);
  const shift = (id: string) => moved[id] ?? 0;
  let next: KitchenRunItem[] | null = items;
  for (const row of ["base", "wall"] as const) {
    let previous = 0;
    const placed = fill.placed.filter((p) => p.row === row);
    for (const pl of placed) {
      const extra = shift(pl.item.id) - previous;
      previous = shift(pl.item.id);
      if (Math.abs(extra) <= STILL) continue;
      // What is left of the open room it was pushed into stays before it, kept (the rest is no longer there).
      const gap = open && extra < 0 ? [...fill.fillers, ...fill.free, ...fill.wallFree].find(([, end]) => Math.abs(end - pl.at) < STILL) : undefined;
      next = next && withRoomBefore(next, pl.item.id, gap ? gap[1] - gap[0] + extra : extra, open && !gap);
    }
    // The room kept after the last of the row gives what it was pushed into (takes back what it left).
    const last = placed.at(-1);
    if (next && last && Math.abs(shift(last.item.id)) > STILL) next = withRoomAfter(next, last.item.id, -shift(last.item.id), open);
  }
  if (!next || next === items) return null;
  // Each unit where it was pushed, and nothing lost on the way.
  const check = fillRun(g, next, heights);
  if (check.missing.length > fill.missing.length) return null;
  for (const pl of fill.placed) {
    const now = check.placed.find((p) => p.item.id === pl.item.id);
    if (!now || Math.abs(now.at - (pl.at + shift(pl.item.id))) > 1) return null;
  }
  return next;
}

/**
 * The units of a run the plan made that stand elsewhere along it in the model (item id → mm towards its end): those
 * moved since `since` only, when given. `units` are the run's, as the plan builds them, in the order it made them.
 */
export function unitsMoved(doc: CadDocument, plan: KitchenFloorPlan, run: KitchenRun, units: KitchenUnit[], since?: CadDocument): Record<string, number> {
  const cabinets = (plan.made?.[run.id] ?? []).map((id) => findFeature(doc, id)).filter((f): f is CabinetFeature => f?.type === "cabinet");
  const moved: Record<string, number> = {};
  if (units.length !== cabinets.length) return moved;
  const place = plan.place ?? { quarter: 0 as const, origin: [0, 0] as [number, number] };
  const [r0, r1] = [runAt(run, 0, 0), runAt(run, 1, 0)];
  const along = turn(place, [r1[0] - r0[0], r1[1] - r0[1], 0]);
  cabinets.forEach((c, i) => {
    const u = units[i]!;
    if (!u.item || Math.abs(c.width - u.width) > 0.05) return;
    if (since) {
      const before = findFeature(since, c.id);
      if (before?.type !== "cabinet" || Math.abs(before.width - c.width) > 0.05 || Math.hypot(before.origin[0] - c.origin[0], before.origin[1] - c.origin[1]) < STILL) return;
    }
    const at = placePoint(place, u.origin);
    const d = (c.origin[0] - at[0]) * along[0] + (c.origin[1] - at[1]) * along[1];
    if (Math.abs(d) > STILL) moved[u.item] = Math.round(d * 10) / 10;
  });
  return moved;
}

/** The island of a kitchen plan a feature is a piece of: its plan's sketch and all the plan made of it, or null. */
export function islandOf(doc: CadDocument, feature: string): { plan: string; made: string[] } | null {
  for (const f of doc.features) if (f.type === "sketch" && f.kitchenPlan?.made?.I?.includes(feature)) return { plan: f.id, made: f.kitchenPlan.made.I };
  return null;
}

/**
 * The island moved in the 3D since `since` — one of its units, or all the same way: it goes there whole. What the plan
 * then keeps (how far off the middle of wall A, the passage before it), or null (not moved, or its units each their
 * way). `units`: the island's, as the plan builds them, in the order it made them; measured from where the plan puts
 * them, so that a plan that already follows is left alone.
 */
export function islandMoved(doc: CadDocument, plan: KitchenFloorPlan, units: KitchenUnit[], since: CadDocument): Pick<KitchenFloorPlan, "islandShift" | "passage"> | null {
  const cabinets = (plan.made?.I ?? []).map((id) => findFeature(doc, id)).filter((f): f is CabinetFeature => f?.type === "cabinet");
  if (!cabinets.length || units.length !== cabinets.length) return null;
  const place = plan.place ?? { quarter: 0 as const, origin: [0, 0] as [number, number] };
  const shifts = cabinets.flatMap((c, i) => {
    const b = findFeature(since, c.id);
    if (b?.type !== "cabinet" || Math.abs(c.width - b.width) > 0.05 || Math.hypot(c.origin[0] - b.origin[0], c.origin[1] - b.origin[1]) < STILL) return [];
    const at = placePoint(place, units[i]!.origin);
    return [[c.origin[0] - at[0], c.origin[1] - at[1]] as [number, number]];
  });
  const d = shifts[0];
  if (!d || Math.hypot(...d) < STILL || shifts.some((x) => Math.hypot(x[0] - d[0], x[1] - d[1]) > STILL)) return null;
  const [x, y] = [turn(place, [1, 0, 0]), turn(place, [0, 1, 0])];
  const round = (v: number) => Math.round(v * 10) / 10;
  return { islandShift: round((plan.islandShift ?? 0) + d[0] * x[0] + d[1] * x[1]), passage: round(plan.passage - (d[0] * y[0] + d[1] * y[1])) };
}
