/**
 * « Portes et fenêtres » of a Plan de cuisine with no surveyed room (kitchen-plan-fields.ts `wallsCheck`): each door
 * or window on a wall of its room, where it is along that wall, its sizes — cut through the wall
 * (document/kitchen-plan-shell.ts `withOpenings`).
 */
import { OPENING } from "../../document/kitchen-plan-shell";
import type { DisplayUnit, KitchenFloorPlan, KitchenOpening } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-1.5 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-7 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const NAMES = { door: "Porte", window: "Fenêtre" } as const;

export function openingsFields(plan: KitchenFloorPlan, unit: DisplayUnit, setPlan: (patch: Partial<KitchenFloorPlan>) => void): HTMLElement {
  const list = plan.openings ?? [];
  const put = (i: number, patch: Partial<KitchenOpening> | null) => setPlan({ openings: list.flatMap((o, k) => (k !== i ? [o] : patch ? [{ ...o, ...patch }] : [])) });
  /** A size of the opening, typed in the project's unit. */
  const size = (label: string, i: number, key: "at" | "width" | "height" | "sill", zero = false) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(list[i]![key] ?? 0, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, "data-plan-opening-field": key });
    input.addEventListener("keydown", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      const v = parseNumber(input.value);
      const ok = v !== null && (v > 0 || (zero && v === 0));
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) put(i, { [key]: fromDisplay(v, unit) });
    });
    return el("label", { class: "flex flex-col gap-0.5 text-2xs text-gray-500 dark:text-gray-400" }, label, input);
  };
  const rows = list.map((o, i) => {
    const wall = el("select", { class: "h-7 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Mur", "data-plan-opening-wall": "" }, ...(["A", "B", "C", "D"] as const).map((w) => el("option", { value: w, selected: w === o.wall }, `Mur ${w}`)));
    wall.addEventListener("change", () => put(i, { wall: wall.value as KitchenOpening["wall"] }));
    const remove = el("button", { type: "button", class: BUTTON, "data-plan-opening-remove": "" }, "Retirer");
    remove.addEventListener("click", () => put(i, null));
    const from = o.wall === "A" || o.wall === "D" ? "Depuis le mur B" : "Depuis le mur A";
    return el("div", { class: "flex flex-col gap-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-plan-opening": o.kind },
      el("div", { class: "flex items-center gap-2" }, el("span", { class: "flex-1 text-xs font-medium" }, `${NAMES[o.kind]} ${i + 1}`), wall, remove),
      el("div", { class: "grid grid-cols-4 gap-1" }, size(from, i, "at", true), size("Largeur", i, "width"), size("Hauteur", i, "height"), o.kind === "window" ? size("Allège", i, "sill", true) : null));
  });
  const add = (kind: KitchenOpening["kind"]) => {
    const button = el("button", { type: "button", class: BUTTON, "data-plan-opening-add": kind }, `+ ${NAMES[kind]}`);
    button.addEventListener("click", () => setPlan({ openings: [...list, { ...OPENING[kind], wall: "A" }] }));
    return button;
  };
  return el("div", { class: "flex flex-col gap-1.5 py-1" },
    el("div", { class: "flex items-center gap-2" }, el("span", { class: "flex-1 text-xs", title: "Percées dans les murs de la pièce. Pour une pièce d'une autre forme, relevez-la avec l'outil Pièce." }, "Portes et fenêtres"), add("door"), add("window")),
    ...rows);
}
