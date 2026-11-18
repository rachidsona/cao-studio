/**
 * Un meuble glissé à la souris sur la bande de son linéaire, dans la place vide à côté de lui (le reste de sa rangée,
 * hachuré) : il s'y pose à l'endroit lâché et les autres meubles ne bougent pas. Le plan le dit comme pour un meuble
 * poussé dans la 3D (kitchen-moves.ts) : le reste du linéaire va « à droite », et des « Espaces libres » gardent chaque
 * meuble à sa place ; les fileurs que le plan mettait dans le reste deviennent des fileurs posés, à leur place
 * (features/kitchen-run-gaps.ts). Il s'arrête contre son voisin ou au bout de sa place libre, et s'y colle à
 * l'approche. Refusé, avec la raison, quand le linéaire ne peut pas le dire. Pur.
 */
import { itemsMoved } from "./kitchen-moves";
import { runGeometry, type KitchenRun, type RestSide } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "./types";
import { gapsAsItems } from "../features/kitchen-run-gaps";
import { fillRun, openRoom, type RunFill } from "../features/kitchen-run-items";
import type { RunInfo } from "../features/room-runs";

type Heights = Parameters<typeof fillRun>[2];
/** Nearer than this to the end of its free room (mm), it goes right to it. */
const SNAP = 15;

/** How far the unit `id` may slide in the free room beside it, towards the start (negative) and the end of its run. */
export function slideRoom(fill: RunFill, id: string): [number, number] {
  const pl = fill.placed.find((p) => p.item.id === id);
  if (!pl) return [0, 0];
  // Not the room a furnished caisson holds: it stands there.
  const gaps = openRoom(fill, pl.row);
  const [a, b] = [pl.at, pl.at + pl.item.width];
  // The room kept free by an « Espace libre » is free too: it gives way.
  const before = gaps.find(([, g1]) => Math.abs(g1 - a) < 1);
  const after = gaps.find(([g0]) => Math.abs(g0 - b) < 1);
  return [before ? before[0] - before[1] : 0, after ? after[1] - after[0] : 0];
}

/**
 * The run's items and where its rest goes with the unit `id` slid by `by` mm along the run (towards its end), within
 * the free room beside it; or why it cannot be.
 */
export function itemSlid(plan: KitchenFloorPlan, run: KitchenRun, info: RunInfo | undefined, items: KitchenRunItem[], heights: Heights, id: string, by: number): { items: KitchenRunItem[]; rest: RestSide; by: number } | string {
  const g = runGeometry(plan, run, info);
  if (g.rest === "walls") return "Avec le reste « contre les murs », un meuble ne se glisse pas : choisissez d'abord où va le reste (Place libre).";
  const fill = fillRun(g, items, heights);
  const [lo, hi] = slideRoom(fill, id);
  if (hi - lo < 1) return "Pas de place vide à côté de ce meuble : glissez-le au-delà d'un voisin pour changer leur ordre.";
  let d = Math.max(lo, Math.min(hi, Math.round(by)));
  if (d - lo < SNAP) d = lo;
  else if (hi - d < SNAP) d = hi;
  if (Math.abs(d) < 1) return { items, rest: g.rest, by: 0 };
  // The fillers of the rest, pinned where they are; then everything from the left, held in place by room kept free.
  const pinned = gapsAsItems(items, fill);
  const target = new Map<string, number>([...fill.placed.map((p): [string, number] => [p.item.id, p.at + (p.item.id === id ? d : 0)]), ...pinned.ids.map((fid, k): [string, number] => [fid, fill.fillers[k]![0]])]);
  const end = runGeometry({ ...plan, rest: { ...plan.rest, [run.id]: "end" } }, run, info);
  const packed = fillRun(end, pinned.items, heights);
  const shifts = Object.fromEntries(packed.placed.filter((p) => target.has(p.item.id)).map((p) => [p.item.id, Math.round((target.get(p.item.id)! - p.at) * 10) / 10]));
  const moved = Object.values(shifts).some((v) => Math.abs(v) > 0.5) ? itemsMoved(end, pinned.items, heights, shifts) : pinned.items;
  if (!moved) return "Ce linéaire ne peut pas garder le meuble à cet endroit (une porte, une fenêtre ou une colonne coupe sa rangée).";
  return { items: moved, rest: "end", by: d };
}
