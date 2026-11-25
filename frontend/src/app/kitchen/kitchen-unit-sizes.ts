/**
 * Les cotes du meuble choisi sur un linéaire de cuisine (kitchen-run-editor.ts) : sa largeur, sa hauteur (pas sous le
 * plan de travail) et sa profondeur, tapées dans l'unité du projet, dans ce qu'elles peuvent être, avec les largeurs
 * courantes à un clic et le retour aux cotes de son modèle.
 */
import type { CatalogEntry } from "../../document/kitchen-catalog";
import type { DisplayUnit, KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import { applianceOf, isFiller, itemSize, sizeLimits, SURROUND, surroundFridge, WIDTHS } from "../../features/kitchen-run-items";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";
const WIDTH = "h-6 min-w-7 border border-gray-200 px-1 font-mono text-2xs text-gray-600 hover:border-sky-500 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:text-white";

export interface SizeHost {
  item: KitchenRunItem;
  entry: CatalogEntry;
  /** The plan as it would be (the run's rest and corners chosen in its editor). */
  plan: KitchenFloorPlan;
  unit: DisplayUnit;
  replace(patch: Partial<KitchenRunItem>): void;
  redraw(): void;
}

/** A unit's width, height and depth, typed (in the display unit) within what it may be, with the usual widths a click away. */
export function sizeFields({ item, entry, plan, unit, replace, redraw }: SizeHost): HTMLElement[] {
  const size = itemSize(plan, item, entry);
  const limits = sizeLimits(plan, entry);
  const field = (label: string, key: "width" | "height" | "depth" | "fridge", value: number, [lo, hi]: [number, number]) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, "data-size": key });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
      const ok = mm >= lo && mm <= hi;
      input.setAttribute("aria-invalid", String(!ok));
      input.title = ok ? "" : `De ${formatLength(lo, unit)} à ${formatLength(hi, unit)}.`;
      if (ok && mm !== value) replace({ [key]: mm });
    };
    input.addEventListener("change", apply);
    input.addEventListener("blur", () => redraw());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        input.blur();
      }
    });
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
  };
  // A filler: its width only.
  if (isFiller(item)) return [field("Largeur", "width", item.width, limits.width)];
  const usual = el(
    "div",
    { class: "flex flex-wrap justify-end gap-1", "aria-label": "Largeurs courantes" },
    ...(applianceOf(item)?.widths ?? WIDTHS).map((w) => {
      const b = el("button", { type: "button", class: `${WIDTH} ${w === item.width ? "border-sky-500 text-gray-900 dark:text-white" : ""}`, "data-width": String(w) }, formatLength(w, unit).replace(/\s?(mm|cm|m)$/, ""));
      b.addEventListener("click", () => replace({ width: w }));
      return b;
    }),
  );
  // A fridge's surround: its fridge's height too, its caisson taking the rest.
  const fridge = applianceOf(item)?.role === "fridge-surround" ? [field("Hauteur du réfrigérateur", "fridge", surroundFridge(plan, item), [SURROUND.lowest, size.height - SURROUND.air - SURROUND.least])] : [];
  const own = item.height !== undefined || item.depth !== undefined || item.fridge !== undefined;
  const reset = el("button", { type: "button", class: SMALL, disabled: !own, title: "La hauteur et la profondeur du modèle et du plan" }, "Cotes du modèle");
  reset.addEventListener("click", () => replace({ height: undefined, depth: undefined, fridge: undefined }));
  // A second door on its left or right side, that side without its board (not for a fridge's surround).
  const side = el("select", { class: FIELD.replace("text-right font-mono", ""), "aria-label": "Porte de côté", "data-side-door": "" }, ...([["", "Aucune"], ["left", "À gauche"], ["right", "À droite"]] as const).map(([v, text]) => el("option", { value: v, selected: v === (item.sideDoor ?? "") }, text)));
  side.addEventListener("change", () => replace({ sideDoor: side.value === "left" || side.value === "right" ? side.value : undefined }));
  const sideRow = applianceOf(item) ? null : el("label", { class: ROW }, "Porte de côté", side);
  return [
    field("Largeur", "width", item.width, limits.width),
    usual,
    limits.height ? field("Hauteur", "height", size.height, limits.height) : el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, `Hauteur ${formatLength(size.height, unit)} : celle du plan de travail.`),
    ...fridge,
    field("Profondeur", "depth", size.depth, limits.depth),
    ...(sideRow ? [sideRow] : []),
    el("div", { class: "flex justify-end" }, reset),
  ];
}
