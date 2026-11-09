/**
 * Plusieurs meubles d'un linéaire choisis ensemble : une cote commune (largeur, hauteur ou profondeur), la même largeur
 * pour tous (leur largeur totale partagée), la place libre d'une rangée partagée entre eux, un autre modèle pour tous,
 * leur double posé après eux. Chacun reste dans ses limites ; un appareil garde ses largeurs. Pur.
 */
import type { KitchenFloorPlan, KitchenRunItem } from "../document/types";
import { applianceOf, insertItem, isFiller, itemEntry, newItem, rowOf, sizeLimits } from "./kitchen-run-items";

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/** Whether this item's width can be set to any value (an appliance comes in its widths). */
const free = (item: KitchenRunItem) => !applianceOf(item);

/** The chosen items, in their order on the run. */
const chosenOf = (items: readonly KitchenRunItem[], ids: readonly string[]) => items.filter((i) => ids.includes(i.id));

/**
 * One size for all the chosen: each takes it within its limits; those that cannot (an appliance's width, the height
 * of a base unit set by the worktop) are named in `kept`.
 */
export function withCommonSize(p: KitchenFloorPlan, items: readonly KitchenRunItem[], ids: readonly string[], key: "width" | "height" | "depth", mm: number): { items: KitchenRunItem[]; kept: string[] } {
  const kept: string[] = [];
  const next = items.map((item) => {
    if (!ids.includes(item.id)) return item;
    const limits = sizeLimits(p, itemEntry(item));
    const range = key === "width" ? limits.width : key === "height" ? limits.height : isFiller(item) ? null : limits.depth;
    if (!range || (key === "width" && !free(item))) {
      kept.push(item.id);
      return item;
    }
    return { ...item, [key]: Math.round(clamp(mm, range) * 10) / 10 };
  });
  return { items: next, kept };
}

/** The chosen units of each row as wide as one another: their width together shared out (to the millimetre). */
export function withEqualWidths(p: KitchenFloorPlan, items: readonly KitchenRunItem[], ids: readonly string[]): KitchenRunItem[] {
  let next = [...items];
  for (const row of ["base", "wall"] as const) {
    const same = chosenOf(next, ids).filter((i) => free(i) && !isFiller(i) && rowOf(itemEntry(i)) === row);
    if (same.length < 2) continue;
    const total = same.reduce((sum, i) => sum + i.width, 0);
    const each = Math.floor(total / same.length);
    same.forEach((item, k) => {
      // The last one takes the millimetres left over.
      const width = clamp(k === same.length - 1 ? total - each * (same.length - 1) : each, sizeLimits(p, itemEntry(item)).width);
      next = next.map((i) => (i.id === item.id ? { ...i, width } : i));
    });
  }
  return next;
}

/** The room left on a row (`room`, mm) shared out between its chosen units, as far as each can widen. */
export function withRoomShared(p: KitchenFloorPlan, items: readonly KitchenRunItem[], ids: readonly string[], row: "base" | "wall", room: number): { items: KitchenRunItem[]; given: number } {
  const same = chosenOf(items, ids).filter((i) => free(i) && !isFiller(i) && rowOf(itemEntry(i)) === row);
  if (!same.length || room < 1) return { items: [...items], given: 0 };
  const share = Math.floor(room / same.length);
  let given = 0;
  const next = items.map((item) => {
    if (!same.includes(item)) return item;
    const width = clamp(item.width + share, sizeLimits(p, itemEntry(item)).width);
    given += width - item.width;
    return { ...item, width };
  });
  return { items: next, given };
}

/** Another model for all the chosen of its kind (a base, a wall or a tall unit for one of the same row). */
export function withModel(items: readonly KitchenRunItem[], ids: readonly string[], model: string, widths: readonly number[]): KitchenRunItem[] {
  return items.map((item) => {
    if (!ids.includes(item.id) || isFiller(item)) return item;
    const width = widths.includes(item.width) || !widths.length ? item.width : widths.reduce((a, b) => (Math.abs(b - item.width) < Math.abs(a - item.width) ? b : a));
    return { ...item, model, width, own: undefined };
  });
}

/** A copy of each chosen unit, after the last chosen of its row, in the same order; the copies' ids. */
export function withDuplicated(items: readonly KitchenRunItem[], ids: readonly string[]): { items: KitchenRunItem[]; copies: string[] } {
  let next = [...items];
  const copies: string[] = [];
  for (const row of ["base", "wall"] as const) {
    const same = chosenOf(items, ids).filter((i) => rowOf(itemEntry(i)) === row);
    let after = same.at(-1)?.id ?? null;
    for (const item of same) {
      const copy = { ...item, ...newItem(next, item.model, item.width, item.own) };
      next = insertItem(next, copy, after);
      copies.push(copy.id);
      after = copy.id;
    }
  }
  return { items: next, copies };
}
