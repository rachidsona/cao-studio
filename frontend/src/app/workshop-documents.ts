/**
 * Documents de fabrication de l'Atelier : le devis chiffré à partir de la liste de débit, avec des tarifs réglables
 * (retenus par le navigateur), imprimable et exportable en CSV ; la commande numérique et les étiquettes sont dans
 * workshop-cnc.ts.
 */
import { cutList } from "../document/cut-list";
import { DEFAULT_RATES, euros, makeQuote, quoteCsv, type Quote, type QuoteRates } from "../document/quote";
import type { GeometryClient } from "../geometry/client";
import { modelHardware } from "../document/hardware";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { partsOf } from "./workshop";
import { bindCnc } from "./workshop-cnc";
import { printPartSheets } from "./workshop-sheets";
import { showCheck } from "./fabrication-check";
import { downloadText, escapeHtml, openModal, printHtml } from "./workshop-ui";

const RATES_KEY = "cao.quote-rates";
const INPUT = "h-8 w-24 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";

function loadRates(): QuoteRates {
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null") as Partial<QuoteRates> | null;
    return saved ? { ...DEFAULT_RATES, ...saved, boards: { ...DEFAULT_RATES.boards, ...saved.boards }, hardware: { ...DEFAULT_RATES.hardware, ...saved.hardware } } : structuredClone(DEFAULT_RATES);
  } catch {
    return structuredClone(DEFAULT_RATES);
  }
}

function saveRates(rates: QuoteRates): void {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(rates));
  } catch {
    // Not remembered: only this window.
  }
}

const quoteHtml = (quote: Quote) =>
  `<table><thead><tr><th>Désignation</th><th>Quantité</th><th>Prix unitaire HT</th><th>Total HT</th></tr></thead><tbody>${quote.lines
    .map((l) => `<tr><td>${escapeHtml(l.label)}</td><td>${l.quantity.toLocaleString("fr-FR")} ${l.unit === "pièce" && l.quantity > 1 ? "pièces" : l.unit}</td><td>${euros(l.unitPrice)}</td><td>${euros(l.total)}</td></tr>`)
    .join("")}</tbody></table><table><tbody>${[
    ["Coût", quote.cost],
    ["Marge", quote.margin],
    ["Total HT", quote.net],
    ["TVA", quote.vat],
    ["Total TTC", quote.gross],
  ]
    .map(([label, value]) => `<tr><th>${label}</th><td>${euros(value as number)}</td></tr>`)
    .join("")}</tbody></table>`;

function showQuote(viewport: Viewport, editor: Editor): void {
  const { totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  const hardware = modelHardware(editor.doc);
  if (!totals.length) return editor.notify("Aucune pièce à chiffrer.", "info");
  const rates = loadRates();
  const table = el("div", {
    class: "text-xs [&_table]:mb-3 [&_table]:w-full [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left dark:[&_td]:border-gray-700 dark:[&_th]:border-gray-600 [&_td:not(:first-child)]:text-right",
  });
  const field = (label: string, value: number, unit: string, set: (v: number) => void) => {
    const input = el("input", { type: "number", step: "any", min: "0", class: INPUT, value: String(value), "aria-label": label });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < 0) return;
      set(v);
      saveRates(rates);
      refresh();
    });
    return el("label", { class: "flex items-center justify-between gap-2" }, el("span", {}, label), el("span", { class: "flex items-center gap-1" }, input, el("span", { class: "w-10 text-gray-500" }, unit)));
  };
  const boards = totals.map((t) => field(`${t.material}`, rates.boards[t.material] ?? rates.boards.default ?? 0, "€/m²", (v) => (rates.boards[t.material] = v)));
  const settings = el(
    "div",
    { class: "grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2" },
    ...boards,
    ...hardware.map((h) => field(h.name, rates.hardware[h.name] ?? 0, "€", (v) => (rates.hardware[h.name] = v))),
    field("Chutes", rates.waste, "%", (v) => (rates.waste = v)),
    field("Chant collé", rates.band, "€/m", (v) => (rates.band = v)),
    field("Découpe par pièce", rates.cutPerPart, "€", (v) => (rates.cutPerPart = v)),
    field("Montage par pièce", rates.hoursPerPart, "h", (v) => (rates.hoursPerPart = v)),
    field("Taux horaire", rates.hourly, "€/h", (v) => (rates.hourly = v)),
    field("Marge", rates.margin, "%", (v) => (rates.margin = v)),
    field("TVA", rates.vat, "%", (v) => (rates.vat = v)),
  );
  let quote = makeQuote(totals, rates, hardware, editor.unit);
  const refresh = () => {
    quote = makeQuote(totals, rates, hardware, editor.unit);
    table.innerHTML = quoteHtml(quote);
  };
  refresh();
  const content = el(
    "div",
    { class: "space-y-4" },
    el("details", { class: " border border-gray-200 p-3 dark:border-gray-700" }, el("summary", { class: "cursor-pointer text-sm font-medium" }, "Tarifs (indicatifs, modifiables)"), el("div", { class: "pt-3" }, settings)),
    table,
  );
  const close = openModal("Devis", content, [
    { label: "Exporter en CSV", run: () => downloadText("devis.csv", `﻿${quoteCsv(quote)}`, "text/csv") },
    { label: "Imprimer / PDF", run: () => printHtml("Devis", `<h1>Devis — ${escapeHtml(document.title.split("·")[0]?.trim() ?? "")}</h1>${quoteHtml(quote)}<p>Prix indicatifs, établis à partir de la liste de débit.</p>`) },
    { label: "Fermer", run: () => close() },
  ]);
}

/** The total (TTC) of the quote of the displayed parts at the saved rates, or null when there is nothing to price. */
export function quoteTotal(viewport: Viewport, editor: Editor): number | null {
  const { totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  return totals.length ? makeQuote(totals, loadRates(), modelHardware(editor.doc), editor.unit).gross : null;
}

export function bindWorkshopDocuments(root: HTMLElement, viewport: Viewport, editor: Editor, geometry: GeometryClient): void {
  bindCnc(root, viewport, editor, geometry);
  root.querySelector('[data-workshop="check"]')?.addEventListener("click", () => void showCheck(viewport, editor, geometry));
  root.querySelector('[data-workshop="sheets"]')?.addEventListener("click", () => void printPartSheets(viewport, editor, geometry));
  root.querySelector('[data-workshop="quote"]')?.addEventListener("click", () => showQuote(viewport, editor));
}
