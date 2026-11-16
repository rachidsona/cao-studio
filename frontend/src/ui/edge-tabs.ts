/**
 * Les onglets posés en bas du bord gauche de la vue, par-dessus : ceux du Navigateur replié (ui/navigator-fold.ts) et
 * des colonnes d'outils repliées (ui/tool-columns.ts). Ils ne prennent aucune place à côté de la vue ; un clic rouvre ce
 * qui est replié.
 */
import { el } from "./dom";

/** The pile of tabs over the view's left edge (made the first time). */
export function edgeTabs(root: HTMLElement): HTMLElement | null {
  const existing = root.querySelector<HTMLElement>("[data-edge-tabs]");
  if (existing) return existing;
  const main = root.querySelector<HTMLElement>("#main");
  if (!main) return null;
  const pile = el("div", { class: "pointer-events-none absolute bottom-4 left-0 z-30 flex flex-col gap-1", "data-edge-tabs": "" });
  main.append(pile);
  return pile;
}

/** The look of an edge tab: a small drawer pull against the view's left edge. */
export const EDGE_TAB_CLASS =
  "pointer-events-auto flex w-5 flex-col items-center justify-center gap-0.5 border border-l-0 border-gray-200 bg-white/95 py-1 text-3xs leading-none text-gray-500 shadow-md hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100";
