/**
 * Les fileurs que le plan met dans le reste d'un linéaire (jusqu'à 15 cm) devenus des éléments du linéaire, chacun à sa
 * place — après le meuble bas qu'il suit, ou avant celui qu'il précède —, tous à la fois pour que le reste partagé ne
 * bouge rien : un fileur posé (choisi sur la bande, kitchen-run-fillers.ts) ou un « Espace libre » (supprimé dans la
 * 3D, document/kitchen-delete-sync.ts). Pur.
 */
import type { KitchenRunItem } from "../document/types";
import { FILLER, newItem, type RunFill } from "./kitchen-run-items";

/** The items with each filler of the rest (`fill.fillers`, by its index) made the item `model(k)` gives; the new ids by index. */
export function gapsAsItems(items: readonly KitchenRunItem[], fill: RunFill, model: (k: number) => string = () => FILLER): { items: KitchenRunItem[]; ids: string[] } {
  const base = fill.placed.filter((pl) => pl.row === "base");
  let next: KitchenRunItem[] = [...items];
  const ids: string[] = [];
  fill.fillers.forEach(([a, b], k) => {
    const item = newItem(next, model(k), Math.round((b - a) * 10) / 10);
    const before = base.filter((pl) => pl.at + pl.item.width <= a + 1).sort((x, y) => y.at - x.at)[0];
    const after = base.filter((pl) => pl.at >= b - 1).sort((x, y) => x.at - y.at)[0];
    const index = (of: string) => next.findIndex((i) => i.id === of);
    const at = before ? index(before.item.id) + 1 : after ? index(after.item.id) : next.length;
    next = [...next.slice(0, at), item, ...next.slice(at)];
    ids.push(item.id);
  });
  return { items: next, ids };
}
