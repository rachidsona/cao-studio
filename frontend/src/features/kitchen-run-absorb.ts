/**
 * Chaque meuble d'un linéaire garde sa place quand un autre change : un meuble élargi, rétréci, ajouté ou ôté avant
 * une place gardée libre (« Espace libre ») prend sa largeur sur elle — elle rétrécit ou grandit d'autant, et ce qui
 * est après elle ne bouge pas. Et rien ne sort du linéaire : un changement qui en ferait sortir un meuble, ou un
 * caisson en Répartition (une place gardée qui en tient un : `furnished`), est refusé. Pur.
 */
import type { KitchenRunItem } from "../document/types";
import { isSpace, itemEntry, rowOf, type RunFill } from "./kitchen-run-items";

/** Room kept free that nothing stands in. */
const free = (i: KitchenRunItem) => isSpace(i) && !i.furnished;
/** A unit of the run: anything but room kept free — a caisson furnished in a kept room is one. */
export const isUnit = (i: KitchenRunItem): boolean => !isSpace(i) || !!i.furnished;

/**
 * `after` with the room kept free taking what changed before it, so that what stands after it stays where it was in
 * `before`. `after` itself when the change is one of places — a room kept free made, taken away or resized, units put
 * in another order (a unit slid, moved, deleted: where things go is then what was asked).
 */
export function absorbed(before: readonly KitchenRunItem[], after: readonly KitchenRunItem[], fill: (items: readonly KitchenRunItem[]) => RunFill): KitchenRunItem[] {
  const rooms = (list: readonly KitchenRunItem[]) => list.filter(free).map((i) => `${i.id}:${i.width}`).join("|");
  const order = (list: readonly KitchenRunItem[], other: readonly KitchenRunItem[]) => list.filter((i) => other.some((o) => o.id === i.id)).map((i) => i.id).join("|");
  if (!rooms(after) || rooms(before) !== rooms(after) || order(before, after) !== order(after, before)) return [...after];
  const ends = new Map(fill(before).spaces.map((s) => [s.item.id, s.at + s.item.width]));
  /** What stands before `id` in its row, summed: where it starts when its row is packed (a room pushed out of the run has no place to read). */
  const packed = (list: readonly KitchenRunItem[], id: string) => {
    const k = list.findIndex((i) => i.id === id);
    const row = rowOf(itemEntry(list[k]!));
    return list.slice(0, k).filter((i) => rowOf(itemEntry(i)) === row).reduce((sum, i) => sum + i.width, 0);
  };
  let items = [...after];
  for (const room of after.filter(free)) {
    const end = ends.get(room.id);
    if (end === undefined) continue;
    const now = fill(items).spaces.find((s) => s.item.id === room.id);
    const delta = now ? now.at + now.item.width - end : packed(items, room.id) - packed(before, room.id);
    if (Math.abs(delta) < 0.5) continue;
    const width = Math.round((room.width - delta) * 10) / 10;
    items = width >= 1 ? items.map((i) => (i.id === room.id ? { ...i, width } : i)) : items.filter((i) => i.id !== room.id);
  }
  return items;
}

/** The units (a caisson in Répartition is one) that `after` puts out of the run though `before` had them on it. */
export function pushedOut(before: RunFill, after: RunFill): KitchenRunItem[] {
  const was = new Set(before.missing.map((i) => i.id));
  const stood = new Set([...before.placed, ...before.spaces].map((p) => p.item.id));
  return after.missing.filter((i) => isUnit(i) && !was.has(i.id) && stood.has(i.id));
}
