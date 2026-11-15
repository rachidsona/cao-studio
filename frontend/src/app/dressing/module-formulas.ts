/**
 * La section « Formules » de l'outil Module (module-tool.ts) : les paramètres du module, les conditions qui choisissent
 * un autre module selon la niche, une formule pour chaque cote qu'on veut calculée (document/module-program.ts), et
 * l'aperçu du résultat sur la niche choisie, refait à chaque lettre tapée ; une formule qui ne se lit pas est dite en
 * français, citée. Une formule laissée vide garde la cote du panneau.
 */
import { MODULES, type ModuleKind } from "../../document/dressing-modules";
import { evaluateFormula, FORMULA_FUNCTIONS, parseFormula } from "../../document/module-formula";
import {
  formulasOf,
  nicheMeasures,
  paramProblem,
  programNames,
  programProblem,
  resolveProgram,
  TARGETS,
  VARIABLES,
  type FormulaTarget,
  type ModuleProgram,
  type NicheVariables,
} from "../../document/module-program";
import type { DisplayUnit } from "../../document/types";
import { formatLength, parseNumber, toDisplay, trim } from "../../measurements/units";
import { openCalculator } from "../../ui/calculator";
import { el } from "../../ui/dom";
import { FIELD, ROW, SMALL } from "./module-options";

/** What the formulas add to a module: changed in place by the section. */
export type ProgramPart = Pick<ModuleProgram, "params" | "rules" | "formulas">;

export const emptyProgram = (): ProgramPart => ({ params: [], rules: [], formulas: {} });

export interface FormulaSection {
  /** The program as it would be laid now; none: the module is fixed. */
  program: ModuleProgram | null;
  /** The niche the result is shown on. */
  niche: NicheVariables | null;
  unit: DisplayUnit;
  /** Formulas given to a module that had none. */
  open(): void;
  /** Back to a fixed module. */
  close(): void;
  /** The program changed (in place). */
  changed(): void;
  /** A field left: the panel drawn again. */
  redraw(): void;
}

/** The section in a card of its own: told apart from the module's other settings at a glance. */
const CARD = "space-y-1.5 border border-l-4 border-violet-300 border-l-violet-500 bg-violet-50/70 p-2 dark:border-violet-800 dark:border-l-violet-400 dark:bg-violet-950/40";

/** The card's title: a « ƒx » mark and « Formules », with what goes on its right. */
function cardTitle(...right: HTMLElement[]): HTMLElement {
  const mark = el("span", { class: "grid size-6 shrink-0 place-items-center bg-violet-600 font-mono text-xs font-bold text-white dark:bg-violet-500", "aria-hidden": "true" }, "ƒx");
  return el("div", { class: "flex items-center gap-1.5" }, mark, el("p", { class: "flex-1 font-semibold text-violet-900 dark:text-violet-100" }, "Formules"), ...right);
}

const card = (...children: HTMLElement[]): HTMLElement => el("section", { class: CARD, "aria-label": "Formules", "data-formula-card": "" }, ...children);

const ERROR = "bg-red-50 px-2 py-1.5 text-red-900 dark:bg-red-950 dark:text-red-100";
const OK = "bg-sky-50 px-2 py-1.5 text-sky-950 dark:bg-sky-950 dark:text-sky-50";

/** What the program makes of this niche, in words: the module and what each formula gave; or what is wrong. */
export function programPreview(program: ModuleProgram, niche: NicheVariables | null, unit: DisplayUnit): { text: string; ok: boolean } {
  if (!niche) {
    const wrong = programProblem(program);
    return wrong ? { text: wrong, ok: false } : { text: "Choisissez une niche : le résultat des formules s'y affiche.", ok: true };
  }
  const resolved = resolveProgram(program, niche);
  if (typeof resolved === "string") return { text: resolved, ok: false };
  const said = (Object.entries(resolved.values) as [FormulaTarget, number][]).map(([target, v]) => `${TARGETS[target].label.toLowerCase()} ${TARGETS[target].count ? v : formatLength(v, unit)}`);
  return { text: `Sur la niche de ${nicheMeasures(niche)} : ${MODULES[resolved.kind].label}${said.length ? ` — ${said.join(", ")}` : ""}.`, ok: true };
}

/** A text field: the preview follows each letter, the program takes it when it is left (or Entrée). */
function textField(label: string, value: string, o: { placeholder?: string; invalid?: boolean; numeric?: boolean; typed(text: string): void; set(text: string): void; redraw(): void }): HTMLInputElement {
  // A number (a parameter's value): `inputmode` gives it the calculator of every number field (ui/field-keypads.ts).
  const input = el("input", { type: "text", class: `${FIELD} font-mono`, value, "aria-label": label, ...(o.numeric ? { inputmode: "decimal" } : {}), ...(o.placeholder ? { placeholder: o.placeholder } : {}), "aria-invalid": String(o.invalid ?? false), spellcheck: "false", autocomplete: "off" });
  input.addEventListener("input", () => o.typed(input.value));
  input.addEventListener("change", () => o.set(input.value));
  input.addEventListener("blur", () => o.redraw());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") input.blur();
  });
  return input;
}

/** A length as a formula writes it: in the unit shown when formulas know it (mm, cm, m), otherwise in mm. */
export function lengthText(mm: number, unit: DisplayUnit): string {
  return unit === "in" ? `${trim(mm, 1)} mm` : `${trim(toDisplay(mm, unit), 4)} ${unit}`;
}

/**
 * The « ⌨ » beside a formula, as beside every number field: the calculator opened on what the formula gives now (or
 * the fixed size), its result written in the field — with its unit for a length — as if typed.
 */
function formulaKeypad(input: HTMLInputElement, label: string, count: boolean, now: () => number, unit: DisplayUnit): HTMLButtonElement {
  const keypad = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "aria-label": `Calculatrice : ${label}`, "data-field-keypad": "" }, "⌨");
  keypad.addEventListener("pointerdown", (event) => event.stopPropagation());
  keypad.addEventListener("click", (event) => {
    event.stopPropagation();
    const r = keypad.getBoundingClientRect();
    const container = (input.closest("main") ?? document.querySelector("#editor main") ?? document.body) as HTMLElement;
    const box = container.getBoundingClientRect();
    openCalculator({
      container,
      anchor: { x: Math.max(box.left + 8, Math.min(r.right + 8, box.right - 248)), y: r.top + r.height / 2 },
      value: now(),
      unit: count ? "deg" : unit,
      plain: count,
      title: label,
      locked: true,
      noLock: true,
      onSubmit: (value) => {
        input.value = count ? trim(Math.round(value), 0) : lengthText(value, unit);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
    });
  });
  return keypad;
}

export function formulaRows(o: FormulaSection): HTMLElement[] {
  const program = o.program;
  if (!program) {
    const open = el("button", { type: "button", class: `${SMALL} w-full bg-white dark:bg-gray-900`, "aria-expanded": "false" }, "Formules : calculer ce module sur la niche");
    open.addEventListener("click", () => o.open());
    const what = el("p", { class: "text-gray-600 dark:text-gray-300" }, "Un module qui se calcule sur chaque niche : étagères, tiroirs, chapeau… selon sa largeur et sa hauteur.");
    return [card(cardTitle(), what, open)];
  }
  const names = programNames(program);
  const preview = el("p", { class: OK, "aria-live": "polite", "data-formula-preview": "" });
  const show = (candidate: ModuleProgram) => {
    const { text, ok } = programPreview(candidate, o.niche, o.unit);
    preview.textContent = text;
    preview.className = ok ? OK : ERROR;
  };
  show(program);
  // A field typed in: the preview of the program as it would be with it.
  const trying = (change: (copy: ModuleProgram, text: string) => void) => (text: string) => {
    const copy = structuredClone(program);
    change(copy, text);
    show(copy);
  };
  const commit = (change: () => void) => {
    change();
    o.changed();
  };
  const remove = (label: string, act: () => void) => {
    const button = el("button", { type: "button", class: `${SMALL} px-1.5`, "aria-label": label, title: label }, "×");
    button.addEventListener("click", () => commit(act));
    return button;
  };

  const params = program.params.map((param, i) => {
    const name = textField(`Nom du paramètre ${i + 1}`, param.name, {
      invalid: paramProblem(program, i) !== null,
      typed: trying((copy, text) => ((copy.params[i] as { name: string }).name = text.trim())),
      set: (text) => commit(() => (param.name = text.trim())),
      redraw: o.redraw,
    });
    const value = textField(`Valeur du paramètre ${i + 1}`, String(param.value).replace(".", ","), {
      numeric: true,
      typed: () => {},
      set: (text) => {
        const v = parseNumber(text);
        value.setAttribute("aria-invalid", String(v === null));
        if (v !== null) commit(() => (param.value = v));
      },
      redraw: o.redraw,
    });
    value.classList.add("text-right");
    return el("div", { class: "grid grid-cols-[1fr_7rem_auto] gap-1" }, name, value, remove(`Retirer le paramètre ${i + 1}`, () => program.params.splice(i, 1)));
  });
  const addParam = el("button", { type: "button", class: `${SMALL} w-full` }, "Ajouter un paramètre");
  addParam.addEventListener("click", () => {
    const taken = new Set(names);
    const name = ["pas", "jeu", "marge"].find((n) => !taken.has(n)) ?? `p${program.params.length + 1}`;
    commit(() => program.params.push({ name, value: name === "pas" ? 350 : 0 }));
  });

  const kinds = Object.keys(MODULES) as ModuleKind[];
  const rules = program.rules.map((rule, i) => {
    const when = textField(`Condition ${i + 1}`, rule.when, {
      invalid: typeof parseFormula(rule.when, names) === "string",
      placeholder: "largeur > 45 cm",
      typed: trying((copy, text) => ((copy.rules[i] as { when: string }).when = text)),
      set: (text) => commit(() => (rule.when = text)),
      redraw: o.redraw,
    });
    const kind = el("select", { class: FIELD, "aria-label": `Module si la condition ${i + 1}` }, ...kinds.map((k) => el("option", { value: k, selected: k === rule.kind }, MODULES[k].label)));
    kind.addEventListener("change", () => commit(() => (rule.kind = kind.value as ModuleKind)));
    return el("div", { class: "space-y-1" }, el("div", { class: "grid grid-cols-[auto_1fr_auto] items-center gap-1" }, "Si", when, remove(`Retirer la condition ${i + 1}`, () => program.rules.splice(i, 1))), el("label", { class: ROW }, "alors", kind));
  });
  const addRule = el("button", { type: "button", class: `${SMALL} w-full` }, "Ajouter une condition");
  addRule.addEventListener("click", () => commit(() => program.rules.push({ when: "largeur > 45 cm", kind: program.kind === "drawers" ? "shelves" : "drawers" })));

  // A formula for each size of the modules it may make.
  const possible = [program.kind, ...program.rules.map((r) => r.kind)];
  const set = new Map(formulasOf(program));
  const targets = (Object.keys(TARGETS) as FormulaTarget[]).filter((t) => possible.some((k) => TARGETS[t].applies(k)) || set.has(t));
  const fixed: Record<FormulaTarget, string> = {
    shelves: program.sizes.shelves !== undefined ? String(program.sizes.shelves) : "selon l'espacement",
    spacing: formatLength(program.sizes.spacing, o.unit),
    hat: formatLength(program.sizes.hat, o.unit),
    drawerZone: formatLength(program.sizes.drawerZone, o.unit),
    drawers: String(program.sizes.drawers),
    rodDrop: formatLength(program.sizes.rod?.drop ?? 60, o.unit),
    thickness: formatLength(program.thickness, o.unit),
  };
  const fixedValue: Record<FormulaTarget, number> = {
    shelves: program.sizes.shelves ?? 0,
    spacing: program.sizes.spacing,
    hat: program.sizes.hat,
    drawerZone: program.sizes.drawerZone,
    drawers: program.sizes.drawers,
    rodDrop: program.sizes.rod?.drop ?? 60,
    thickness: program.thickness,
  };
  const formulas = targets.map((target) => {
    const text = program.formulas[target] ?? "";
    const input = textField(`Formule : ${TARGETS[target].label}`, text, {
      invalid: text.trim() !== "" && typeof parseFormula(text, names) === "string",
      placeholder: fixed[target],
      typed: trying((copy, text) => (copy.formulas[target] = text)),
      set: (value) => commit(() => (value.trim() ? (program.formulas[target] = value) : delete program.formulas[target])),
      redraw: o.redraw,
    });
    // What it gives now: the formula worked out on the niche when it reads, otherwise the fixed size.
    const now = () => {
      const formula = parseFormula(input.value, names);
      const values = o.niche ? { ...o.niche, ...Object.fromEntries(program.params.map((p) => [p.name, p.value])) } : null;
      const v = typeof formula === "string" || !values ? null : evaluateFormula(formula, values);
      return typeof v === "number" ? v : fixedValue[target];
    };
    const keypad = formulaKeypad(input, TARGETS[target].label, TARGETS[target].count !== undefined, now, o.unit);
    input.classList.add("flex-1");
    return el("label", { class: ROW }, TARGETS[target].label, el("span", { class: "flex min-w-0 items-center gap-1" }, input, keypad));
  });

  const close = el("button", { type: "button", class: `${SMALL} bg-white dark:bg-gray-900` }, "Sans formules");
  close.addEventListener("click", () => o.close());
  const heading = (text: string) => el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, text);
  return [
    card(
      cardTitle(close),
      el(
        "p",
        { class: "text-gray-600 dark:text-gray-300" },
        `Variables de la niche (mm) : ${VARIABLES.map((v) => v.name.replace("epaisseur", "épaisseur")).join(", ")}, et les paramètres. Fonctions : ${FORMULA_FUNCTIONS.join(", ")} ; séparez les valeurs par « ; ». Vide : la cote fixe.`,
      ),
      heading("Paramètres"),
      ...params,
      addParam,
      heading("Selon la niche"),
      ...rules,
      addRule,
      heading("Cotes calculées"),
      ...formulas,
      preview,
    ),
  ];
}
