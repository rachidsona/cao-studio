/**
 * Un titre pliable : un clic l'ouvre, un autre le ferme. Ceux d'un même panneau vont ensemble, un seul ouvert à la fois
 * (`Folds`) — ouvrir l'un ferme les autres — et tous sont fermés au départ. Le titre peut porter une valeur à droite (un
 * prix, un compte), visible même fermé. Le contenu n'est fait que s'il est ouvert.
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
      { type: "button", "aria-expanded": String(open), "data-fold": key, class: "flex min-h-8 w-full items-center gap-1.5 px-1.5 py-1 text-left font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800" },
      el("span", { class: `inline-block w-3 shrink-0 text-3xs transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▶"),
      el("span", { class: "min-w-0 flex-1" }, title),
      aside ?? null,
    );
    head.addEventListener("click", () => this.toggle(key));
    return el("section", { class: "border border-gray-200 dark:border-gray-700", "data-fold-section": key }, head, open ? el("div", { class: "space-y-1.5 border-t border-gray-200 p-1.5 dark:border-gray-700" }, ...content()) : null);
  }
}
