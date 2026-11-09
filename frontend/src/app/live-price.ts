/**
 * Le prix en direct : le total TTC du devis, recalculé après chaque changement du modèle aux tarifs enregistrés, dans la
 * barre d'état et partout où une page l'affiche (`data-live-total`, comme le Plan de dressing). Un clic ouvre le devis.
 * Le montant va aussi au serveur, quand il change : le tableau de bord de l'accueil et la fiche du projet le montrent.
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

/** A button that opens the quote, as a click on the price in the status bar does. */
export function quoteButton(): HTMLElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "h-7 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
  b.textContent = "Ouvrir le devis";
  b.addEventListener("click", () => document.querySelector<HTMLElement>("[data-live-price]")?.click());
  return b;
}

/** The quote's total kept by the server, for the dashboard (POST …/price/), only when it changed. */
function sendPrice(apiUrl: string, total: number | null): void {
  const price = total === null ? null : Math.round(total * 100) / 100;
  if (price === lastSent) return;
  lastSent = price;
  const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
  void fetch(`${apiUrl}price/`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": decodeURIComponent(csrf) }, body: JSON.stringify({ price }) }).catch(() => (lastSent = undefined));
}
let lastSent: number | null | undefined;

export function bindLivePrice(root: HTMLElement, viewport: Viewport, editor: Editor, apiUrl?: string): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    const total = quoteTotal(viewport, editor);
    shown = total === null ? "" : `${euros(total)} TTC`;
    paintPrice();
    if (apiUrl) sendPrice(apiUrl, total);
  };
  const set = viewport.setBodies.bind(viewport);
  viewport.setBodies = (bodies) => {
    set(bodies);
    clearTimeout(timer);
    timer = setTimeout(update, WAIT);
  };
  root.querySelector("[data-live-price]")?.addEventListener("click", () => root.querySelector<HTMLElement>('[data-workshop="quote"]')?.click());
}
