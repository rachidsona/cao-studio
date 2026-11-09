/**
 * La liste de débit à lire : un résumé, puis une carte par matière et épaisseur. Une colonne qui ne dit rien de plus
 * disparaît (la coupe égale à la cote finie, le fil commun à toutes les pièces, le débit brut du panneau). Le même HTML
 * sert à l'écran, en clair ou en sombre, et à l'impression ; sur téléphone, chaque ligne devient une petite fiche.
 */
import { barLength } from "../../document/bars";
import { edgeText, grainText, type CutRow, type CutTotals } from "../../document/cut-list";
import type { DisplayUnit } from "../../document/types";
import { formatLength, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { escapeHtml } from "./workshop-ui";

const num = (mm: number, unit: DisplayUnit) => trim(toDisplay(mm, unit), unit === "mm" ? 1 : 2);
const fr = (v: number, digits: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const differs = (a: number, b: number) => Math.abs(a - b) > 0.01;

/** The names of a row, their common word once: « Cloison 6, 9, 18 · Étagère 2 ». */
export function compactNames(names: readonly string[]): string {
  const families = new Map<string, string[]>();
  for (const name of names) {
    const [, word, n] = /^(.*\S)\s+(\d+)$/.exec(name) ?? [];
    const key = word ?? name;
    families.set(key, n ? [...(families.get(key) ?? []), n] : (families.get(key) ?? []));
  }
  return [...families].map(([word, numbers]) => (numbers.length ? `${word} ${numbers.join(", ")}` : word)).join(" · ");
}

const hasCut = (r: CutRow) => differs(r.cutLength, r.length) || differs(r.cutWidth, r.width);
const hasRough = (r: CutRow) => r.roughLength !== undefined && r.roughWidth !== undefined && (differs(r.roughLength, r.cutLength) || differs(r.roughWidth, r.cutWidth));

/** A board seen from above, its banded sides in colour. */
function edgeDrawing({ edges }: CutRow): string {
  const sides: [boolean | undefined, number, number, number, number][] = [
    [edges.length1, 1, 1, 29, 1],
    [edges.length2, 1, 15, 29, 15],
    [edges.width1, 1, 1, 1, 15],
    [edges.width2, 29, 1, 29, 15],
  ];
  const on = sides.filter(([laid]) => laid).map(([, x1, y1, x2, y2]) => `<line class="cut-on" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  return `<svg class="cut-edges" viewBox="0 0 30 16" width="30" height="16" aria-hidden="true"><rect x="1" y="1" width="28" height="14"/>${on.join("")}</svg>`;
}

function edgeCell(r: CutRow): string {
  const text = edgeText(r.edges);
  if (text === "—") return `<span class="cut-none">—</span>`;
  return `<span class="cut-band">${edgeDrawing(r)}<span>${text}${r.band ? ` <small>${fr(r.band, r.band % 1 ? 1 : 0)} mm</small>` : ""}</span></span>`;
}

function groupHtml(t: CutTotals, own: (readonly [CutRow, number])[], unit: DisplayUnit): string {
  const [showCut, showRough] = [own.some(([r]) => hasCut(r)), own.some(([r]) => hasRough(r))];
  const grains = new Set(own.map(([r]) => r.grain));
  const oneGrain = grains.size === 1 ? own[0]?.[0].grain : undefined;
  const facts = [plural(t.parts, "pièce"), barLength(t.material) !== null ? `${fr(t.metres ?? 0, 2)} m bout à bout` : `${fr(t.area, 2)} m²`];
  if (t.bandLength) facts.push(`${fr(t.bandLength, 1)} m de chant`);
  if (oneGrain) facts.push(oneGrain === "none" ? "sans fil" : `fil ${grainText(oneGrain)}`);
  const columns: [string, string, (r: CutRow) => string][] = [
    ["Repère", "cut-tag-cell", (r) => `<span class="cut-tag">${r.tag ?? ""}</span>`],
    ["Pièce", "cut-name", (r) => `${escapeHtml(compactNames(r.names))}${r.approximate ? ` <span class="cut-none" title="Forme non rectangulaire : cotes de son encombrement">≈</span>` : ""}`],
    ["Qté", "cut-num cut-qty", (r) => (r.quantity > 1 ? `<b>${r.quantity}</b>` : String(r.quantity))],
    ["Longueur", "cut-num", (r) => num(r.length, unit)],
    ["Largeur", "cut-num", (r) => num(r.width, unit)],
    ...(showCut ? [["Coupe", "cut-num cut-soft", (r: CutRow) => (hasCut(r) ? `${num(r.cutLength, unit)} × ${num(r.cutWidth, unit)}` : `<span class="cut-none">=</span>`)] as [string, string, (r: CutRow) => string]] : []),
    ...(oneGrain ? [] : [["Fil", "cut-soft", (r: CutRow) => grainText(r.grain)] as [string, string, (r: CutRow) => string]]),
    ["Chants", "cut-chants", edgeCell],
    ...(showRough ? [["Débit brut", "cut-num cut-soft", (r: CutRow) => (hasRough(r) ? `${num(r.roughLength as number, unit)} × ${num(r.roughWidth as number, unit)}` : `<span class="cut-none">=</span>`)] as [string, string, (r: CutRow) => string]] : []),
  ];
  const head = columns.map(([label, kind]) => `<th scope="col" class="${kind}">${label}</th>`).join("");
  const rows = own.map(([r, i]) => `<tr data-row="${i}" title="Voir ces pièces dans le modèle">${columns.map(([label, kind, cell]) => `<td class="${kind}" data-label="${label}">${cell(r)}</td>`).join("")}</tr>`);
  return `<section class="cut-group"><header><h3>${escapeHtml(t.material)}<span>${formatLength(t.thickness, unit)}</span></h3><p>${facts.join(" · ")}</p></header><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
}

/** The whole list: its summary, its cards, its short legend. */
export function cutSheetHtml(rows: readonly CutRow[], totals: readonly CutTotals[], unit: DisplayUnit): string {
  const sum = (take: (t: CutTotals) => number) => totals.reduce((total, t) => total + take(t), 0);
  const panels = totals.filter((t) => barLength(t.material) === null);
  const metres = sum((t) => (barLength(t.material) !== null ? (t.metres ?? 0) : 0));
  const facts: [string, string][] = [["Pièces", String(sum((t) => t.parts))]];
  if (panels.length) facts.push(["Surface", `${fr(panels.reduce((total, t) => total + t.area, 0), 2)} m²`]);
  if (metres) facts.push(["Tasseaux", `${fr(metres, 2)} m`]);
  const band = sum((t) => t.bandLength);
  if (band) facts.push(["Chant", `${fr(band, 1)} m`]);
  facts.push(["Matières et épaisseurs", String(totals.length)]);
  const groups = totals.map((t) => groupHtml(t, rows.map((r, i) => [r, i] as const).filter(([r]) => r.material === t.material && r.thickness === t.thickness), unit));
  const notes = [`Cotes finies en ${UNIT_LABELS[unit]}, repères comme sur le calepinage.`];
  if (rows.some(hasCut)) notes.push("Coupe : la cote à scier, chants déduits ; = : la même que la cote finie.");
  if (rows.some(hasRough)) notes.push("Débit brut : le massif scié avec sa surcote, puis raboté à la cote de coupe.");
  if (rows.some((r) => edgeText(r.edges) !== "—")) notes.push("Chants : L1 et L2 sur les grands côtés, l1 et l2 sur les petits.");
  return `<div class="cut-sheet"><dl class="cut-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>${groups.join("")}<p class="cut-notes">${notes.join(" ")}</p></div>`;
}

export const CUT_SHEET_CSS = `
.cut-sheet{--ink:var(--g900,#111827);--soft:var(--g500,#6b7280);--line:var(--g200,#e5e7eb);--tint:var(--g50,#f9fafb);--accent:var(--color-sky-600,#0284c7);--accent-tint:var(--color-sky-100,#e0f2fe);color:var(--ink);font:13px/1.45 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.dark .cut-sheet{--ink:var(--g100,#f3f4f6);--soft:var(--g400,#9ca3af);--line:var(--g700,#374151);--tint:var(--g800,#1f2937);--accent:var(--color-sky-400,#38bdf8);--accent-tint:var(--color-sky-900,#0c4a6e)}
.cut-facts{display:flex;flex-wrap:wrap;gap:0;margin:0 0 16px;border-block:1px solid var(--line)}
.cut-facts div{flex:1 1 120px;padding:10px 14px;border-left:1px solid var(--line)}
.cut-facts div:first-child{border-left:0;padding-left:0}
.cut-facts dt{font-size:11px;color:var(--soft)}
.cut-facts dd{margin:2px 0 0;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2}
.cut-group{margin-bottom:20px;break-inside:auto}
.cut-group[hidden],.cut-sheet tr[hidden]{display:none}
.cut-group header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 16px;padding-bottom:6px;border-bottom:2px solid var(--accent);break-after:avoid}
.cut-group h3{margin:0;font-size:15px;font-weight:600}
.cut-group h3 span{margin-left:8px;font-weight:500;color:var(--soft)}
.cut-group header p{margin:0;font-size:12px;color:var(--soft)}
.cut-sheet table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.cut-sheet th,.cut-sheet td{border:0;border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:middle}
.cut-sheet th{position:sticky;top:44px;z-index:1;background:var(--cut-paper,#fff);color:var(--soft);font-size:11px;font-weight:500;white-space:nowrap}
.dark .cut-sheet th{background:var(--g900,#111827)}
.cut-sheet th:first-child,.cut-sheet td:first-child{padding-left:0}
.cut-sheet th:last-child,.cut-sheet td:last-child{padding-right:0}
.cut-sheet tbody tr{cursor:pointer;break-inside:avoid}
.cut-sheet tbody tr:hover td{background:var(--tint)}
.cut-sheet .cut-num{text-align:right;white-space:nowrap}
.cut-sheet .cut-qty{width:3em}
.cut-sheet .cut-soft{color:var(--soft)}
.cut-sheet .cut-name{width:100%;min-width:9em}
.cut-sheet .cut-chants{white-space:nowrap}
.cut-tag{display:inline-block;min-width:1.7em;padding:1px 4px;background:var(--accent-tint);color:var(--ink);font-size:12px;font-weight:600;text-align:center}
.cut-none{color:var(--soft)}
.cut-band{display:inline-flex;align-items:center;gap:7px}
.cut-band small{font-size:11px;color:var(--soft)}
.cut-edges{flex:none;display:block;overflow:visible}
.cut-edges rect{fill:none;stroke:var(--line);stroke-width:1}
.cut-edges .cut-on{stroke:var(--accent);stroke-width:2.5;stroke-linecap:round}
.cut-notes{margin:0;font-size:12px;color:var(--soft)}
@media print{.cut-sheet{font-size:11px}.cut-sheet th{position:static}.cut-sheet tbody tr{cursor:auto}.cut-facts dd{font-size:16px}}
@media screen and (max-width:640px){
  .cut-sheet thead{display:none}
  .cut-sheet table,.cut-sheet tbody{display:block}
  .cut-sheet tr{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}
  .cut-sheet tr[hidden]{display:none}
  .cut-sheet td{display:flex;justify-content:space-between;gap:12px;grid-column:1/-1;border:0;padding:1px 0;white-space:normal}
  .cut-sheet td::before{content:attr(data-label);color:var(--soft);font-size:12px}
  .cut-sheet td.cut-tag-cell,.cut-sheet td.cut-name,.cut-sheet td.cut-qty{grid-column:auto;display:block;width:auto;min-width:0;text-align:left;font-weight:500}
  .cut-sheet td.cut-tag-cell::before,.cut-sheet td.cut-name::before{content:none}
  .cut-sheet td.cut-qty::before{content:"× ";font-size:13px}
  .cut-sheet td.cut-chants:has(> .cut-none:only-child),.cut-sheet td.cut-soft:has(> .cut-none:only-child){display:none}
  .cut-facts{display:grid;grid-template-columns:1fr 1fr}
  .cut-facts div{padding:8px 12px}
  .cut-facts div:nth-child(odd){border-left:0;padding-left:0}
  .cut-facts dd{font-size:17px}
}`;
