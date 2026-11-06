/**
 * Le prix en direct : le total TTC du devis, recalculé après chaque changement du modèle aux tarifs enregistrés, dans la
 * barre d'état et partout où une page l'affiche (`data-live-total`, comme le Plan de dressing). Un clic ouvre le devis.
 */
import { euros } from "../document/quote";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { quoteTotal } from "./workshop-documents";

/** Long enough for a series of changes to count as one. */
const WAIT = 400;

let shown = "";

/** Writes the price in everything that shows it; for a panel just drawn. */
export function paintPrice(): void {
  for (const node of document.querySelectorAll("[data-live-total]")) node.textContent = shown;
  const button = document.querySelector<HTMLElement>("[data-live-price]");
  if (button) button.hidden = !shown;
}

export function bindLivePrice(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    const total = quoteTotal(viewport, editor);
    shown = total === null ? "" : `${euros(total)} TTC`;
    paintPrice();
  };
  const set = viewport.setBodies.bind(viewport);
  viewport.setBodies = (bodies) => {
    set(bodies);
    clearTimeout(timer);
    timer = setTimeout(update, WAIT);
  };
  root.querySelector("[data-live-price]")?.addEventListener("click", () => root.querySelector<HTMLElement>('[data-workshop="quote"]')?.click());
}
