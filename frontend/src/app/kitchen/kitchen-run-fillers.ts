/**
 * Les fileurs posés à la main sur un linéaire : en bas (entre socle et plan de travail) et en haut (la rangée haute),
 * au début de la rangée, après le meuble choisi ou à la fin, à la largeur tapée. Ils prennent leur place comme un
 * meuble ; le reste du mur est toujours partagé. Puis la liste de ceux qui sont posés, chacun avec son bouton pour
 * l'ôter ; et tous les fileurs du linéaire, ceux du plan compris (angle, reste du mur), avec leur largeur, leur hauteur,
 * leur épaisseur et leur matière.
 */
import { kitchenPlanIn } from "../../document/kitchen-floor";
import { kitchenFromPlan } from "../../document/kitchen-plan-build";
import { kitchenRoomInfo } from "../../document/kitchen-plan-room";
import { bodyInfo, materialById } from "../../document/materials";
import type { CadDocument, DisplayUnit, KitchenRunItem } from "../../document/types";
import { FILLER, FILLER_WALL, insertItem, isFiller, isSpace, itemEntry, newItem, rowOf, type RunFill } from "../../features/kitchen-run-items";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { gapsAsItems } from "../../features/kitchen-run-gaps";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";

export interface FillerHost {
  /** The document, its plan and the run: every filler of the run, with its sizes and its material. */
  doc: CadDocument;
  planId: string;
  runId: string;
  items: KitchenRunItem[];
  chosen: string | null;
  /** The run has a wall row. */
  wall: boolean;
  unit: DisplayUnit;
  /** The width of the next filler (mm), kept from one to the next. */
  width: number;
  setWidth(mm: number): void;
  change(items: KitchenRunItem[], chosen: string | null): void;
  notify(message: string, kind: "error"): void;
}

export function fillerRows(host: FillerHost): HTMLElement[] {
  const { unit, items } = host;
  let width = host.width;
  const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(width, unit), 4), "aria-label": `Largeur du fileur (${UNIT_LABELS[unit]})`, "data-filler-width": "" });
  const read = () => {
    const parsed = parseNumber(input.value);
    const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
    const ok = mm >= 10 && mm <= 300;
    input.setAttribute("aria-invalid", String(!ok));
    if (ok) host.setWidth((width = mm));
    return ok;
  };
  input.addEventListener("change", read);
  input.addEventListener("keydown", (event) => event.stopPropagation());
  const chosen = items.find((i) => i.id === host.chosen);
  const rows: ["base" | "wall", string][] = [["base", "En bas"], ...(host.wall ? ([["wall", "En haut"]] as ["wall", string][]) : [])];
  return [
    el("label", { class: ROW }, `Largeur (${UNIT_LABELS[unit]})`, input),
    el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "De 1 à 30 cm. Un fileur posé se règle en le cliquant sur la bande, et se supprime dans la liste ci-dessous."),
    ...rows.map(([row, label]) => {
      const model = row === "wall" ? FILLER_WALL : FILLER;
      const put = (where: "start" | "after" | "end") => {
        if (!read()) return host.notify("Un fileur fait de 1 à 30 cm.", "error");
        const item = newItem(items, model, width);
        const first = items.findIndex((i) => rowOf(itemEntry(i)) === row);
        const next = where === "start" ? [...items.slice(0, first < 0 ? items.length : first), item, ...items.slice(first < 0 ? items.length : first)] : insertItem(items, item, where === "after" ? host.chosen : null);
        host.change(next, item.id);
      };
      const button = (where: "start" | "after" | "end", text: string, disabled = false) => {
        const b = el("button", { type: "button", class: `${SMALL} flex-1`, disabled, "data-filler-add": `${row}:${where}` }, text);
        b.addEventListener("click", () => put(where));
        return b;
      };
      const after = !!chosen && rowOf(itemEntry(chosen)) === row;
      return el("div", { class: "space-y-1" }, el("p", { class: "font-medium" }, label), el("div", { class: "flex gap-1" }, button("start", "Au début"), button("after", "Après le choisi", !after), button("end", "À la fin")));
    }),
    placedFillers(host),
    fillerTable(host),
  ];
}

/** A filler of the run, as built: its name, its width along the run, its height, its thickness (mm), its material. */
export interface FillerData {
  name: string;
  width: number;
  height: number;
  thickness: number;
  material: string;
}

/** Every filler of a run, the plan's own (corner, rest of the wall) and those put by hand, as the 3D has them. */
export function runFillers(doc: CadDocument, planId: string, runId: string): FillerData[] {
  const plan = kitchenPlanIn(doc, planId);
  if (!plan) return [];
  const made = doc.features.filter((f) => plan.made?.[runId]?.includes(f.id));
  return kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).boxes.filter((b) => b.kind === "filler" && b.run === runId).map((b) => {
    const [dx, dy, dz] = [0, 1, 2].map((i) => Math.abs(b.to[i]! - b.from[i]!));
    const feature = made.find((f) => f.name === b.name);
    const id = feature ? bodyInfo(doc, feature.id).material : undefined;
    return { name: b.name, width: Math.max(dx!, dy!), height: dz!, thickness: Math.min(dx!, dy!), material: materialById(id)?.name ?? id ?? "celle des façades" };
  });
}

/** The fillers of the run with all their sizes and their material. */
function fillerTable(host: FillerHost): HTMLElement {
  const list = runFillers(host.doc, host.planId, host.runId);
  const size = (mm: number) => formatLength(mm, host.unit);
  if (!list.length) return el("p", { class: "text-2xs text-gray-500 dark:text-gray-400", "data-fillers-all": "0" }, "Aucun fileur sur ce linéaire.");
  return el(
    "div",
    { class: "space-y-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-fillers-all": String(list.length) },
    el("p", { class: "font-medium" }, "Tous les fileurs du linéaire"),
    ...list.map((f) => el("div", { class: "text-2xs", "data-filler-data": f.name }, el("p", { class: "font-medium" }, f.name), el("p", { class: "font-mono text-gray-600 dark:text-gray-300" }, `L ${size(f.width)} · H ${size(f.height)} · ép. ${size(f.thickness)}`), el("p", { class: "text-gray-500 dark:text-gray-400" }, `Matière : ${f.material}`))),
  );
}

/** The fillers put by hand on this run, each with its button to take it out, and one to take them all out. */
function placedFillers(host: FillerHost): HTMLElement {
  const { unit, items } = host;
  // Low ones first, then up, each in its order along the run.
  const hand = (i: KitchenRunItem) => isFiller(i) && !isSpace(i);
  const placed = [...items.filter((i) => hand(i) && rowOf(itemEntry(i)) !== "wall"), ...items.filter((i) => hand(i) && rowOf(itemEntry(i)) === "wall")];
  if (!placed.length) return el("p", { class: "text-2xs text-gray-500 dark:text-gray-400", "data-fillers-placed": "0" }, "Aucun fileur posé sur ce linéaire.");
  const remove = (ids: string[]) => host.change(items.filter((i) => !ids.includes(i.id)), ids.includes(host.chosen ?? "") ? null : host.chosen);
  const rows = placed.map((item) => {
    const row = rowOf(itemEntry(item));
    const same = items.filter((i) => rowOf(itemEntry(i)) === row);
    const where = `${row === "wall" ? "Haut" : "Bas"} · ${formatLength(item.width, unit)} · place ${same.indexOf(item) + 1}/${same.length}`;
    const b = el("button", { type: "button", class: SMALL, "data-filler-remove": item.id, title: "Supprimer ce fileur" }, "Supprimer");
    b.addEventListener("click", () => remove([item.id]));
    return el("div", { class: `flex items-center gap-1 ${item.id === host.chosen ? "text-sky-700 dark:text-sky-300" : ""}` }, el("span", { class: "flex-1" }, where), b);
  });
  const all = el("button", { type: "button", class: `${SMALL} w-full`, "data-filler-remove-all": "" }, placed.length > 1 ? `Supprimer les ${placed.length} fileurs` : "Supprimer le fileur");
  all.addEventListener("click", () => remove(placed.map((i) => i.id)));
  return el("div", { class: "space-y-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-fillers-placed": String(placed.length) }, el("p", { class: "font-medium" }, "Fileurs posés"), ...rows, all);
}

/**
 * The fillers the plan puts in the room left over made ones put by hand, all of them so that the rest shared out moves
 * none (features/kitchen-run-gaps.ts); `gap` (along the run) is the one clicked, then chosen: moved, sized or taken
 * out as a unit is. Taken out, the room it closed is closed again by the plan.
 */
export function fillerFromGap(items: readonly KitchenRunItem[], fill: RunFill, gap: [number, number]): { items: KitchenRunItem[]; id: string } {
  const made = gapsAsItems(items, fill);
  const k = fill.fillers.findIndex(([a, b]) => Math.abs(a - gap[0]) < 1 && Math.abs(b - gap[1]) < 1);
  return { items: made.items, id: made.ids[k] ?? "" };
}
