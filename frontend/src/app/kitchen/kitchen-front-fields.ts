/**
 * Les façades de toute la cuisine, dans « Matières et finitions » du Plan de cuisine (kitchen-plan-tool.ts) : leur
 * pose (en applique ou encastrées), leur style (plate, à cadre, rainurée, à lattes, vitrée), leurs poignées (avec,
 * sans, sur profil gorge), la couleur de leur laque, leur épaisseur et leur jeu (`KitchenFloorPlan.frontLook`). Le
 * style ou les poignées donnés à un meuble seul (outil Façades, dans la 3D) passent avant.
 */
import type { DisplayUnit, KitchenFloorPlan, KitchenFrontLook } from "../../document/types";
import { DECOR_LABELS } from "../../features/door-decor";
import { styleChange, type DoorStyle } from "../../features/glass-door";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";

const SELECT = "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";
/** The fronts' usual thickness and gap (mm), as the plan makes them. */
export const FRONT_LOOK = { thickness: 19, gap: 3 };

export function frontFields(plan: KitchenFloorPlan, unit: DisplayUnit, set: (patch: Partial<KitchenFloorPlan>) => void): HTMLElement[] {
  const look = plan.frontLook ?? {};
  const put = (patch: Partial<KitchenFrontLook>) => {
    const next = Object.fromEntries(Object.entries({ ...look, ...patch }).filter(([, v]) => v !== undefined)) as KitchenFrontLook;
    set({ frontLook: Object.keys(next).length ? next : undefined });
  };
  const select = (label: string, attr: string, value: string, options: [string, string][], change: (v: string) => void) => {
    const choice = el("select", { class: SELECT, "aria-label": label, [`data-front-${attr}`]: "" }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
    choice.addEventListener("change", () => change(choice.value));
    return el("label", { class: ROW }, label, choice);
  };
  const length = (label: string, attr: string, value: number, [lo, hi]: [number, number], change: (mm: number) => void) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, [`data-front-${attr}`]: "" });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
      const ok = mm >= lo && mm <= hi;
      input.setAttribute("aria-invalid", String(!ok));
      input.title = ok ? "" : `De ${trim(toDisplay(lo, unit), 4)} à ${trim(toDisplay(hi, unit), 4)} ${UNIT_LABELS[unit]}.`;
      if (ok && mm !== value) change(mm);
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") apply();
    });
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
  };
  const color = el("input", { type: "color", class: "h-8 w-12 shrink-0 cursor-pointer border border-gray-300 dark:border-gray-600", value: look.color ?? "#f2efe8", "aria-label": "Couleur de laque des façades", "data-front-color": "" });
  color.addEventListener("change", () => put({ color: color.value }));
  const plain = el("button", { type: "button", class: "h-8 border border-gray-300 px-2 text-xs hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800", disabled: !look.color, title: "Les façades dans la couleur de leur matière", "data-front-color-clear": "" }, "Celle de la matière");
  plain.addEventListener("click", () => put({ color: undefined }));
  return [
    el("h4", { class: "pt-1 text-2xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Façades de toute la cuisine"),
    select("Pose", "mount", look.mount ?? "overlay", [["overlay", "En applique (devant le caisson)"], ["inset", "Encastrées (dans le caisson)"]], (v) => put({ mount: v === "inset" ? "inset" : undefined })),
    select("Style", "style", look.style?.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre (panneau en retrait)"], ...DECOR_LABELS, ["glass", "Vitrée (cadre alu)"]], (v) => put({ style: v === "flat" ? undefined : styleChange(v as DoorStyle, {}) })),
    select("Poignées", "handles", look.handles ?? "on", [["on", "Avec poignées"], ["gorge", "Sans, sur profil gorge"], ["none", "Sans poignée (pousser-ouvrir)"]], (v) => put({ handles: v === "none" || v === "gorge" ? v : undefined })),
    el("div", { class: ROW }, el("span", {}, "Couleur (laque)"), el("div", { class: "flex items-center gap-1.5" }, color, plain)),
    length("Épaisseur", "thickness", look.thickness ?? FRONT_LOOK.thickness, [10, 40], (mm) => put({ thickness: mm === FRONT_LOOK.thickness ? undefined : mm })),
    length("Jeu", "gap", look.gap ?? FRONT_LOOK.gap, [0, 6], (mm) => put({ gap: mm === FRONT_LOOK.gap ? undefined : mm })),
  ];
}
