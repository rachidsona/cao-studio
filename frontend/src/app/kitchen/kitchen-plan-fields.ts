/** The fields of the Plan de cuisine's form (kitchen-plan-tool.ts): a length, a setting on or off, a choice. */
import { KITCHEN_PLAN, type KitchenField } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { APPEARANCES, CATEGORIES, type Appearance, type CategoryId } from "../../appearance/library";
import { swatch } from "../../appearance/swatches";

/** The families offered, marbles and Dekton first. */
const LOOKS: CategoryId[] = ["stone", "sintered", "concrete", "wood"];

export type Sized = KitchenField | "lengthA" | "height" | "depth" | "wallDepth" | "worktopHeight" | "islandLength" | "islandDepth" | "passage" | "plinth" | "worktopThickness";
export type Switch = "wallUnits" | "appliances" | "fridge" | "ovenColumn" | "splashback" | "kick" | "endPanels";

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
  /**
   * The worktop's look, from the library's stones, Dekton, concretes and woods, or its material's own: each shown by
   * its sphere (appearance/swatches.ts), drawn when the list is first opened.
   */
  const look = (): HTMLElement => {
    const value = host.plan().worktopLook;
    const chosen = APPEARANCES.find((a) => a.id === value);
    const ball = (a: Appearance | undefined, size: string) => {
      const image = el("img", { alt: "", class: `${size} shrink-0 rounded-full bg-gray-100 dark:bg-gray-800`, draggable: "false" });
      if (a) image.style.background = a.color;
      return { image, draw: () => a && void swatch(a).then((url) => url && (image.src = url)) };
    };
    const pick = (a: Appearance | undefined, label: string) => {
      const b = ball(a, "aspect-square w-full");
      const button = el("button", { type: "button", class: `flex min-w-0 flex-col items-center gap-0.5 p-1 text-center hover:bg-sky-50 dark:hover:bg-sky-950 ${(a?.id ?? undefined) === value ? "ring-2 ring-sky-500" : ""}`, title: label, "aria-pressed": String((a?.id ?? undefined) === value), "data-worktop-look": a?.id ?? "" }, b.image, el("span", { class: "line-clamp-2 w-full text-3xs leading-tight" }, label));
      button.addEventListener("click", () => host.set({ worktopLook: a?.id }));
      return { category: a?.category, button, draw: b.draw };
    };
    const tiles = [pick(undefined, "Celui de la matière"), ...APPEARANCES.filter((a) => LOOKS.includes(a.category)).map((a) => pick(a, a.name))];
    const grid = (category: CategoryId | undefined) => el("div", { class: "grid grid-cols-4 gap-1" }, ...tiles.filter((t) => t.category === category).map((t) => t.button));
    const families = [grid(undefined), ...LOOKS.map((id) => CATEGORIES.find((c) => c.id === id)!).flatMap((c) => [el("p", { class: "pt-1 text-2xs font-semibold text-gray-600 dark:text-gray-300" }, c.name), grid(c.id)])];
    const current = ball(chosen, "size-6");
    current.draw();
    const list = el("details", { class: "border border-gray-300 dark:border-gray-600", "data-worktop-looks": "" },
      el("summary", { class: "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs", "aria-label": "Aspect du plan de travail" }, current.image, chosen?.name ?? "Celui de la matière"),
      el("div", { class: "max-h-80 space-y-1 overflow-y-auto p-1" }, ...families));
    list.addEventListener("toggle", () => list.open && tiles.forEach((t) => t.draw()));
    return el("div", { class: "space-y-1" }, el("p", {}, "Aspect du plan de travail"), list);
  };
  return { number, check, select, look };
}
