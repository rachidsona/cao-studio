/**
 * Le haut d'un panneau d'outil : son titre et une croix qui le ferme ; et son bas : « Terminer » et « OK ». Chaque
 * réglage est enregistré dès qu'il est valable (une étape d'historique, annulée par Ctrl + Z), et ce qui est fait se
 * reprend ensuite par son étape dans l'Historique. « OK » (ou Entrée) garde l'opération sans fermer l'outil : il reste
 * là pour la suivante ; seul « Terminer » (la croix, ou Échap) le ferme, en gardant tout ce qui est fait.
 */
import { el } from "./dom";
import { alone } from "./fields";
export { alone };

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

/** Where a card stops: the panel's foot, its main button (« Créer le plan »), a message (what it makes, what is wrong), what is marked to stay out. */
const loose = (e: Element) => e.hasAttribute("data-panel-loose") || e.matches("button.btn-accent") || !!e.querySelector("[data-panel-done], [data-panel-ok]") || /\bbg-(sky|amber|red)-50\b/.test(e.className);

/** The cards folded, by title, kept in this browser (the same title folded in every tool). */
const FOLDED = "cao.tool-cards.folded";
export const foldedCards = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};
export const rememberCard = (title: string, open: boolean) => {
  const all = foldedCards();
  if (open) all.delete(title);
  else all.add(title);
  try {
    localStorage.setItem(FOLDED, JSON.stringify([...all]));
  } catch {
    // Only this visit.
  }
};

/**
 * A zone of a plan (a wall of a kitchen…) as a card, as the dressing's: its name and length in bold, its buttons, and
 * what it holds folded by its title (its buttons do not fold it), as kept; one open at a time.
 */
export function zoneCard(key: string, label: string, length: string, buttons: (HTMLElement | null)[], inside: HTMLElement | null, mark: Record<string, string>): HTMLElement {
  const head = el("summary", { class: "flex cursor-pointer list-none items-center justify-between gap-1.5 [&::-webkit-details-marker]:hidden" }, el("span", { class: "inline-block w-3 shrink-0 text-3xs text-gray-400 transition-transform group-open/zone:rotate-90", "aria-hidden": "true" }, inside ? "▶" : ""), el("span", { class: "min-w-0 flex-1 truncate" }, el("span", { class: "font-semibold" }, label), el("span", { class: "text-2xs text-gray-500 dark:text-gray-400" }, ` · ${length}`)), ...buttons);
  head.addEventListener("click", (event) => (event.target as Element).closest("button") && event.preventDefault());
  const card = el("details", { class: "group/zone space-y-1.5", "data-zone-card": "", ...(foldedCards().has(key) ? {} : { open: "" }) }, head, inside);
  card.addEventListener("toggle", () => rememberCard(key, card.open));
  alone(card, "li > details[data-zone-card]", 2);
  return el("li", { class: "border border-gray-200 bg-white p-2 shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-[0_4px_14px_rgba(0,0,0,0.6)]", ...mark }, card);
}

/**
 * The settings of a tool panel in cards, as the Properties': each heading (an `h3.panel-title` of the panel) and what
 * follows it, up to the next heading, the foot or a message. A click on its title folds or unfolds it, as kept.
 */
export function asCards(panel: HTMLElement): void {
  const shut = foldedCards();
  let body: HTMLElement | null = null;
  for (const child of [...panel.children]) {
    if (child.matches("h3.panel-title")) {
      const title = child.textContent ?? "";
      child.classList.remove("pt-1");
      const card = el(
        "details",
        { class: "group/card border border-gray-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-[0_4px_14px_rgba(0,0,0,0.6)]", "data-panel-card": title, ...(shut.has(title) ? {} : { open: "" }) },
        el(
          "summary",
          { class: "flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 py-2 select-none hover:bg-gray-50 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden", title: "Plier ou déplier" },
          el("span", { class: "inline-block w-3 text-3xs text-gray-400 transition-transform group-open/card:rotate-90", "aria-hidden": "true" }, "▶"),
        ),
      );
      child.before(card);
      card.firstElementChild!.append(child);
      body = el("div", { class: "space-y-2 px-2.5 pb-2.5" });
      card.append(body);
      card.addEventListener("toggle", () => rememberCard(title, card.open));
      alone(card, "details[data-panel-card]");
    } else if (body && !loose(child)) body.append(child);
    else body = null;
  }
}
