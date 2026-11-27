/**
 * La profondeur tapée sur une carte d'« Ajouter des meubles » (éditeur de linéaire, kitchen-run-editor.ts), au choix :
 * pour **tout ce modèle** dans la cuisine — ses meubles posés et ceux qu'on ajoute ensuite, gardé dans le plan
 * (`KitchenFloorPlan.modelDepths`) ; un meuble réglé à part dans « Meuble choisi » garde le sien —, ou pour **le prochain
 * ajouté** de ce modèle seulement.
 */
import type { CatalogEntry } from "../../document/kitchen-catalog";
import type { KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { itemSize, modelOf, newItem, sizeLimits } from "../../features/kitchen-run-items";
import { el } from "../../ui/dom";

export type DepthFor = "model" | "next";
/** Kept for the session: what a depth typed on a card is for. */
let depthFor: DepthFor = "model";
/** By model, the depth typed for the next unit added of it alone. */
const next = new Map<string, number>();

/** What a card's depth field shows and sets (kitchen-catalog-view.ts `modelRow`). */
export interface CardDepth {
  value(e: CatalogEntry): number;
  limits(e: CatalogEntry): [number, number];
  set(e: CatalogEntry, mm: number): void;
}

/** The depth of each card: the next one's when typed, else the model's in this kitchen; set for the model or the next. */
export function cardDepth(plan: KitchenFloorPlan, setModel: (model: string, mm: number) => void, redraw: () => void): CardDepth {
  return {
    value: (e) => next.get(modelOf(e)) ?? itemSize(plan, newItem([], modelOf(e), e.width, e.custom ? e : undefined), e).depth,
    limits: (e) => sizeLimits(plan, e).depth,
    set: (e, mm) => (depthFor === "next" ? (next.set(modelOf(e), mm), redraw()) : (next.delete(modelOf(e)), setModel(modelOf(e), mm))),
  };
}

/** The unit added: the depth typed for the next one of its model, then forgotten. */
export function withNextDepth(item: KitchenRunItem): KitchenRunItem {
  const depth = next.get(item.model);
  if (depth === undefined) return item;
  next.delete(item.model);
  return { ...item, depth };
}

/** « Profondeur tapée pour » : all of the model, or the next added. */
export function depthChoice(redraw: () => void): HTMLElement {
  const choice = el("select", { class: "h-7 min-w-0 flex-1 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Profondeur tapée pour", "data-depth-for": "" },
    el("option", { value: "model", selected: depthFor === "model" }, "Tout ce modèle"), el("option", { value: "next", selected: depthFor === "next" }, "Le prochain ajouté"));
  choice.addEventListener("change", () => ((depthFor = choice.value === "next" ? "next" : "model"), redraw()));
  return el("label", { class: "flex items-center gap-2 py-1.5 text-xs text-gray-600 dark:text-gray-300" }, "Profondeur tapée pour", choice);
}

/** « Caissons en Répartition », also over the cards: the plan's option (`asCaissons`), its units made caissons of the dressing. */
export function caissonsChoice(on: boolean, set: (on: boolean) => void): HTMLElement {
  const box = el("input", { type: "checkbox", checked: on, "data-run-as-caissons": "" });
  box.addEventListener("change", () => set(box.checked));
  return el("label", { class: "flex items-center gap-2 py-1.5 text-xs text-gray-600 dark:text-gray-300" }, box, "Caissons en Répartition");
}
