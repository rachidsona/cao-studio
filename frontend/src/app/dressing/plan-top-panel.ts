/**
 * « Surmeubles » dans le Plan de dressing : au-dessus de chaque zone faite (un angle compris), une rangée de caissons dans la
 * continuité de ses cases (document/plan-layout.ts, `withTopUnitsSet`) — leur hauteur, avec portes ou ouverts ; posés,
 * changés ou retirés en une annulation. Chacun est une Répartition gardée : « Modifier » l'ouvre dans son outil (cases,
 * portes, étagères), et ce qu'on y fait reste quand le plan change.
 */
import { topProblem, topStep, withTopUnitsSet } from "../../document/plan-layout";
import type { PlanZone } from "../../document/plan-shapes";
import type { DressingPlan } from "../../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { toolIcon } from "../../ui/icons";
import type { Editor } from "../editor";

/** The tools inside a Répartition of the plan (a zone, top units), each opened on it. */
const INSIDE_TOOLS: ["shelves" | "cloisons" | "drawers" | "door" | "rod", string, string, string][] = [
  ["shelves", "Étagères", "Ajouter, ôter ou répartir les étagères d'une niche", "i-shelves"],
  ["cloisons", "Cloisons", "Ajouter ou ôter des cloisons dans une niche", "i-cloisons"],
  ["drawers", "Tiroirs", "Mettre des tiroirs dans une niche, changer leur nombre", "i-drawers"],
  ["door", "Portes", "Une porte sur une ou plusieurs niches : pose, charnières (relevable aussi), style, poignée", "i-door-fronts"],
  ["rod", "Penderie", "Une tringle dans une niche", "i-rod"],
];

/** The row of these tools for the Répartition of sketch `sketch` (`before`: what is done first, a zone isolated). */
export function insideTools(label: string, key: string, sketch: string, editor: Editor, before: () => void): HTMLElement {
  return el("div", { class: "grid grid-cols-5 gap-1 border-t border-gray-100 pt-1.5 dark:border-gray-800", role: "group", "aria-label": `Dedans ${label}`, "data-zone-inside": key },
    ...INSIDE_TOOLS.map(([tool, name, title, icon]) => {
      const b = el("button", { type: "button", class: "flex min-w-0 flex-col items-center gap-0.5 rounded-sm px-0.5 py-1 text-3xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 [&_svg]:size-6", title, "aria-label": name, "data-zone-tool": tool }, toolIcon(icon, "tool-icon"), el("span", { class: "max-w-full truncate" }, name));
      b.addEventListener("click", () => {
        before();
        if (tool === "shelves" || tool === "cloisons") editor.sketches.startJoinery(tool, sketch);
        else editor.sketches.startEquip(tool, sketch);
      });
      return b;
    }));
}

const FIELD = "h-7 w-20 border border-gray-300 bg-white px-1 text-right text-xs dark:border-gray-600 dark:bg-gray-900";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export function topSection(planId: string, plan: DressingPlan, zones: PlanZone[], editor: Editor, redraw: () => void): HTMLElement[] {
  const unit = editor.unit;
  const now = plan.top;
  const height = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(now?.height ?? 400, unit), 3), "aria-label": `Hauteur des surmeubles (${UNIT_LABELS[unit]})`, "data-top-height": "" });
  const doors = el("select", { class: "h-7 border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Portes des surmeubles", "data-top-doors": "" },
    ...([["side", "Battantes"], ["lift", "Relevables (en haut)"], ["none", "Sans portes"]] as const).map(([v, t]) => el("option", { value: v, selected: v === (now ? (now.doors === "lift" ? "lift" : now.doors ? "side" : "none") : "side") }, t)));
  const apply = (top: DressingPlan["top"] | null) => {
    const problem = top ? topProblem(plan, top) : null;
    if (problem) return editor.notify(problem, "info");
    void editor.change(withTopUnitsSet(editor.doc, planId, top)).then(() => {
      editor.notify(top ? `Surmeubles posés : ${trim(toDisplay(top.height, unit), 3)} ${UNIT_LABELS[unit]} de haut, au-dessus de chaque mur et angle faits.` : "Surmeubles retirés.", "success");
      redraw();
    });
  };
  const read = (): DressingPlan["top"] | null => {
    const value = parseNumber(height.value);
    return value === null ? null : { height: fromDisplay(value, unit), doors: doors.value === "lift" ? "lift" : doors.value === "side" };
  };
  const put = el("button", { type: "button", class: WIDE, disabled: plan.roof !== undefined, "data-top-put": "" }, now ? "Mettre à jour les surmeubles" : "Poser les surmeubles");
  put.title = "Au-dessus de chaque mur fait, des caissons aux mêmes cases que ceux du dessous, posés sur eux";
  put.addEventListener("click", () => {
    const top = read();
    if (!top) return editor.notify("Saisissez la hauteur des surmeubles.", "info");
    apply(top);
  });
  const remove = now ? el("button", { type: "button", class: WIDE, "data-top-remove": "" }, "Retirer les surmeubles") : null;
  // Each one made: « Modifier » opens its Répartition (its cases), and its tools inside, as a zone's — doors over niches too.
  const rows = zones.flatMap((zone) => {
    const at = topStep(editor.doc, plan, zone.id);
    if (!at) return [];
    const name = `Surmeubles — ${zone.label.toLowerCase()}`;
    const open = el("button", { type: "button", class: "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-top-edit": zone.id, title: "Ouvrir ces surmeubles dans l'outil Répartition : cases, côtés, dimensions" }, "Modifier");
    open.addEventListener("click", () => editor.sketches.editOffset(at.sketch, at.step));
    return [el("div", { class: "space-y-1 border-t border-gray-100 pt-1.5 dark:border-gray-800", "data-top-row": zone.id }, el("div", { class: "flex min-h-8 items-center justify-between gap-2" }, name, open), insideTools(name, `top:${zone.id}`, at.sketch, editor, () => undefined))];
  });
  remove?.addEventListener("click", () => apply(null));
  const all: (HTMLElement | null)[] = [
    el("h3", { class: "panel-title", title: plan.roof ? "Sous un rampant, le dessus suit déjà le plafond." : "Des caissons au-dessus du dressing, dans la continuité de ses cases" }, "Surmeubles"),
    el("label", { class: "flex min-h-8 items-center justify-between gap-2" }, `Hauteur (${UNIT_LABELS[unit]})`, height),
    el("label", { class: "flex min-h-8 items-center justify-between gap-2" }, "Portes", doors),
    ...rows,
    put,
    remove,
  ];
  return all.filter((e): e is HTMLElement => e !== null);
}
