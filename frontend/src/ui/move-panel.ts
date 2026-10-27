/**
 * Dialog of the sketch "Déplacer" tool, docked at the top right of the view,
 * in the style of the "Décalage" dialog: the way the displacement is given
 * (relative ΔX/ΔY, distance and angle, or absolute position of the base
 * point), its fields in the display unit, and an OK / Annuler footer. It
 * only draws; the tool owns the state.
 */
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { BODY, BOX, BUTTON, FIELD, row, TITLE } from "./offset-panel";
import { openCalculator } from "./calculator";
import { el } from "./dom";

export type MoveMode = "relative" | "polar" | "absolute";

export interface MovePanelState {
  mode: MoveMode;
  unit: DisplayUnit;
  /** Displacement (mm). */
  delta: [number, number];
  /** Where the base point is now (mm), and what it is. */
  base: { pos: [number, number]; label: string } | null;
  /** Selected elements, and points that will move with them. */
  selected: number;
  points: number;
  problem: string | null;
  /** Degrees of freedom left after the move, or null when it cannot be computed. */
  dof: number | null;
  /** The move can be confirmed. */
  ready: boolean;
}

export interface MovePanelActions {
  container: HTMLElement;
  setMode(mode: MoveMode): void;
  /** New displacement (mm). */
  setDelta(delta: [number, number]): void;
  selectContours(): void;
  clearSelection(): void;
  confirm(): void;
  cancel(): void;
}

const MODES: [MoveMode, string][] = [
  ["relative", "Relatif (ΔX, ΔY)"],
  ["polar", "Distance et angle"],
  ["absolute", "Position absolue"],
];

/** Numeric field in the display unit (or degrees) with a keypad button; `onChange` gets mm (or degrees). */
function numberField(label: string, value: number, unit: DisplayUnit | "deg", container: HTMLElement, onChange: (v: number) => void, signed = true): HTMLElement {
  const isAngle = unit === "deg";
  const shown = trim(isAngle ? value : toDisplay(value, unit), 4);
  const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: shown, "aria-label": label });
  const apply = () => {
    const parsed = parseNumber(input.value);
    const ok = parsed !== null && (signed || parsed >= 0);
    input.setAttribute("aria-invalid", String(!ok));
    if (ok) onChange(isAngle ? parsed : fromDisplay(parsed, unit));
  };
  input.addEventListener("change", apply);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation(); // typing a number must not trigger tool shortcuts
    if (event.key === "Enter") {
      apply();
      input.blur();
    } else if (event.key === "Escape") {
      input.value = shown;
      input.blur();
    }
  });
  const keypad = el("button", { type: "button", class: `${BUTTON} w-8 shrink-0 px-0`, title: "Calculatrice", "aria-label": `Saisir ${label}` }, "⌨");
  keypad.addEventListener("click", () => {
    const r = keypad.getBoundingClientRect();
    openCalculator({
      container,
      anchor: { x: r.left - 260, y: r.top + r.height / 2 },
      value,
      unit,
      title: label,
      locked: true,
      allowNegative: signed,
      onSubmit: (v) => {
        onChange(v);
        return true;
      },
    });
  });
  return el("div", { class: "flex items-center gap-1.5" }, input, el("span", { class: "w-6 text-gray-500 dark:text-neutral-400" }, isAngle ? "°" : UNIT_LABELS[unit]), keypad);
}

/** (Re)draws the dialog for the current state. */
export function renderMovePanel(panel: HTMLElement, state: MovePanelState, actions: MovePanelActions): void {
  const { delta, unit, base } = state;
  const rows: (HTMLElement | null)[] = [];
  const select = el("select", { class: FIELD, "aria-label": "Mode de saisie" }, ...MODES.map(([v, t]) => el("option", { value: v, selected: v === state.mode }, t)));
  select.addEventListener("change", () => actions.setMode(select.value as MoveMode));
  rows.push(row("Saisie", select));

  if (state.mode === "relative") {
    rows.push(
      row("ΔX", numberField("ΔX", delta[0], unit, actions.container, (v) => actions.setDelta([v, delta[1]]))),
      row("ΔY", numberField("ΔY", delta[1], unit, actions.container, (v) => actions.setDelta([delta[0], v]))),
    );
  } else if (state.mode === "polar") {
    const distance = Math.hypot(...delta);
    const angle = Math.abs(delta[0]) + Math.abs(delta[1]) < 1e-12 ? 0 : (Math.atan2(delta[1], delta[0]) * 180) / Math.PI;
    const set = (d: number, a: number) => actions.setDelta([d * Math.cos((a * Math.PI) / 180), d * Math.sin((a * Math.PI) / 180)]);
    rows.push(
      row("Distance", numberField("Distance", distance, unit, actions.container, (v) => set(v, angle), false)),
      row("Angle", numberField("Angle", angle, "deg", actions.container, (v) => set(distance, v))),
    );
  } else if (base) {
    rows.push(
      row("X", numberField("X", base.pos[0] + delta[0], unit, actions.container, (v) => actions.setDelta([v - base.pos[0], delta[1]]))),
      row("Y", numberField("Y", base.pos[1] + delta[1], unit, actions.container, (v) => actions.setDelta([delta[0], v - base.pos[1]]))),
    );
  }
  if (state.mode === "absolute" && base) rows.push(el("p", { class: "text-[11px] text-gray-500 dark:text-neutral-400" }, `Position du ${base.label}.`));

  const hasSelection = state.selected > 0;
  const count = el(
    "button",
    {
      type: "button",
      class: `${BUTTON} w-full justify-start whitespace-nowrap border-sky-500 bg-sky-500/10 hover:bg-sky-500/20 dark:border-sky-400 dark:bg-sky-400/10`,
      title: hasSelection ? "Effacer la sélection" : "Cliquez des éléments dans l'esquisse",
    },
    hasSelection ? `${state.selected} élément${state.selected > 1 ? "s" : ""} (${state.points} point${state.points > 1 ? "s" : ""})` : "Sélection…",
    hasSelection ? el("span", { class: "ml-auto text-gray-500 dark:text-neutral-400", "aria-hidden": "true" }, "✕") : null,
  );
  count.addEventListener("click", () => hasSelection && actions.clearSelection());
  const contour = el("button", { type: "button", class: `${BUTTON} w-full`, disabled: !hasSelection, title: "Ajoute à la sélection tout le contour des courbes choisies (rectangle, polygone…)" }, "Étendre aux contours");
  contour.addEventListener("click", actions.selectContours);

  const hint = hasSelection
    ? "Tirez la sélection à la souris, ou saisissez le déplacement. L'aperçu (pointillés) montre le résultat avec les contraintes."
    : "Cliquez des points, lignes, cercles ou arcs — plusieurs si besoin — puis tirez-les ou saisissez le déplacement.";
  const dof = state.dof === null ? null : state.dof === 0 ? "Esquisse entièrement contrainte après le déplacement." : `${state.dof} cote(s) ou contrainte(s) manquante(s) après le déplacement.`;
  const ok = el("button", { type: "button", class: "h-8 min-w-20 rounded bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-neutral-600 dark:disabled:text-neutral-400", disabled: !state.ready }, "OK");
  ok.addEventListener("click", actions.confirm);
  const cancel = el("button", { type: "button", class: `${BUTTON} min-w-20` }, "Annuler");
  cancel.addEventListener("click", actions.cancel);

  const body = [
    row("Éléments", count),
    row("Contours", contour),
    ...rows,
    el("p", { class: "text-[11px] text-gray-500 dark:text-neutral-400" }, hint),
    state.problem ? el("p", { class: "rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, state.problem) : null,
    !state.problem && dof && state.ready ? el("p", { class: "text-[11px] text-gray-500 dark:text-neutral-400" }, dof) : null,
  ];
  const footer = el("div", { class: "flex items-center gap-2 border-t border-gray-300 px-3 py-2 dark:border-neutral-600" }, el("span", { class: "flex-1" }), ok, cancel);
  panel.replaceChildren(
    el(
      "div",
      { class: BOX, role: "group" },
      el("div", { class: TITLE }, el("h2", {}, "Déplacer")),
      el("div", { class: BODY }, ...body.filter((n): n is HTMLElement => n !== null)),
      footer,
    ),
  );
}
