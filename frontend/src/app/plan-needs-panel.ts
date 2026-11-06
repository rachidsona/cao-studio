/**
 * « Selon les besoins » du Plan de dressing : ce que le client veut ranger, le bilan de ce que les zones libres en
 * contiendront, recalculé à chaque chiffre (document/dressing-needs.ts), puis les modules posés d'un coup.
 */
import { NO_NEEDS, proposeNeeds, withNeeds, type DressingNeeds, type NeedsProposal } from "../document/dressing-needs";
import { MODULES } from "../document/dressing-modules";
import { planZones } from "../document/plan-shapes";
import { zoneDone } from "../document/plan-layout";
import type { DressingPlan } from "../document/types";
import { parseNumber } from "../measurements/units";
import { el } from "../ui/dom";
import type { Editor } from "./editor";

const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900";
const FIELDS: [keyof DressingNeeds, string][] = [["longRod", "Penderie longue (m)"], ["shortRod", "Penderie courte (m)"], ["shoes", "Chaussures (paires)"], ["drawers", "Tiroirs"], ["shelves", "Étagères (m)"]];

/** Kept for the session: the last needs typed. */
let needs: DressingNeeds = { ...NO_NEEDS, longRod: 2, shortRod: 2, shoes: 20, drawers: 6, shelves: 4 };

const number = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function bilan(proposal: NeedsProposal): HTMLElement[] {
  const rows = proposal.report.map(({ label, asked, held, unit }) => el("li", { class: `flex justify-between gap-2 ${held + 1e-6 < asked ? "text-amber-700 dark:text-amber-300" : ""}` }, el("span", {}, label), el("span", { class: "font-mono" }, `${number(held)} / ${number(asked)}${unit ? ` ${unit}` : ""}`)));
  const plan = proposal.zones.map(({ zone, kinds }) => el("li", {}, `${zone.label} : ${kinds.map((k) => MODULES[k].label.split(" (")[0]!.toLowerCase()).join(", ")}`));
  return [
    el("ul", { class: "space-y-0.5", "aria-label": "Bilan des besoins" }, ...rows),
    el("ul", { class: "space-y-0.5 text-gray-600 dark:text-gray-300", "aria-label": "Modules proposés" }, ...plan),
    ...(proposal.left.length ? [el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, `Il manque de la place pour ${proposal.left.length} module${proposal.left.length > 1 ? "s" : ""} : réduisez les besoins ou allongez les murs.`)] : []),
  ];
}

export function needsPanel(planId: string, plan: DressingPlan, editor: Editor, done: () => void): HTMLElement[] {
  const free = planZones(plan).filter((z) => z.kind === "run" && !zoneDone(editor.doc, plan, z.id));
  const result = el("div", { class: "space-y-2", "data-needs-result": "" });
  const propose = () => proposeNeeds(needs, plan, free);
  const show = () => result.replaceChildren(...bilan(propose()));
  const inputs = FIELDS.map(([key, label]) => {
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: String(needs[key]).replace(".", ","), "aria-label": label });
    input.addEventListener("keydown", (event) => event.stopPropagation());
    input.addEventListener("input", () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && parsed >= 0;
      input.setAttribute("aria-invalid", String(!ok));
      if (!ok) return;
      needs = { ...needs, [key]: parsed };
      show();
    });
    return el("label", { class: "grid grid-cols-[9rem_1fr] items-center gap-1.5" }, label, input);
  });
  const apply = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: !free.length }, "Poser les modules");
  apply.addEventListener("click", () => {
    const proposal = propose();
    const made = withNeeds(editor.doc, planId, proposal, plan.thickness);
    if (typeof made === "string") return editor.notify(made, "error");
    void editor.change(made).then(() => {
      editor.notify(`Modules posés sur ${proposal.zones.length} zone${proposal.zones.length > 1 ? "s" : ""}.`, "success");
      done();
    });
  });
  const back = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
  back.addEventListener("click", done);
  show();
  return [
    el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Selon les besoins"),
    el("p", { class: "text-gray-600 dark:text-gray-300" }, free.length ? `Ce que le client veut ranger, réparti sur ${free.length} zone${free.length > 1 ? "s" : ""} libre${free.length > 1 ? "s" : ""}.` : "Aucune zone libre : les zones déjà faites ne changent pas."),
    ...inputs,
    result,
    el("div", { class: "flex gap-1.5 pt-0.5" }, back, apply),
  ];
}
