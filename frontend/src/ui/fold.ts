/**
 * Un titre pliable : un clic l'ouvre, un autre le ferme. Ceux d'un même panneau vont ensemble, un seul ouvert à la fois
 * (`Folds`) — ouvrir l'un ferme les autres — et tous sont fermés au départ. Le titre peut porter une valeur à droite (un
 * prix, un compte), visible même fermé. Le contenu n'est fait que s'il est ouvert. Chacun est une carte, détachée par
 * son ombre.
 */
import { el } from "./dom";

export class Folds {
  /** The one open, or none. */
  open: string | null = null;

  constructor(private readonly redraw: () => void) {}

  toggle(key: string): void {
    this.open = this.open === key ? null : key;
    this.redraw();
  }

  /** A title that opens and closes `content`, made only when open. */
  fold(key: string, title: string, content: () => (Node | null)[], aside?: Node | string | null): HTMLElement {
    const open = this.open === key;
    const head = el(
      "button",
      { type: "button", "aria-expanded": String(open), "data-fold": key, class: "flex min-h-9 w-full items-center gap-1.5 px-2 py-1.5 text-left font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5" },
      el("span", { class: `inline-block w-3 shrink-0 text-3xs transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▶"),
      el("span", { class: "min-w-0 flex-1" }, title),
      aside ?? null,
    );
    head.addEventListener("click", () => this.toggle(key));
    return el("section", { class: "my-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md shadow-gray-900/10 dark:border-white/10 dark:bg-white/5 dark:shadow-black/40", "data-fold-section": key }, head, open ? el("div", { class: "space-y-1.5 border-t border-gray-200 p-2 dark:border-white/10" }, ...content()) : null);
  }
}
