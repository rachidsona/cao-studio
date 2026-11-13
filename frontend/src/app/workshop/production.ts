/**
 * Production de l'Atelier :
 * - « Optimisation de découpe » : le calepinage (document/nesting.ts), les chutes du stock de l'atelier placées avant
 *   les panneaux neufs, ce qui reste de chaque panneau à garder (un clic le range dans le stock), les chutes utilisées
 *   à sortir du stock, et la liste d'achat (document/purchase.ts) ;
 * - « Fabrication groupée » (comme le mode catalogue de Polyboard) : plusieurs projets, chacun en quantité, débités
 *   ensemble — le calepinage et la liste d'achat de tout le lot. Chaque projet y est ajouté avec sa liste de débit du
 *   moment.
 * Le stock et le lot sont gardés par le serveur (/api/offcuts/, /api/batch/ : apps/projects/production.py).
 */
import { layoutBars, type Bar } from "../../document/bars";
import { cutList, type CutRow } from "../../document/cut-list";
import { modelHardware } from "../../document/hardware";
import { MATERIALS } from "../../document/materials";
import { layoutSheets, type Sheet, type StockPiece } from "../../document/nesting";
import { combineHardware, combineRows, purchaseCsv, purchaseList, type PurchaseLine } from "../../document/purchase";
import type { DisplayUnit } from "../../document/types";
import { toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { openPurchaseOrders } from "./purchase-orders-tool";
import { call } from "./sharing";
import { partsOf } from "./workshop";
import { downloadText, escapeHtml, openModal, printHtml, type PrintPage } from "./workshop-ui";

const INPUT = "h-8 w-20 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const num = (mm: number, unit: DisplayUnit) => trim(toDisplay(mm, unit), unit === "mm" ? 1 : 2);

interface BatchItem {
  id: number;
  project: string | null;
  name: string;
  quantity: number;
  rows: CutRow[];
  hardware: { name: string; quantity: number; unit?: string }[];
  updated_at: string;
}

function sheetSvg(sheet: Sheet, index: number, unit: DisplayUnit): string {
  const [W, H] = sheet.size;
  const rects = sheet.placements
    .map((p) => {
      const label = `${p.tag ? `${escapeHtml(p.tag)} · ` : ""}${num(p.w, unit)}×${num(p.h, unit)}`;
      const size = Math.max(14, Math.min(p.w / (label.length * 0.62), p.h / 2.2, Math.min(p.w, p.h) / 4));
      return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fde68a" stroke="#92400e" stroke-width="2"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#111"><title>${escapeHtml(p.name)}</title>${label}</text></g>`;
    })
    .join("");
  // The fronts whose grain goes on, framed in violet.
  const runs = (sheet.runs ?? []).map(([x, y, w, h]) => `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="#7c3aed" stroke-width="6" stroke-dasharray="30 12"/>`).join("");
  // What is worth keeping, dashed in green.
  const kept = sheet.leftovers.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dcfce7" stroke="#15803d" stroke-width="3" stroke-dasharray="18 10"/>`).join("");
  const what = sheet.offcut !== undefined ? `Chute du stock n° ${sheet.offcut}` : `Panneau ${index + 1}`;
  return `<div class="sheet"><h3>${what} — ${escapeHtml(sheet.material)} ${num(sheet.thickness, unit)} ${UNIT_LABELS[unit]} (${num(W, unit)}×${num(H, unit)} ${UNIT_LABELS[unit]}), chutes ${Math.round((1 - sheet.usage) * 100)} %${sheet.leftovers.length ? `, ${sheet.leftovers.length} à garder (en vert)` : ""}</h3><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff" stroke="#111" stroke-width="4"/>${kept}${rects}${runs}</svg></div>`;
}

/** A bar of battens: its parts end to end (with their mark and length), what is left hatched. */
function barSvg(bar: Bar, index: number, unit: DisplayUnit): string {
  const H = Math.max(60, bar.section[0]) * 1.6;
  const cuts = bar.cuts
    .map((c) => {
      const label = `${c.tag ? `${escapeHtml(c.tag)} · ` : ""}${num(c.length, unit)}`;
      const size = Math.min(H * 0.45, c.length / (label.length * 0.62));
      return `<g><rect x="${c.x}" y="0" width="${c.length}" height="${H}" fill="#fde68a" stroke="#92400e" stroke-width="2"/><text x="${c.x + c.length / 2}" y="${H / 2}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#111"><title>${escapeHtml(c.name)}</title>${label}</text></g>`;
    })
    .join("");
  const rest = bar.rest > 0 ? `<rect x="${bar.length - bar.rest}" y="0" width="${bar.rest}" height="${H}" fill="url(#hatch)" stroke="#9ca3af" stroke-width="2"/>` : "";
  return `<div class="sheet"><h3>Barre ${index + 1} — ${escapeHtml(bar.material)} ${num(bar.section[0], unit)} × ${num(bar.section[1], unit)} ${UNIT_LABELS[unit]} (${num(bar.length, unit)} ${UNIT_LABELS[unit]}), chute ${num(bar.rest, unit)} ${UNIT_LABELS[unit]}</h3><svg viewBox="0 0 ${bar.length} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="hatch" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="24" fill="#f3f4f6"/><path d="M0 0v24" stroke="#d1d5db" stroke-width="8"/></pattern></defs><rect width="${bar.length}" height="${H}" fill="#fff" stroke="#111" stroke-width="4"/>${rest}${cuts}</svg></div>`;
}

const purchaseHtml = (sheets: Sheet[], rows: CutRow[], hardware: { name: string; quantity: number; unit?: string }[], bars: Bar[] = []) =>
  `<table><thead><tr><th>Article</th><th>Quantité</th><th>Détail</th></tr></thead><tbody>${purchaseList(sheets, rows, hardware, bars)
    .map((l) => `<tr><td>${escapeHtml(l.label)}</td><td>${l.quantity.toLocaleString("fr-FR")} ${escapeHtml(l.unit)}</td><td>${escapeHtml(l.detail ?? "")}</td></tr>`)
    .join("")}</tbody></table>`;

/** What to buy for these rows and this hardware: the sheets laid out on the stock first, when it can be read. */
export async function purchaseLines(rows: CutRow[], hardware: { name: string; quantity: number; unit?: string; price?: number }[]): Promise<PurchaseLine[]> {
  const pieces = await stock().catch((): StockPiece[] => []);
  return purchaseList(layoutSheets(rows, undefined, pieces).sheets, rows, hardware, layoutBars(rows).bars);
}

/** The sheets of a project and what to buy, using the stock of offcuts when it can be read. */
export async function layoutFiles(rows: CutRow[], hardware: { name: string; quantity: number; unit?: string; price?: number }[], unit: DisplayUnit): Promise<{ page: PrintPage; purchase: string; lines: PurchaseLine[]; sheets: number }> {
  const pieces = await stock().catch((): StockPiece[] => []);
  const { sheets, tooBig, brokenRuns } = layoutSheets(rows, undefined, pieces);
  const { bars, tooLong } = layoutBars(rows);
  const out = [...tooBig, ...tooLong];
  return {
    page: {
      title: "Calepinage",
      html: `<h1>Calepinage</h1>${sheets.map((s, i) => sheetSvg(s, i, unit)).join("")}${bars.map((b, i) => barSvg(b, i, unit)).join("")}${brokenRuns.length ? `<p>Fil continu impossible, rangée trop grande pour son panneau : ${escapeHtml(brokenRuns.join(" ; "))}.</p>` : ""}${out.length ? `<p>À revoir, trop grandes pour leur panneau ou leur barre : ${escapeHtml(out.join(", "))}.</p>` : ""}<h2>Liste d'achat</h2>${purchaseHtml(sheets, rows, hardware, bars)}`,
    },
    purchase: purchaseCsv(purchaseList(sheets, rows, hardware, bars)),
    lines: purchaseList(sheets, rows, hardware, bars),
    sheets: sheets.length,
  };
}

async function stock(): Promise<StockPiece[]> {
  return (await call<{ offcuts: StockPiece[] }>("/api/offcuts/")).offcuts;
}

/** The layout window of `rows` (one project, or a batch), with the stock, the leftovers and the purchase list. */
async function showLayout(editor: Editor, title: string, rows: CutRow[], hardware: { name: string; quantity: number; unit?: string }[]): Promise<void> {
  const unit = editor.unit;
  let pieces: StockPiece[] = [];
  let useStock = true;
  try {
    pieces = await stock();
  } catch {
    useStock = false;
  }
  const holder = el("div", { class: "space-y-3 text-xs [&_table]:w-full [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:text-left dark:[&_td]:border-gray-700" });
  const toggle = el("input", { type: "checkbox", checked: useStock && pieces.length > 0, disabled: !pieces.length });
  let result = layoutSheets(rows, undefined, toggle.checked ? pieces : []);
  // Battens are cut from bars, whatever the stock of offcuts.
  const cut = layoutBars(rows);
  const draw = () => {
    result = layoutSheets(rows, undefined, toggle.checked ? pieces : []);
    const { sheets, tooBig, brokenRuns } = result;
    const used = sheets.filter((s) => s.offcut !== undefined).length;
    const fresh = sheets.length - used;
    const { bars, tooLong } = cut;
    const html =
      sheets.map((sheet, i) => sheetSvg(sheet, i, unit)).join("") +
      bars.map((bar, i) => barSvg(bar, i, unit)).join("") +
      (tooBig.length ? `<p>Trop grandes pour leur panneau : ${escapeHtml(tooBig.join(", "))}.</p>` : "") +
      (brokenRuns.length ? `<p>Fil continu impossible, rangée trop grande pour son panneau : ${escapeHtml(brokenRuns.join(" ; "))}.</p>` : "") +
      (tooLong.length ? `<p>Plus longues que leur barre : ${escapeHtml(tooLong.join(", "))}.</p>` : "");
    const board = el("div");
    board.innerHTML = html || "<p>Rien à placer.</p>";
    const buy = el("div");
    buy.innerHTML = purchaseHtml(sheets, rows, hardware, bars);
    holder.replaceChildren(
      el("label", { class: "flex items-center gap-2" }, toggle, pieces.length ? `Utiliser d'abord les chutes du stock (${pieces.reduce((n, p) => n + p.quantity, 0)})` : "Aucune chute en stock"),
      el("p", { class: "font-medium" }, `${fresh} panneau(x) neuf(s)${used ? ` et ${used} chute(s) du stock` : ""}${bars.length ? `, ${bars.length} barre${bars.length > 1 ? "s" : ""} de tasseau` : ""}.`),
      board,
      el("h3", { class: "text-sm font-semibold" }, "Liste d'achat"),
      buy,
    );
  };
  toggle.addEventListener("change", draw);
  draw();
  const keep = async () => {
    const offcuts = result.sheets.flatMap((s) => s.leftovers.map(([, , w, h]) => ({ material: s.material, thickness: s.thickness, length: w, width: h, note: title })));
    if (!offcuts.length) return editor.notify("Aucune chute assez grande à garder.", "info");
    try {
      await call("/api/offcuts/", { method: "POST", body: JSON.stringify({ offcuts }) });
      editor.notify(`${offcuts.length} chute(s) rangée(s) dans le stock.`, "success");
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const takeOut = async () => {
    const used = new Map<number, number>();
    for (const s of result.sheets) if (s.offcut !== undefined) used.set(s.offcut, (used.get(s.offcut) ?? 0) + 1);
    if (!used.size) return editor.notify("Aucune chute du stock n'est utilisée.", "info");
    try {
      for (const [id, n] of used) {
        const piece = pieces.find((p) => p.id === id);
        if (piece) await call(`/api/offcuts/${id}/`, { method: "PATCH", body: JSON.stringify({ quantity: Math.max(0, piece.quantity - n) }) });
      }
      pieces = await stock();
      draw();
      editor.notify(`${used.size} chute(s) sortie(s) du stock.`, "success");
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const close = openModal(`${title} — ${result.sheets.length} panneau${result.sheets.length > 1 ? "x" : ""}${cut.bars.length ? `, ${cut.bars.length} barre${cut.bars.length > 1 ? "s" : ""}` : ""}`, holder, [
    { label: "Bons de commande", run: () => openPurchaseOrders(editor, purchaseList(result.sheets, rows, hardware, cut.bars), title) },
    { label: "Garder les chutes", run: () => void keep() },
    { label: "Sortir les chutes utilisées", run: () => void takeOut() },
    { label: "Exporter en SVG", run: () => downloadText("decoupe.svg", result.sheets.length ? sheetSvg(result.sheets[0]!, 0, unit).replace(/^.*?(<svg)/s, "$1").replace(/<\/div>$/, "") : "", "image/svg+xml") },
    { label: "Imprimer / PDF", run: () => printHtml(title, `<h1>${escapeHtml(title)}</h1>${result.sheets.map((s, i) => sheetSvg(s, i, unit)).join("")}${cut.bars.map((b, i) => barSvg(b, i, unit)).join("")}<h2>Liste d'achat</h2>${purchaseHtml(result.sheets, rows, hardware, cut.bars)}`) },
    { label: "Fermer", run: () => close() },
  ]);
}

/** The stock of offcuts: what is there, removed by hand, added by hand. */
async function showStock(editor: Editor): Promise<void> {
  const list = el("div", { class: "space-y-1 text-xs" });
  const refresh = async () => {
    const pieces = await stock();
    list.replaceChildren(
      ...(pieces.length
        ? pieces.map((p) => {
            const remove = el("button", { type: "button", class: BUTTON }, "Retirer");
            remove.addEventListener("click", () => void call(`/api/offcuts/${p.id}/`, { method: "DELETE" }).then(refresh, (e: Error) => editor.notify(e.message, "error")));
            return el("div", { class: "flex items-center gap-2" }, el("span", { class: "flex-1" }, `n° ${p.id} · ${p.material} ${p.thickness} mm · ${p.length} × ${p.width} mm${p.quantity > 1 ? ` × ${p.quantity}` : ""}`), remove);
          })
        : [el("p", { class: "text-gray-500" }, "Le stock est vide : « Garder les chutes » du calepinage y range ce qui reste des panneaux.")]),
    );
  };
  const material = el("select", { class: "h-8 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Matière" }, ...MATERIALS.map((m) => el("option", { value: m.name }, m.name)));
  const field = (label: string, value: string) => {
    const input = el("input", { type: "number", min: "1", step: "any", class: INPUT, value, "aria-label": label });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    return input;
  };
  const [thickness, length, width] = [field("Épaisseur", "19"), field("Longueur", "800"), field("Largeur", "400")];
  const add = el("button", { type: "button", class: BUTTON }, "Ajouter");
  add.addEventListener("click", () =>
    void call("/api/offcuts/", { method: "POST", body: JSON.stringify({ offcuts: [{ material: material.value, thickness: Number(thickness.value), length: Number(length.value), width: Number(width.value) }] }) }).then(refresh, (e: Error) => editor.notify(e.message, "error")),
  );
  const content = el("div", { class: "space-y-3" }, el("div", { class: "flex flex-wrap items-center gap-1 text-xs" }, material, thickness, "×", length, "×", width, "mm", add), list);
  const close = openModal("Stock de chutes", content, [{ label: "Fermer", run: () => close() }]);
  await refresh().catch((e: Error) => editor.notify(e.message, "error"));
}

/** The grouped production: the projects of the batch, their quantities, and the layout of all of them. */
async function showBatch(viewport: Viewport, editor: Editor, projectId: string | null, projectName: string): Promise<void> {
  const list = el("div", { class: "space-y-1 text-xs" });
  let items: BatchItem[] = [];
  const refresh = async () => {
    items = (await call<{ items: BatchItem[] }>("/api/batch/")).items;
    list.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const qty = el("input", { type: "number", min: "1", max: "999", step: "1", class: INPUT, value: String(item.quantity), "aria-label": `Quantité de ${item.name}` });
            qty.addEventListener("keydown", (e) => e.stopPropagation());
            qty.addEventListener("change", () => void call(`/api/batch/${item.id}/`, { method: "PATCH", body: JSON.stringify({ quantity: Math.max(1, Math.round(Number(qty.value) || 1)) }) }).then(refresh, (e: Error) => editor.notify(e.message, "error")));
            const remove = el("button", { type: "button", class: BUTTON }, "Retirer");
            remove.addEventListener("click", () => void call(`/api/batch/${item.id}/`, { method: "DELETE" }).then(refresh, (e: Error) => editor.notify(e.message, "error")));
            const parts = item.rows.reduce((n, r) => n + r.quantity, 0);
            return el("div", { class: "flex items-center gap-2" }, el("span", { class: "flex-1" }, el("b", {}, item.name), ` · ${parts} pièce(s) · ajouté le ${new Date(item.updated_at).toLocaleDateString("fr-FR")}`), "×", qty, remove);
          })
        : [el("p", { class: "text-gray-500" }, "Aucun projet dans le lot.")]),
    );
  };
  const addThis = el("button", { type: "button", class: "h-9 btn-accent px-3 text-sm font-medium" }, "Ajouter ce projet au lot");
  addThis.addEventListener("click", async () => {
    const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
    if (!rows.length) return editor.notify("Aucune pièce dans ce projet.", "info");
    try {
      await call("/api/batch/", { method: "POST", body: JSON.stringify({ project: projectId, name: projectName, rows, hardware: modelHardware(editor.doc) }) });
      editor.notify(`« ${projectName} » est dans le lot, avec sa liste de débit du moment.`, "success");
      await refresh();
    } catch (e) {
      editor.notify(e instanceof Error ? e.message : String(e), "error");
    }
  });
  const content = el(
    "div",
    { class: "space-y-3 text-sm" },
    el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, "Plusieurs projets débités ensemble : un seul calepinage (moins de chutes), une seule liste d'achat. Ajoutez chaque projet depuis son éditeur ; sa liste de débit est prise telle qu'elle est à ce moment-là (ajoutez-le de nouveau après un changement)."),
    addThis,
    list,
  );
  const layout = () => {
    if (!items.length) return editor.notify("Le lot est vide.", "info");
    void showLayout(editor, "Fabrication groupée", combineRows(items), combineHardware(items));
  };
  const close = openModal("Fabrication groupée", content, [
    { label: "Calepinage et liste d'achat du lot", run: layout },
    { label: "Stock de chutes", run: () => void showStock(editor) },
    { label: "Fermer", run: () => close() },
  ]);
  await refresh().catch((e: Error) => editor.notify(e.message, "error"));
}

export function bindProduction(root: HTMLElement, viewport: Viewport, editor: Editor, apiUrl: string, projectName: string): void {
  const projectId = /projects\/([0-9a-f-]{36})\//.exec(apiUrl)?.[1] ?? null;
  root.querySelector('[data-workshop="nesting"]')?.addEventListener("click", () => {
    const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
    if (!rows.length) return editor.notify("Aucun corps à découper.", "info");
    void showLayout(editor, "Optimisation de découpe", rows, modelHardware(editor.doc));
  });
  root.querySelector('[data-workshop="batch"]')?.addEventListener("click", () => void showBatch(viewport, editor, projectId, projectName));
  root.querySelector('[data-workshop="offcuts"]')?.addEventListener("click", () => void showStock(editor));
}
