/** The fields of the Plan de cuisine's form (kitchen-plan-tool.ts): a length, a setting on or off, a choice. */
import { CAP, KITCHEN_PLAN, type KitchenField } from "../../document/kitchen-plan-shapes";
import type { DisplayUnit, KitchenFloorPlan } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { lookPicker } from "./look-picker";
import { kitchenWallsShown, withKitchenWalls } from "../../document/kitchen-walls";
import type { Editor } from "../editor";


export type Sized = KitchenField | "lengthA" | "height" | "depth" | "wallDepth" | "wallGap" | "worktopHeight" | "islandLength" | "islandDepth" | "passage" | "plinth" | "worktopThickness" | "capThickness" | "capHeight" | "capOverhang" | "capDepth" | "baseDepth" | "islandShift";
export type Switch = "wallUnits" | "appliances" | "fridge" | "ovenColumn" | "splashback" | "kick" | "endPanels" | "splashbackHoodOnly" | "asCaissons";

const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";

export function planFields(host: { plan(): KitchenFloorPlan; unit(): DisplayUnit; set(patch: Partial<KitchenFloorPlan>): void; draw(): void }) {
  /** `usual`: its value when not set; `zero`: 0 is a value it may take. */
  /** `zero`: none is a value too; `signed`: so is less than none (the island, off the middle one way or the other). */
  const number = (label: string, key: Sized, usual = 0, zero = false, signed = false): HTMLElement => {
    const unit = host.unit();
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(host.plan()[key] ?? KITCHEN_PLAN[key] ?? usual, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && (signed || parsed > 0 || (zero && parsed === 0));
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
   * The worktop in one field: its look, each shown by its sphere (look-picker.ts), or its material's own; and, in the
   * same menu, the material it is cut from and priced at — said on the closed menu beside the look.
   */
  const look = (materials: [string, string][]): HTMLElement => {
    const material = host.plan().worktopMaterial ?? "solid-oak";
    const quote = select("Matière (débit et devis)", material, materials, (v) => host.set({ worktopMaterial: v }));
    quote.querySelector("select")!.setAttribute("data-worktop-material", "");
    return lookPicker({ label: "Plan de travail", value: host.plan().worktopLook, set: (id) => host.set({ worktopLook: id }), attr: "worktop", note: `devis : ${materials.find(([id]) => id === material)?.[1] ?? material}`, first: quote });
  };
  /** The casquette of the wall units (document/kitchen-cap.ts): none, a plain panel, a caisson or caissons with lift-up doors, and its sizes. */
  const cap = (): HTMLElement[] => {
    const kind = host.plan().cap;
    const choice = select("Casquette des meubles hauts", kind ?? "none", [["none", "Aucune"], ["flat", "Plate (un panneau épais)"], ["box", "En caisson (dessus et bandeau)"], ["units", "Caissons à porte relevante (sur-meubles)"]], (v) => host.set({ cap: v === "none" ? undefined : (v as "flat" | "box" | "units") }));
    choice.querySelector("select")!.setAttribute("data-plan-cap", "");
    if (!kind) return [choice];
    // Caissons: their height and depth (each as wide as the unit under it).
    if (kind === "units") return [choice, number("Hauteur des caissons", "capHeight", CAP.unit), number("Profondeur des caissons", "capDepth", CAP.unitDepth)];
    // Its depth off the wall, the same everywhere (58 cm: as the columns); 0: as the units under it, plus the overhang.
    return [choice, kind === "box" ? number("Hauteur de la casquette", "capHeight", CAP.height) : number("Épaisseur de la casquette", "capThickness", CAP.thickness), number("Débord de la casquette", "capOverhang", CAP.overhang, true), number("Profondeur de la casquette (0 : celle des meubles)", "capDepth", 0, true)];
  };
  return { number, check, select, look, cap };
}

/**
 * « Murs de la pièce »: the plan's walls shown or hidden — those of its room right away (document/kitchen-walls.ts),
 * or, with none, those it draws, as its other settings (`plan`: the plan as being set, `setPlan` its change).
 */
export function wallsCheck(editor: Editor, planId: string | undefined, plan: KitchenFloorPlan, setPlan: (patch: Partial<KitchenFloorPlan>) => void, done: () => void): HTMLElement {
  const roomed = !!planId && !!plan.room;
  const box = el("input", { type: "checkbox", class: "size-4 shrink-0 accent-sky-600", checked: roomed ? kitchenWallsShown(editor.doc, planId!) : plan.noWalls !== true, "data-plan-walls": "" });
  box.addEventListener("change", () => {
    if (!roomed) return setPlan({ noWalls: !box.checked });
    const made = withKitchenWalls(editor.doc, planId!, box.checked);
    if (typeof made === "string") return editor.notify(made, "error");
    void editor.change(made).then(done);
  });
  const walls = el("label", { class: "flex min-h-7 items-center gap-2", title: "Décochée : les murs de la pièce sont cachés, sans être supprimés. Cochée : ils reviennent, même supprimés." }, box, "Murs de la pièce");
  if (roomed) return walls;
  // Its own room, closed round its walls (document/kitchen-plan-shell.ts): with its walls only.
  const closed = el("input", { type: "checkbox", class: "size-4 shrink-0 accent-sky-600", checked: plan.noRoom !== true, disabled: plan.noWalls === true, "data-plan-room": "" });
  closed.addEventListener("change", () => setPlan({ noRoom: !closed.checked }));
  return el("div", {}, walls, el("label", { class: "flex min-h-7 items-center gap-2", title: "Cochée : la pièce est fermée autour de la cuisine — les murs qui manquent, un sol et un plafond —, et la vue se place à l'intérieur. Décochée : seuls les murs derrière les linéaires." }, closed, "Pièce fermée (sol, plafond, murs d'en face)"));
}
