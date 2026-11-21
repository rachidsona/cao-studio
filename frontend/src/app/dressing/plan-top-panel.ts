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
import type { Editor } from "../editor";

const FIELD = "h-7 w-20 border border-gray-300 bg-white px-1 text-right text-xs dark:border-gray-600 dark:bg-gray-900";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export function topSection(planId: string, plan: DressingPlan, zones: PlanZone[], editor: Editor, redraw: () => void): HTMLElement[] {
  const unit = editor.unit;
  const now = plan.top;
  const height = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(now?.height ?? 400, unit), 3), "aria-label": `Hauteur des surmeubles (${UNIT_LABELS[unit]})`, "data-top-height": "" });
  const doors = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: now ? now.doors === true : true, "data-top-doors": "" });
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
    return value === null ? null : { height: fromDisplay(value, unit), doors: doors.checked };
  };
  const put = el("button", { type: "button", class: WIDE, disabled: plan.roof !== undefined, "data-top-put": "" }, now ? "Mettre à jour les surmeubles" : "Poser les surmeubles");
  put.title = "Au-dessus de chaque mur fait, des caissons aux mêmes cases que ceux du dessous, posés sur eux";
  put.addEventListener("click", () => {
    const top = read();
    if (!top) return editor.notify("Saisissez la hauteur des surmeubles.", "info");
    apply(top);
  });
  const remove = now ? el("button", { type: "button", class: WIDE, "data-top-remove": "" }, "Retirer les surmeubles") : null;
  // Each one made, opened in the tool of its Répartition: its cases, its doors, its shelves.
  const rows = zones.flatMap((zone) => {
    const at = topStep(editor.doc, plan, zone.id);
    if (!at) return [];
    const open = el("button", { type: "button", class: "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-top-edit": zone.id, title: "Ouvrir ces surmeubles dans l'outil Répartition : cases, portes, étagères" }, "Modifier");
    open.addEventListener("click", () => editor.sketches.editOffset(at.sketch, at.step));
    return [el("div", { class: "flex min-h-8 items-center justify-between gap-2" }, `Surmeubles — ${zone.label.toLowerCase()}`, open)];
  });
  remove?.addEventListener("click", () => apply(null));
  const all: (HTMLElement | null)[] = [
    el("h3", { class: "panel-title", title: plan.roof ? "Sous un rampant, le dessus suit déjà le plafond." : "Des caissons au-dessus du dressing, dans la continuité de ses cases" }, "Surmeubles"),
    el("label", { class: "flex min-h-8 items-center justify-between gap-2" }, `Hauteur (${UNIT_LABELS[unit]})`, height),
    el("label", { class: "flex min-h-8 items-center gap-2" }, doors, "Avec portes"),
    ...rows,
    put,
    remove,
  ];
  return all.filter((e): e is HTMLElement => e !== null);
}
