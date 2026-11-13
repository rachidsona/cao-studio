/**
 * Le haut d'un panneau d'outil : son titre et une croix qui le ferme ; et son bas : « Terminer » et « OK ». Chaque
 * réglage est enregistré dès qu'il est valable (une étape d'historique, annulée par Ctrl + Z), et ce qui est fait se
 * reprend ensuite par son étape dans l'Historique. « OK » (ou Entrée) garde l'opération sans fermer l'outil : il reste
 * là pour la suivante ; seul « Terminer » (la croix, ou Échap) le ferme, en gardant tout ce qui est fait.
 */
import { el } from "./dom";

export const CLOSE_TITLE = "Fermer (ce qui est fait reste enregistré ; Ctrl + Z l'annule)";

/** The title of a tool panel, with the cross that closes it. */
export function panelHeader(title: string, close: () => void, level: "h2" | "h3" = "h2"): HTMLElement {
  const cross = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 text-sm leading-none hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: CLOSE_TITLE, "aria-label": "Fermer", "data-panel-close": "" }, "✕");
  cross.addEventListener("click", close);
  return el("div", { class: "flex items-start justify-between gap-2" }, el(level, { class: "panel-title min-w-0 flex-1" }, title), cross);
}

/**
 * The bottom of a tool panel: « Terminer » closes the tool, « OK » keeps the operation and leaves the tool there for
 * the next one (`ok` null: each thing done is kept at once, there is nothing to say OK to); `blocked`: nothing whole
 * to keep yet.
 */
export function panelFooter(done: () => void, ok: (() => void) | null, blocked = false): HTMLElement {
  const end = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Fermer l'outil (ce qui est fait reste enregistré ; Échap)", "data-panel-done": "" }, "Terminer");
  end.addEventListener("click", done);
  const keep = ok ? el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: blocked, title: "Garder cette opération ; l'outil reste ouvert pour la suivante (Entrée)", "data-panel-ok": "" }, "OK") : null;
  keep?.addEventListener("click", () => ok?.());
  return el("div", { class: "flex gap-1.5 pt-1" }, end, keep);
}
