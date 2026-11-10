/**
 * Documents de fabrication de l'Atelier : le devis chiffré à partir de la liste de débit, avec des tarifs réglables
 * (retenus par le navigateur), imprimable et exportable en CSV ; ses scénarios (une matière par une autre, pour
 * comparer) et ses versions gardées dans le projet (le devis initial, puis les avenants : quote-versions.ts) ; la
 * commande numérique et les étiquettes sont dans workshop-cnc.ts.
 */
import { cutList } from "../../document/cut-list";
import { barLength } from "../../document/bars";
import { DEFAULT_RATES, euros, makeQuote, quoteCsv, type Quote, type QuoteRates } from "../../document/quote";
import type { CadDocument } from "../../document/types";
import { quoteExtras } from "./quote-versions";
import type { GeometryClient } from "../../geometry/client";
import { modelHardware } from "../../document/hardware";
import { autoHardware, setWorkshopRates, workshopRates } from "../../document/catalog";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "./workshop";
import { bindCnc } from "./workshop-cnc";
import { printPartSheets } from "./workshop-sheets";
import { showCheck } from "./fabrication-check";
import { downloadText, escapeHtml, openModal, printHtml } from "./workshop-ui";
import { quoteHtml } from "./quote-html";

const RATES_KEY = "cao.quote-rates";
const INPUT = "h-8 w-24 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";

/**
 * The quote's rates: the workshop's (the server's, Paramètres de l'atelier → Tarifs du devis) over what this browser
 * keeps (the prices of the boards and of the hardware changed in the quote), over the usual ones.
 */
function loadRates(): QuoteRates {
  let saved: Partial<QuoteRates> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null") as Partial<QuoteRates> | null;
  } catch {
    // The usual ones.
  }
  const base: QuoteRates = saved ? { ...DEFAULT_RATES, ...saved, boards: { ...DEFAULT_RATES.boards, ...saved.boards }, hardware: { ...DEFAULT_RATES.hardware, ...saved.hardware } } : structuredClone(DEFAULT_RATES);
  return { ...base, ...workshopRates() };
}

/** The workshop's rates as the server first has them. */
const FIRST_RATES = { waste: 15, band: 1.5, cutPerPart: 4, hoursPerPart: 0.25, hourly: 45, perHole: 0, margin: 30, vat: 20 };

/**
 * Rates set in this browser before the server kept them: while the server still has its first ones, it takes this
 * browser's (once; then the server's are everyone's).
 */
export function adoptBrowserRates(): void {
  const server = workshopRates();
  if (!Object.keys(server).length || Object.entries(FIRST_RATES).some(([k, v]) => server[k as keyof typeof FIRST_RATES] !== v)) return;
  let saved: Partial<QuoteRates> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null") as Partial<QuoteRates> | null;
  } catch {
    return;
  }
  if (!saved || !Object.keys(FIRST_RATES).some((k) => saved![k as keyof QuoteRates] !== undefined && saved![k as keyof QuoteRates] !== FIRST_RATES[k as keyof typeof FIRST_RATES])) return;
  saveRates({ ...DEFAULT_RATES, ...FIRST_RATES, ...saved } as QuoteRates);
}

let ratesTimer: ReturnType<typeof setTimeout> | undefined;

/** Kept by this browser, and the workshop's rates by the server (for every computer), a moment after the last change. */
function saveRates(rates: QuoteRates): void {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(rates));
  } catch {
    // Not remembered: only this window.
  }
  const shared = { waste: rates.waste, band: rates.band, cutPerPart: rates.cutPerPart, hoursPerPart: rates.hoursPerPart, hourly: rates.hourly, perHole: rates.perHole ?? 0, margin: rates.margin, vat: rates.vat };
  setWorkshopRates(shared);
  clearTimeout(ratesTimer);
  ratesTimer = setTimeout(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
    void fetch("/api/catalog/rates/", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": decodeURIComponent(csrf) }, body: JSON.stringify(shared) }).catch(() => undefined);
  }, 800);
}

/** Holes drilled in the model (its machining), priced one by one when the rates say so. */
export function holesOf(doc: CadDocument): number {
  return doc.features.reduce((n, f) => n + (f.type === "machining" && !f.suppressed ? f.ops.filter((op) => op.kind === "hole").length : 0), 0);
}

function showQuote(viewport: Viewport, editor: Editor): void {
  const { totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  // The hardware of the model, then what the workshop's rules add (counted from the furniture).
  const hardware = [...modelHardware(editor.doc), ...autoHardware(editor.doc)];
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
  const boards = totals.map((t) => field(`${t.material}`, rates.boards[t.material] ?? rates.boards.default ?? 0, barLength(t.material) !== null ? "€/m" : "€/m²", (v) => (rates.boards[t.material] = v)));
  const settings = el(
    "div",
    { class: "grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2" },
    ...boards,
    ...hardware.map((h) => field(h.name, rates.hardware[h.name] ?? 0, "€", (v) => (rates.hardware[h.name] = v))),
    field("Chutes", rates.waste, "%", (v) => (rates.waste = v)),
    field("Chant collé", rates.band, "€/m", (v) => (rates.band = v)),
    field("Découpe par pièce", rates.cutPerPart, "€", (v) => (rates.cutPerPart = v)),
    field("Perçage (usinage)", rates.perHole ?? 0, "€", (v) => (rates.perHole = v)),
    field("Montage par pièce", rates.hoursPerPart, "h", (v) => (rates.hoursPerPart = v)),
    field("Taux horaire", rates.hourly, "€/h", (v) => (rates.hourly = v)),
    field("Marge", rates.margin, "%", (v) => (rates.margin = v)),
    field("TVA", rates.vat, "%", (v) => (rates.vat = v)),
    tiersField(),
  );
  function tiersField() {
    const input = el("input", { type: "text", class: `${INPUT} w-40 text-left`, value: (rates.tiers ?? []).map(([a, b]) => `${a}:${b}`).join(", "), placeholder: "3000:5, 6000:8", "aria-label": "Remises par paliers" });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("change", () => {
      rates.tiers = input.value.split(",").map((t) => t.split(":").map(Number) as [number, number]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && b < 100);
      saveRates(rates);
      refresh();
    });
    return el("label", { class: "flex items-center justify-between gap-2" }, el("span", {}, "Remises (dès € HT : %)"), input);
  }
  const holes = holesOf(editor.doc);
  let quote = makeQuote(totals, rates, hardware, editor.unit, holes);
  const extras = el("div", { class: "space-y-3" });
  const refresh = () => {
    quote = makeQuote(totals, rates, hardware, editor.unit, holes);
    table.innerHTML = quoteHtml(quote);
    quoteExtras(extras, viewport, editor, totals, rates, hardware, holes, quote, quoteHtml);
  };
  refresh();
  const content = el(
    "div",
    { class: "space-y-4" },
    el("details", { class: " border border-gray-200 p-3 dark:border-gray-700" }, el("summary", { class: "cursor-pointer text-sm font-medium" }, "Tarifs (indicatifs, modifiables)"), el("div", { class: "pt-3" }, settings)),
    table,
    extras,
  );
  const close = openModal("Devis", content, [
    { label: "Exporter en CSV", run: () => downloadText("devis.csv", `﻿${quoteCsv(quote)}`, "text/csv") },
    { label: "Imprimer / PDF", run: () => printHtml("Devis", `<h1>Devis — ${escapeHtml(document.title.split("·")[0]?.trim() ?? "")}</h1>${quoteHtml(quote)}<p>Prix indicatifs, établis à partir de la liste de débit.</p>`) },
    { label: "Fermer", run: () => close() },
  ]);
}

/** The quote of the displayed parts at the saved rates, as a printable table, or null when there is nothing to price. */
export function savedQuoteHtml(viewport: Viewport, editor: Editor): string | null {
  const { totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  return totals.length ? quoteHtml(makeQuote(totals, loadRates(), [...modelHardware(editor.doc), ...autoHardware(editor.doc)], editor.unit, holesOf(editor.doc))) : null;
}

/** The total (TTC) of the quote of the displayed parts at the saved rates, or null when there is nothing to price. */
export function quoteTotal(viewport: Viewport, editor: Editor): number | null {
  const { totals } = cutList(editor.doc, partsOf(viewport, editor.doc));
  return totals.length ? makeQuote(totals, loadRates(), [...modelHardware(editor.doc), ...autoHardware(editor.doc)], editor.unit, holesOf(editor.doc)).gross : null;
}

export function bindWorkshopDocuments(root: HTMLElement, viewport: Viewport, editor: Editor, geometry: GeometryClient): void {
  bindCnc(root, viewport, editor, geometry);
  root.querySelector('[data-workshop="check"]')?.addEventListener("click", () => void showCheck(viewport, editor, geometry));
  root.querySelector('[data-workshop="sheets"]')?.addEventListener("click", () => void printPartSheets(viewport, editor, geometry));
  root.querySelector('[data-workshop="quote"]')?.addEventListener("click", () => showQuote(viewport, editor));
}
