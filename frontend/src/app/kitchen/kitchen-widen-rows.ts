/**
 * « Place libre » d'un linéaire de cuisine : combler le vide d'une rangée en prolongeant un de ses meubles, choisi dans
 * la liste (features/kitchen-run-widen.ts). Une ligne par rangée qui a un reste à combler.
 */
import { kitchenSizes, type RunGeometry } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { fillRun, itemEntry } from "../../features/kitchen-run-items";
import { restToFill, widenable, widenedToFill } from "../../features/kitchen-run-widen";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const SELECT = "h-7 w-full min-w-0 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";

export interface WidenHost {
  /** The plan as it would be, and the run's geometry so. */
  plan: KitchenFloorPlan;
  geometry: RunGeometry;
  items: KitchenRunItem[];
  unit: DisplayUnit;
  change(items: KitchenRunItem[], chosen: string): void;
  notify(message: string): void;
}

export function widenRows(host: WidenHost): HTMLElement | null {
  const { plan, geometry: g, items, unit } = host;
  const s = kitchenSizes(plan);
  const heights = { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop };
  const fill = fillRun(g, items, heights);
  const rows = (["base", "wall"] as const).flatMap((row) => {
    const rest = restToFill(g, fill, row);
    const units = [...fill.placed, ...fill.spaces].filter((pl) => pl.row === row && widenable(pl.item)).sort((a, b) => a.at - b.at);
    if (rest < 1 || !units.length) return [];
    const pick = el("select", { class: SELECT, "aria-label": `Meuble ${row === "wall" ? "haut" : "bas"} à prolonger`, "data-widen-pick": row }, ...units.map((pl) => el("option", { value: pl.item.id }, `${pl.item.furnished ? "Caisson aménagé" : itemEntry(pl.item).name} · ${formatLength(pl.item.width, unit)}`)));
    const go = el("button", { type: "button", class: SMALL, "data-widen": row, title: `Il s'élargit de ${formatLength(rest, unit)} au plus (ses limites), ses voisins se poussent : plus de vide ni de fileur` }, "Prolonger");
    go.addEventListener("click", () => {
      const made = widenedToFill(plan, g, items, heights, pick.value);
      if (typeof made === "string") return host.notify(made);
      host.change(made.items, pick.value);
    });
    return [el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, `${row === "wall" ? "En haut" : "En bas"}, ${formatLength(rest, unit)} à combler :`), el("div", { class: "flex gap-1" }, pick, go)];
  });
  if (!rows.length) return null;
  return el("div", { class: "space-y-1 pt-1", "data-widen-rows": "" }, el("p", { class: "font-medium" }, "Combler le vide en prolongeant un meuble"), ...rows);
}
