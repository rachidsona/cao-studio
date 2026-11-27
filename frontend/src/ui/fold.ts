/**
 * Un titre pliable : un clic l'ouvre, un autre le ferme. Ceux d'un même panneau vont ensemble, un seul ouvert à la fois
 * (`Folds`) — ouvrir l'un ferme les autres — et tous sont fermés au départ. Le titre peut porter une valeur à droite (un
 * prix, un compte), visible même fermé. Le contenu n'est fait que s'il est ouvert. Chacun est une carte, détachée par
 * son ombre. Une carte ouverte de l'extérieur (« Modifier la sélection ») est amenée dans la vue. Avec « Plan fixe »
 * (`focus`), la carte ouverte reste seule — les autres reviennent quand on la ferme — et son titre reste fixé juste sous
 * le plan quand on fait défiler, ses onglets en haut (Bas, Hauts…) juste sous lui.
 */
import { el } from "./dom";
import { planFixed } from "./fixed-plan";

/** Whether an open card stands alone, its title fixed under the plan: with « Plan fixe » (not in the older browser tests). */
export function foldFocus(): boolean {
  try {
    return planFixed() && localStorage.getItem("cao.fold-focus-off") !== "1";
  } catch {
    return planFixed();
  }
}

export class Folds {
  /** The one open, or none. */
  open: string | null = null;
  /** The one to bring into view once drawn (opened from outside), or none. */
  reveal: string | null = null;

  constructor(private readonly redraw: () => void, private readonly focus?: () => boolean) {}

  toggle(key: string): void {
    this.open = this.open === key ? null : key;
    this.redraw();
  }

  /** A title that opens and closes `content`, made only when open. */
  fold(key: string, title: string, content: () => (Node | null)[], aside?: Node | string | null): HTMLElement {
    const open = this.open === key;
    // One open with the plan fixed: the others wait, hidden, until it is closed.
    const alone = !!this.focus?.() && this.open !== null;
    if (alone && !open) return el("span", { hidden: true, "data-fold-hidden": key });
    const head = el(
      "button",
      { type: "button", "aria-expanded": String(open), "data-fold": key, class: `flex min-h-9 w-full items-center gap-1.5 px-2 py-1.5 text-left font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5 ${alone ? "sticky top-[var(--fixed-plan-h,0px)] z-[5] rounded-t-lg bg-white shadow-sm dark:bg-gray-900" : ""}` },
      el("span", { class: `inline-block w-3 shrink-0 text-3xs transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▶"),
      el("span", { class: "min-w-0 flex-1" }, title),
      aside ?? null,
    );
    head.addEventListener("click", () => this.toggle(key));
    const body = open ? el("div", { class: "space-y-1.5 border-t border-gray-200 p-2 dark:border-white/10" }, ...content()) : null;
    const section = el("section", { class: `my-2 ${alone ? "" : "overflow-hidden"} rounded-lg border border-gray-200 bg-white shadow-md shadow-gray-900/10 dark:border-white/10 dark:bg-white/5 dark:shadow-black/40`, "data-fold-section": key }, head, body);
    // Its tabs at the top (Bas, Hauts…): fixed under its title too, as tall as it is once drawn.
    const tabs = alone ? body?.querySelector<HTMLElement>("[role=tablist]") : null;
    if (tabs) {
      tabs.classList.add("sticky", "top-[calc(var(--fixed-plan-h,0px)+var(--fold-head-h,2.25rem))]", "z-[5]", "bg-white", "dark:bg-gray-900");
      tabs.setAttribute("data-fold-tabs", "");
      requestAnimationFrame(() => head.offsetHeight && section.style.setProperty("--fold-head-h", `${head.offsetHeight}px`));
    }
    // Opened from outside: brought into view once it is in the panel, once.
    if (this.reveal === key) {
      this.reveal = null;
      queueMicrotask(() => section.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    return section;
  }
}
