/**
 * Sous le devis (workshop-documents.ts) : le repère au mètre linéaire, un scénario (une matière par une autre, le
 * « What if » de Mozaik : le prix des deux, et l'écart) et les versions du devis gardées dans le projet — le devis
 * initial, puis les avenants, chacun avec ce qui a changé depuis le précédent, imprimable.
 */
import { decorMetres } from "../../features/decor-length";
import type { CutTotals } from "../../document/cut-list";
import { MATERIALS } from "../../document/materials";
import { money, makeQuote, quoteChanges, scenarioTotals, withSavedQuote, type Quote, type QuoteRates, type SavedQuote } from "../../document/quote";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "./workshop";
import { escapeHtml, printHtml } from "./workshop-ui";

const SELECT = "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;

/** The largest horizontal extent of the furniture (m): what a price per linear metre is reckoned on. */
function runLength(viewport: Viewport, editor: Editor): number {
  const parts = partsOf(viewport, editor.doc);
  if (!parts.length) return 0;
  const lo = [0, 1].map((i) => Math.min(...parts.map((p) => p.bbox[0][i]!)));
  const hi = [0, 1].map((i) => Math.max(...parts.map((p) => p.bbox[1][i]!)));
  return Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!) / 1000;
}

function changesHtml(before: SavedQuote, after: Pick<SavedQuote, "lines" | "gross">): string {
  const rows = quoteChanges(before, after);
  return `<table><thead><tr><th>Ligne</th><th>Avant (HT)</th><th>Après (HT)</th><th>Écart</th></tr></thead><tbody>${rows
    .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td>${money(c.was)}</td><td>${money(c.now)}</td><td>${signed(c.now - c.was)}</td></tr>`)
    .join("")}</tbody></table><p><b>Écart total TTC : ${signed(after.gross - before.gross)}</b></p>`;
}

export function quoteExtras(
  holder: HTMLElement,
  viewport: Viewport,
  editor: Editor,
  totals: CutTotals[],
  rates: QuoteRates,
  hardware: { name: string; quantity: number; unit?: string }[],
  holes: number,
  quote: Quote,
  quoteHtml: (q: Quote) => string,
): void {
  const metres = runLength(viewport, editor);
  const perMetre = metres > 0.2 ? el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, `Soit ${money(quote.gross / metres)} TTC le mètre linéaire (${metres.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m hors tout) : un repère pour comparer avec les prix du marché.`) : null;

  // ---- scenario: one material priced as another --------------------------------------------
  const used = totals.map((t) => t.material).filter((m, i, all) => all.indexOf(m) === i);
  const from = el("select", { class: SELECT, "aria-label": "Matière du scénario" }, ...used.map((m) => el("option", { value: m }, m)));
  const to = el("select", { class: SELECT, "aria-label": "Matière de remplacement" }, ...MATERIALS.map((m) => el("option", { value: m.name }, m.name)));
  const result = el("p", { class: "text-xs" });
  const compare = () => {
    const other = makeQuote(scenarioTotals(totals, from.value, to.value), rates, hardware, editor.unit, holes, decorMetres(editor.doc));
    result.textContent = `${from.value} → ${to.value} : ${money(other.gross)} TTC au lieu de ${money(quote.gross)} (${signed(other.gross - quote.gross)}).`;
  };
  from.addEventListener("change", compare);
  to.addEventListener("change", compare);
  if (used.length) compare();

  // ---- versions: the quote, then its amendments ------------------------------------------------
  const saved = editor.doc.quotes ?? [];
  const keep = el("button", { type: "button", class: BUTTON }, saved.length ? `Enregistrer comme avenant ${saved.length}` : "Enregistrer comme devis initial");
  keep.addEventListener("click", () => {
    void editor.change({ ...editor.doc, quotes: withSavedQuote(editor.doc.quotes ?? [], quote) }).then(() => quoteExtras(holder, viewport, editor, totals, rates, hardware, holes, quote, quoteHtml));
    editor.notify(saved.length ? `Avenant ${saved.length} enregistré dans le projet.` : "Devis initial enregistré dans le projet.", "success");
  });
  const last = saved.at(-1);
  const since = last ? quoteChanges(last, quote) : [];
  const versions = saved.map((v, i) => {
    const print = el("button", { type: "button", class: BUTTON }, "Imprimer");
    print.addEventListener("click", () => {
      const before = saved[i - 1];
      const title = `${v.label} — ${new Date(v.date).toLocaleDateString("fr-FR")}`;
      printHtml(title, `<h1>${escapeHtml(title)}</h1>${quoteHtml({ lines: v.lines, cost: 0, margin: 0, net: v.net, vat: Math.round((v.gross - v.net) * 100) / 100, gross: v.gross })}${before ? `<h2>Changements depuis : ${escapeHtml(before.label)}</h2>${changesHtml(before, v)}` : ""}`);
    });
    const delta = i ? ` (${signed(v.gross - saved[i - 1]!.gross)})` : "";
    return el("div", { class: "flex items-center gap-2 text-xs" }, el("span", { class: "flex-1" }, `${v.label} · ${new Date(v.date).toLocaleDateString("fr-FR")} · ${money(v.gross)} TTC${delta}`), print);
  });
  holder.replaceChildren(
    ...(perMetre ? [perMetre] : []),
    el("details", { class: "border border-gray-200 p-3 dark:border-gray-700" }, el("summary", { class: "cursor-pointer text-sm font-medium" }, "Scénario : et avec une autre matière ?"),
      el("div", { class: "space-y-2 pt-3" }, el("div", { class: "flex items-center gap-2 text-xs" }, from, "→", to), result)),
    el("details", { class: "border border-gray-200 p-3 dark:border-gray-700", open: saved.length > 0 }, el("summary", { class: "cursor-pointer text-sm font-medium" }, `Versions du devis (${saved.length})`),
      el("div", { class: "space-y-2 pt-3" },
        ...versions,
        last ? el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, since.length ? `Depuis « ${last.label} » : ${since.length} ligne(s) changée(s), ${signed(quote.gross - last.gross)} TTC.` : `Rien n'a changé depuis « ${last.label} ».`) : el("p", { class: "text-xs text-gray-500" }, "Enregistrez le devis signé ; chaque changement ensuite fera un avenant, avec ce qui a changé."),
        keep)),
  );
}
