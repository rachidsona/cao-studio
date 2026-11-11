/**
 * Le haut d'un panneau d'outil : son titre et une croix qui le ferme. Les outils n'ont plus de boutons « Annuler » ni
 * « OK » : chaque réglage est enregistré dès qu'il est valable (une étape d'historique, annulée par Ctrl + Z), et ce
 * qui est fait se reprend ensuite par son étape dans l'Historique. La croix (ou Échap) ferme le panneau en gardant tout.
 */
import { el } from "./dom";

export const CLOSE_TITLE = "Fermer (ce qui est fait reste enregistré ; Ctrl + Z l'annule)";

/** The title of a tool panel, with the cross that closes it. */
export function panelHeader(title: string, close: () => void, level: "h2" | "h3" = "h2"): HTMLElement {
  const cross = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 text-sm leading-none hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: CLOSE_TITLE, "aria-label": "Fermer", "data-panel-close": "" }, "✕");
  cross.addEventListener("click", close);
  return el("div", { class: "flex items-start justify-between gap-2" }, el(level, { class: "panel-title min-w-0 flex-1" }, title), cross);
}
