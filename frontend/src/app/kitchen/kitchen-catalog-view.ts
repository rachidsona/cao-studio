/**
 * Le catalogue de cuisine dessiné, partagé par « Meubles de cuisine » (app/kitchen-units.ts) et l'éditeur de linéaire du
 * Plan de cuisine (app/kitchen-run-editor.ts) : chaque modèle avec son dessin de face à l'échelle (app/unit-elevation.ts),
 * ce qu'il contient et ses cotes ; survoler une largeur redessine le meuble à cette largeur, un clic l'ajoute. Une
 * autre largeur se tape (« Autre… »), ou se prend à la place libre du linéaire (« Place libre »). Les appareils (évier,
 * plaque, fours, lave-vaisselle, colonnes, hotte, micro-ondes) se montrent de même, à leurs largeurs seulement.
 * Une casquette choisie dans un linéaire est la casquette du plan, en caissons (capUnits).
 */
import { CATALOG, KINDS, type CatalogEntry, type UnitKind } from "../../document/kitchen-catalog";
import { withKitchenBuilt } from "../../document/kitchen-floor";
import type { DisplayUnit } from "../../document/types";
import { APPLIANCES, itemEntry, modelOf, SURROUND } from "../../features/kitchen-run-items";
import { formatLength, fromDisplay, parseNumber, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { elevation, unitSummary } from "./unit-elevation";
import type { Editor } from "../editor";
import type { CardDepth } from "./kitchen-model-depth";

const WIDTH = "h-6 min-w-7 border border-gray-200 px-1 font-mono text-2xs text-gray-600 transition-colors hover:border-[var(--brass)] hover:text-gray-900 focus-visible:border-[var(--brass)] focus-visible:outline-none dark:border-gray-600 dark:text-gray-300 dark:hover:text-white";

/** The models of a family, each with its entries at their widths: the catalogue's (one per name) or the appliances. */
export function familyModels(family: UnitKind | "appliance" | "cap", wall = true): CatalogEntry[][] {
  // The dishwasher drawn with its integrated door, as on the run's strip.
  if (family === "appliance") return APPLIANCES.filter((a) => wall || a.kind !== "wall").map((a) => a.widths.map((width) => ({ ...itemEntry({ id: "", model: a.model, width }), ...(a.role === "dishwasher" ? { layout: "door" as const } : {}) })));
  // The casquettes in their own tab, beside « Hauts ».
  const models = CATALOG.filter((e) => (family === "cap" ? e.above : e.kind === family && !e.above));
  const groups = [...new Set(models.map((e) => e.name))].map((name) => CATALOG.filter((e) => e.name === name));
  // The fridge's surround among the columns too (made by the plan as one, sides, caisson and fridge).
  const surround = familyModels("appliance").filter((g) => g[0]!.id.startsWith("app-fridge-surround-")).map((g) => g.map((e) => ({ ...e, height: SURROUND.height })));
  return family === "tall" ? [...groups, ...surround] : groups;
}

/** Tabs of families: the one chosen underlined. */
export function familyTabs<F extends string>(families: [F, string][], chosen: F, choose: (f: F) => void, label = "Familles de meubles"): HTMLElement {
  return el(
    "div",
    { role: "tablist", "aria-label": label, class: "flex border-b border-gray-200 dark:border-gray-700" },
    ...families.map(([key, text]) => {
      const on = key === chosen;
      const tab = el("button", { type: "button", role: "tab", "aria-selected": String(on), class: `-mb-px flex-1 border-b-2 px-1 py-2 text-xs whitespace-nowrap transition-colors ${on ? "border-[var(--brass)] font-medium text-gray-900 dark:text-gray-50" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}` }, text);
      tab.addEventListener("click", () => choose(key));
      return tab;
    }),
  );
}

/** The size of a unit in words: « L 80 · H 87 · P 56 cm ». */
function sizes(e: CatalogEntry, unit: DisplayUnit): string {
  const number = (mm: number) => formatLength(mm, unit).replace(/\s?(mm|cm|m)$/, "");
  const kind = KINDS[e.kind];
  return `L ${number(e.width)} · H ${number(e.height ?? kind.height)} · P ${number(e.depth ?? kind.depth)} ${unit}`;
}

/** A model at a width of one's own (whole mm): one's own unit as it is, a model of the catalogue made at that width. */
export function entryAtWidth(e: CatalogEntry, width: number): CatalogEntry {
  return e.custom ? { ...e, width } : { ...e, id: `${modelOf(e)}-${width}`, width };
}

/** Widths of one's own: what they may be, and the room left on the run for this model (null: none to show). */
export interface FreeWidths {
  limits: (e: CatalogEntry) => [number, number];
  room?: (e: CatalogEntry) => number | null;
}

/** An appliance comes in the widths it is sold in; a fridge's surround is made to measure, as a unit. */
const isAppliance = (e: CatalogEntry) => e.id.startsWith("app-") && !e.id.startsWith("app-fridge-surround-");

/** « Autre… » (a width typed) and « Place libre » (the room left), after the widths of the model. */
function freeWidthButtons(usual: CatalogEntry, unit: DisplayUnit, add: (e: CatalogEntry) => void, show: (e: CatalogEntry) => void, free: FreeWidths): HTMLElement[] {
  const [min, max] = free.limits(usual);
  const out: HTMLElement[] = [];
  const room = free.room?.(usual);
  if (room != null && room >= min) {
    const width = Math.min(max, Math.floor(room + 1e-6));
    const label = formatLength(width, unit);
    const b = el("button", { type: "button", class: WIDTH, "data-width-room": usual.id, title: `Ajouter « ${usual.name} » à la largeur de la place libre : ${label}`, "aria-label": `Ajouter ${usual.name} à la place libre, ${label}` }, `Place libre · ${label.replace(/\s?(mm|cm|m|po)$/, "")}`);
    b.addEventListener("click", () => add(entryAtWidth(usual, width)));
    b.addEventListener("pointerenter", () => show(entryAtWidth(usual, width)));
    out.push(b);
  }
  const other = el("button", { type: "button", class: WIDTH, "data-width-other": usual.id, title: `Ajouter « ${usual.name} » à une autre largeur` }, "Autre…");
  other.addEventListener("click", () => {
    const input = el("input", { type: "text", inputmode: "decimal", class: "h-6 w-16 border border-[var(--brass)] bg-transparent px-1 font-mono text-2xs focus:outline-none", "aria-label": `Largeur de « ${usual.name} » (${UNIT_LABELS[unit]})`, placeholder: UNIT_LABELS[unit], "data-width-input": usual.id });
    const ok = el("button", { type: "button", class: WIDTH, "data-width-ok": usual.id }, "OK");
    const box = el("span", { class: "flex items-center gap-1" }, input, ok);
    const take = () => {
      const value = parseNumber(input.value);
      const width = value === null ? NaN : Math.round(fromDisplay(value, unit));
      if (!(width >= min && width <= max)) {
        input.setAttribute("aria-invalid", "true");
        input.title = `Entre ${formatLength(min, unit)} et ${formatLength(max, unit)}.`;
        input.classList.add("border-red-500");
        return;
      }
      // Out of the field first: the panel is not drawn again under a field being typed in.
      input.blur();
      add(entryAtWidth(usual, width));
    };
    input.addEventListener("input", () => {
      const value = parseNumber(input.value);
      if (value !== null && value > 0) show(entryAtWidth(usual, Math.round(fromDisplay(value, unit))));
    });
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") take();
      if (event.key === "Escape") box.replaceWith(other);
    });
    ok.addEventListener("click", take);
    other.replaceWith(box);
    input.focus();
  });
  out.push(other);
  return out;
}

/**
 * One model: its drawing and what it is, at the width under the pointer; a click on a width adds it. With `free`, a
 * width of one's own too (not for an appliance: its widths are those it is sold in).
 */
export function modelRow(entries: CatalogEntry[], unit: DisplayUnit, add: (e: CatalogEntry) => void, attr = "data-unit", free?: FreeWidths, depth?: CardDepth): HTMLElement {
  const usual = entries.find((e) => e.width === 600) ?? entries[Math.floor(entries.length / 2)]!;
  const art = el("div", { class: "flex h-[92px] items-end justify-center border-b border-gray-300 dark:border-gray-600" });
  const summary = el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" });
  const size = el("p", { class: "font-mono text-3xs text-gray-500 dark:text-gray-400", "data-unit-size": "" });
  const show = (e: CatalogEntry) => {
    art.innerHTML = elevation(e);
    summary.textContent = unitSummary(e);
    size.textContent = sizes(depth ? { ...e, depth: depth.value(e) } : e, unit);
  };
  show(usual);
  // Its depth typed (in the display unit), for all of the model or the next added (kitchen-model-depth.ts).
  const deep = depth && !isAppliance(usual) ? depthField(usual, unit, depth) : null;
  const widths = entries.map((e) => {
    const label = formatLength(e.width, unit);
    const b = el("button", { type: "button", class: WIDTH, title: `Ajouter « ${e.name} » de ${label}`, "aria-label": `Ajouter ${e.name} de ${label}`, [attr]: e.id }, label.replace(/\s?(mm|cm|m)$/, ""));
    b.addEventListener("click", () => add(e));
    for (const event of ["pointerenter", "focus"]) b.addEventListener(event, () => show(e));
    for (const event of ["pointerleave", "blur"]) b.addEventListener(event, () => show(usual));
    return b;
  });
  return el(
    "article",
    { class: "grid grid-cols-[92px_1fr] gap-3 border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-700", "data-model": usual.name },
    art,
    el("div", { class: "flex min-w-0 flex-col" }, el("h3", { class: "text-[13px] font-medium tracking-tight text-gray-900 dark:text-gray-50" }, usual.name), summary, size, deep, el("div", { class: "mt-auto flex flex-wrap gap-1 pt-1.5" }, ...widths, ...(free && !isAppliance(usual) ? freeWidthButtons(usual, unit, add, show, free) : []))),
  );
}

/** A card's depth: typed in the display unit, within what the model may be, Entrée or out of the field to keep it. */
function depthField(usual: CatalogEntry, unit: DisplayUnit, depth: CardDepth): HTMLElement {
  const [lo, hi] = depth.limits(usual);
  const input = el("input", { type: "text", inputmode: "decimal", class: "h-6 w-16 border border-gray-300 bg-transparent px-1 text-right font-mono text-2xs focus:border-[var(--brass)] focus:outline-none aria-invalid:border-red-500 dark:border-gray-600", value: formatLength(depth.value(usual), unit).replace(/\s?(mm|cm|m)$/, ""), "aria-label": `Profondeur de « ${usual.name} » (${UNIT_LABELS[unit]})`, "data-card-depth": modelOf(usual) });
  const take = () => {
    const value = parseNumber(input.value);
    const mm = value === null ? NaN : Math.round(fromDisplay(value, unit) * 10) / 10;
    const ok = mm >= lo && mm <= hi;
    input.setAttribute("aria-invalid", String(!ok));
    input.title = ok ? "" : `Entre ${formatLength(lo, unit)} et ${formatLength(hi, unit)}.`;
    if (ok && mm !== depth.value(usual)) depth.set(usual, mm);
  };
  input.addEventListener("change", take);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") input.blur();
  });
  return el("label", { class: "flex items-center gap-1.5 pt-1 text-2xs text-gray-500 dark:text-gray-400" }, `Profondeur (${UNIT_LABELS[unit]})`, input);
}

/**
 * A casquette of the catalogue (« Casquette relevante », « sur colonne ») chosen in a run of the Plan de cuisine: not a
 * unit of the run but the plan's casquette, in caissons with lift-up doors — one on each wall unit and column, as wide as
 * it (document/kitchen-cap.ts) — at the model's height.
 */
export async function capUnits(editor: Editor, planId: string, entry: CatalogEntry, waiting: boolean): Promise<void> {
  if (waiting) return editor.notify("Le linéaire est en train d'être enregistré : un instant, puis recommencez.", "info");
  const made = withKitchenBuilt(editor.doc, planId, { cap: "units", ...(entry.height ? { capHeight: entry.height } : {}), ...(entry.depth ? { capDepth: entry.depth } : {}) });
  if (typeof made === "string") return editor.notify(made, "error");
  await editor.change(made.doc);
  const what = "Casquette en caissons à porte relevante : un caisson sur chaque meuble haut et chaque colonne (à régler dans « Matières et finitions »).";
  editor.notify([what, ...made.problems].join(" "), made.problems.length ? "info" : "success");
}
