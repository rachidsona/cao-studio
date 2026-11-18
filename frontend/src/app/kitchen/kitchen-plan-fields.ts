/** The fields of the Plan de cuisine's form (kitchen-plan-tool.ts): a length, a setting on or off, a choice. */
import { KITCHEN_PLAN, type KitchenField } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

export type Sized = KitchenField | "lengthA" | "height" | "depth" | "wallDepth" | "worktopHeight" | "islandLength" | "islandDepth" | "passage" | "plinth" | "worktopThickness";
export type Switch = "wallUnits" | "appliances" | "fridge" | "ovenColumn" | "splashback" | "kick";

const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";

export function planFields(host: { plan(): KitchenFloorPlan; unit(): DisplayUnit; set(patch: Partial<KitchenFloorPlan>): void; draw(): void }) {
  const number = (label: string, key: Sized): HTMLElement => {
    const unit = host.unit();
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(host.plan()[key] ?? KITCHEN_PLAN[key] ?? 0, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && parsed > 0;
      input.setAttribute("aria-invalid", String(!ok));
      if (ok && fromDisplay(parsed, unit) !== host.plan()[key]) host.set({ [key]: fromDisplay(parsed, unit) });
    };
    input.addEventListener("change", apply);
    input.addEventListener("blur", () => host.draw());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        input.blur();
      }
    });
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
  };

  /** A setting on or off, as the Implantation's (an absent one at its usual value). */
  const check = (label: string, key: Switch): HTMLElement => {
    const box = el("input", { type: "checkbox", class: "size-4 shrink-0 accent-sky-600", checked: (host.plan()[key] ?? KITCHEN_PLAN[key]) === true, "data-plan-switch": key });
    box.addEventListener("change", () => host.set({ [key]: box.checked }));
    return el("label", { class: "flex min-h-7 items-center gap-2" }, box, label);
  };

  const select = (label: string, value: string, options: [string, string][], change: (v: string) => void): HTMLElement => {
    const choice = el("select", { class: SELECT, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
    choice.addEventListener("change", () => change(choice.value));
    return el("label", { class: ROW }, label, choice);
  };
  return { number, check, select };
}
