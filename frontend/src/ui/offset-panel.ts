/** Compact panel of the sketch "Décalage" tool, docked on the right of the view. */
import type { DisplayUnit } from "../document/types";
import type { OffsetJoin } from "../geometry/offset";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { openCalculator } from "./calculator";
import { el } from "./dom";

export interface OffsetPanelState {
  /** Signed distance in mm. */
  distance: number;
  unit: DisplayUnit;
  flip: boolean;
  join: OffsetJoin;
  chain: boolean;
  /** Selected curves, and paths (circles / chains) they form. */
  selected: number;
  paths: number;
  /** Whether the selection has closed contours, open chains, both, or nothing. */
  sides: "closed" | "open" | "mixed" | "none";
  busy: boolean;
  problem: string | null;
  warnings: string[];
  /** Number of curves in the preview, or null when there is none. */
  result: number | null;
}

export interface OffsetPanelActions {
  container: HTMLElement;
  setDistance(value: number): void;
  setFlip(flip: boolean): void;
  setJoin(join: OffsetJoin): void;
  setChain(chain: boolean): void;
  confirm(): void;
  cancel(): void;
}

const INPUT =
  "h-8 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SEGMENT = "h-8 flex-1 border text-xs font-medium first:rounded-l-md last:rounded-r-md";
const SEGMENT_ON = "border-sky-600 bg-sky-600 text-white";
const SEGMENT_OFF = "border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800";

const SIDE_LABELS: Record<OffsetPanelState["sides"], [string, string]> = {
  closed: ["Extérieur", "Intérieur"],
  open: ["Gauche", "Droite"],
  mixed: ["Côté +", "Côté −"],
  none: ["Extérieur / gauche", "Intérieur / droite"],
};

function segmented(label: string, options: [string, boolean][], onPick: (index: number) => void): HTMLElement {
  const buttons = options.map(([text, on], index) => {
    const button = el("button", { type: "button", class: `${SEGMENT} ${on ? SEGMENT_ON : SEGMENT_OFF}`, "aria-pressed": String(on) }, text);
    button.addEventListener("click", () => onPick(index));
    return button;
  });
  return el("div", { class: "space-y-1", role: "group", "aria-label": label }, el("span", { class: "text-gray-600 dark:text-gray-300" }, label), el("div", { class: "flex" }, ...buttons));
}

function distanceRow(state: OffsetPanelState, actions: OffsetPanelActions): HTMLElement {
  const shown = trim(toDisplay(state.distance, state.unit), 4);
  const input = el("input", { type: "text", inputmode: "decimal", class: INPUT, value: shown, "aria-label": `Distance (${UNIT_LABELS[state.unit]})` });
  const apply = () => {
    const parsed = parseNumber(input.value);
    const ok = parsed !== null && Math.abs(parsed) > 0;
    input.setAttribute("aria-invalid", String(!ok));
    if (ok) actions.setDistance(fromDisplay(parsed, state.unit));
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
  const keypad = el("button", { type: "button", class: "size-8 shrink-0 rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Calculatrice", "aria-label": "Saisir la distance" }, "⌨");
  keypad.addEventListener("click", () => {
    const r = keypad.getBoundingClientRect();
    openCalculator({
      container: actions.container,
      anchor: { x: r.left - 260, y: r.top + r.height / 2 },
      value: state.distance,
      unit: state.unit,
      title: "Distance de décalage",
      locked: true,
      allowNegative: true,
      onSubmit: (value) => {
        if (Math.abs(value) === 0) return false;
        actions.setDistance(value);
        return true;
      },
    });
  });
  return el("label", { class: "grid grid-cols-[5rem_1fr_auto] items-center gap-1.5" }, `Distance (${UNIT_LABELS[state.unit]})`, input, keypad);
}

/** (Re)draws the panel content for the current state. */
export function renderOffsetPanel(panel: HTMLElement, state: OffsetPanelState, actions: OffsetPanelActions): void {
  const [positive, negative] = SIDE_LABELS[state.sides];
  const chain = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: state.chain });
  chain.addEventListener("change", () => actions.setChain(chain.checked));

  const cancel = el("button", { type: "button", class: "h-8 flex-1 rounded-md border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
  cancel.addEventListener("click", actions.cancel);
  const ok = el("button", { type: "button", class: "h-8 flex-1 rounded-md bg-sky-600 font-medium text-white hover:bg-sky-700 disabled:opacity-40", disabled: state.result === null || state.busy }, "OK");
  ok.addEventListener("click", actions.confirm);

  const status =
    state.selected === 0
      ? "Cliquez les lignes, arcs ou cercles à décaler."
      : `${state.selected} élément(s) sélectionné(s), ${state.paths} contour(s) ou chaîne(s)${state.result !== null ? ` — aperçu : ${state.result} courbe(s)` : ""}.`;

  const rows: (HTMLElement | null)[] = [
    el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Décalage"),
    el("p", { class: "text-gray-600 dark:text-gray-300" }, status),
    distanceRow(state, actions),
    segmented("Côté", [[positive, !state.flip], [negative, state.flip]], (i) => actions.setFlip(i === 1)),
    segmented("Coins", [["Arrondis", state.join === "round"], ["Vifs", state.join === "sharp"]], (i) => actions.setJoin(i === 0 ? "round" : "sharp")),
    el("label", { class: "flex min-h-8 items-center gap-2" }, chain, "Chaîne connectée (un clic prend tout le contour)"),
    state.problem ? el("p", { class: "rounded-md bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, state.problem) : null,
    ...state.warnings.map((w) => el("p", { class: "rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, w)),
    el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "L'original est conservé. Une distance négative décale de l'autre côté."),
    el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
  ];
  panel.replaceChildren(...rows.filter((row): row is HTMLElement => row !== null));
}
