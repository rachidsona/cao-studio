/**
 * « Façades et intérieur » du meuble choisi sur un linéaire de cuisine (kitchen-run-editor.ts) : sans quitter le plan,
 * ses façades (ouvert, une porte, deux portes, tiroirs), le sens de la porte, son style, le nombre de tiroirs, un
 * tiroir au-dessus des portes, des tiroirs à l'anglaise derrière elles, ses étagères et ses cloisons, par des listes
 * et des boutons − / +. Ces choix sont gardés sur le meuble du linéaire, par-dessus ceux de son modèle
 * (features/kitchen-run-items.ts, `itemEntry`) : la bande le redessine et la cuisine est refaite avec. « Comme le
 * modèle » les ôte. Pour un intérieur différent d'une case à l'autre, « Aménager case par case » isole le meuble et
 * ouvre l'aménagement du dressing (app/cabinet-furnish.ts).
 */
import type { FrontStyle, KitchenRunItem } from "../../document/types";
import type { CatalogEntry } from "../../document/kitchen-catalog";
import { MAX_DIVIDERS, MIN_BAY } from "../../features/cabinet-parts";
import { styleChange, type DoorStyle } from "../../features/glass-door";
import { hasInside } from "../../features/kitchen-run-items";
import { el } from "../../ui/dom";
import { kitchenFromPlan, type KitchenRoomInfo } from "../../document/kitchen-plan-build";
import { findFeature } from "../../document/operations";
import type { KitchenFloorPlan } from "../../document/types";
import { furnishCabinet } from "../cabinet-furnish";
import type { Editor } from "../editor";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const SELECT = "h-7 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";
/** The height of the front of a drawer put over the doors (mm). */
const TOP_DRAWER = 150;

export interface InsideHost {
  item: KitchenRunItem;
  /** The item as it is built now: its model's entry with its own choices (`itemEntry`). */
  entry: CatalogEntry;
  replace(patch: Partial<KitchenRunItem>): void;
  /** Isolates the unit and opens its furnishing, case by case (none: not now — the kitchen is being made again). */
  furnish?: () => void;
}

/** The rows of « Façades et intérieur », or null for what has none (a filler, a dishwasher, a furnished caisson). */
export function insideRows(host: InsideHost): HTMLElement | null {
  const { item, entry, replace } = host;
  if (!hasInside(item)) return null;
  const select = (label: string, value: string, options: [string, string][], change: (v: string) => void, attr: string) => {
    const s = el("select", { class: SELECT, "aria-label": label, [attr]: "" }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
    s.addEventListener("change", () => change(s.value));
    return el("label", { class: ROW }, label, s);
  };
  /** A count set by − and +, between `min` and `max`. */
  const stepper = (label: string, value: number, [min, max]: [number, number], set: (n: number) => void, attr: string) => {
    const button = (text: string, to: number) => {
      const b = el("button", { type: "button", class: `${SMALL} w-7 px-0`, disabled: to < min || to > max, "aria-label": `${label} : ${text === "+" ? "un de plus" : "un de moins"}` }, text);
      b.addEventListener("click", () => set(to));
      return b;
    };
    return el("div", { class: ROW, [attr]: String(value) }, el("span", {}, label), el("div", { class: "flex items-center gap-1" }, button("−", value - 1), el("span", { class: "w-6 text-center font-mono" }, String(value)), button("+", value + 1)));
  };
  const layout = entry.layout;
  const doors = layout === "door" || layout === "doors";
  const dividers = entry.dividers ?? 0;
  const top = !!entry.topDrawer;
  // As many upright boards as leave each bay its least width (with 18 mm boards).
  const most = Math.max(0, Math.min(MAX_DIVIDERS, Math.floor((item.width - 36 - MIN_BAY) / (MIN_BAY + 18))));
  const style = item.facade?.style ?? entry.facade?.style ?? "flat";
  const side = item.side ?? entry.side ?? "left";
  const own = [item.layout, item.drawers, item.topDrawer, item.innerDrawers, item.shelves, item.dividers].some((v) => v !== undefined);
  const back = el("button", { type: "button", class: SMALL, disabled: !own, title: "Les façades et l'intérieur de son modèle", "data-inside-reset": "" }, "Comme le modèle");
  back.addEventListener("click", () => replace({ layout: undefined, drawers: undefined, topDrawer: undefined, innerDrawers: undefined, shelves: undefined, dividers: undefined }));
  const furnish = el("button", { type: "button", class: `${SMALL} w-full`, disabled: !host.furnish, title: "Isole ce meuble et l'aménage case par case : étagères, cloisons, tiroirs, penderie et portes différents d'une case à l'autre (clic droit dans une niche)", "data-inside-furnish": "" }, "Aménager case par case…");
  furnish.addEventListener("click", () => host.furnish?.());
  const rows: (HTMLElement | null)[] = [
    el("p", { class: "font-medium" }, "Façades et intérieur"),
    select("Façades", layout, [["none", "Sans (ouvert)"], ["door", "Une porte"], ["doors", "Deux portes"], ["drawers", "Tiroirs"]], (v) => replace({ layout: v as KitchenRunItem["layout"], ...(v === "drawers" ? { drawers: item.drawers ?? entry.drawers ?? 3 } : {}), ...(v !== "door" && (side === "top" || side === "bottom") ? { side: undefined } : {}) }), "data-inside-layout"),
    layout === "door" && !top ? select("Ouverture", side, [["left", "Charnières à gauche"], ["right", "Charnières à droite"], ["top", "Relevante (charnières en haut)"], ["bottom", "Abattant (charnières en bas)"]], (v) => replace({ side: v as KitchenRunItem["side"] }), "data-inside-side") : null,
    layout === "drawers" ? stepper("Tiroirs", entry.drawers ?? 3, [1, 8], (n) => replace({ drawers: n }), "data-inside-drawers") : null,
    layout !== "none" ? select("Style", style, [["flat", "Plates"], ["frame", "À cadre"], ["fluted", "Cannelées"], ["slats", "À tasseaux"], ["glass", "Vitrées (cadre alu)"]], (v) => replace({ facade: styleChange(v as DoorStyle, item.facade ?? entry.facade ?? {}) as FrontStyle }), "data-inside-style") : null,
    doors && !dividers && !(side === "top" || side === "bottom") ? select("Tiroir au-dessus", top ? "1" : "0", [["0", "Sans"], ["1", "Un tiroir, les portes dessous"]], (v) => replace({ topDrawer: v === "1" ? TOP_DRAWER : 0 }), "data-inside-top") : null,
    doors && !dividers ? stepper("À l'anglaise", entry.innerDrawers ?? 0, [0, 5], (n) => replace({ innerDrawers: n }), "data-inside-inner") : null,
    layout !== "drawers" ? stepper("Étagères", entry.shelves, [0, 8], (n) => replace({ shelves: n }), "data-inside-shelves") : null,
    layout !== "drawers" && !top && !entry.innerDrawers ? stepper("Cloisons", dividers, [0, most], (n) => replace({ dividers: n }), "data-inside-dividers") : null,
    layout === "drawers" ? el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "Des tiroirs sur toute la hauteur : ni étagère ni cloison.") : null,
    dividers ? el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "Avec des cloisons, les étagères sont recoupées case par case ; les tiroirs demandent l'aménagement case par case.") : null,
    el("div", { class: "flex justify-end" }, back),
    furnish,
  ];
  return el("div", { class: "space-y-1.5 border border-gray-200 p-1.5 dark:border-gray-700", "data-unit-inside": item.id }, ...rows.filter((r): r is HTMLElement => r !== null));
}

/** The cabinet the plan made for this item of the run, isolated and made a caisson to furnish case by case. */
export async function furnishItem(editor: Editor, plan: KitchenFloorPlan, runId: string, room: KitchenRoomInfo | undefined, itemId: string): Promise<void> {
  const units = kitchenFromPlan(plan, room).units.filter((u) => u.run === runId);
  const cabinets = (plan.made?.[runId] ?? []).filter((id) => findFeature(editor.doc, id)?.type === "cabinet");
  const cabinet = units.length === cabinets.length ? cabinets[units.findIndex((u) => u.item === itemId)] : undefined;
  if (!cabinet) return editor.notify("Ce meuble n'est pas encore bâti : attendez que la cuisine soit refaite, puis recommencez.", "info");
  await furnishCabinet(editor, cabinet);
}
