/**
 * Dialog of the sketch "Décalage" tool, docked at the top right of the view:
 * title bar (collapsible), one row per setting (label left, control right),
 * and an info / OK / Annuler footer.
 */
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
  direction: "one" | "both";
  collapsed: boolean;
  showHelp: boolean;
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
  setDirection(direction: "one" | "both"): void;
  clearSelection(): void;
  toggleCollapsed(): void;
  toggleHelp(): void;
  confirm(): void;
  cancel(): void;
}

const NS = "http://www.w3.org/2000/svg";

/** Small stroked or filled icon from SVG path data (24 × 24 grid). */
function icon(path: string, filled = false): SVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "size-4 shrink-0");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(NS, "path");
  shape.setAttribute("d", path);
  shape.setAttribute("fill", filled ? "currentColor" : "none");
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-width", filled ? "1" : "2");
  shape.setAttribute("stroke-linecap", "round");
  shape.setAttribute("stroke-linejoin", "round");
  svg.append(shape);
  return svg;
}

const CURSOR = "M5 3l14 8-6 2-2 6z";
const FLIP = "M8 20V5M8 5L4.5 8.5M8 5l3.5 3.5M16 4v15M16 19l-3.5-3.5M16 19l3.5-3.5";
const ONE_SIDE = "M4 6h16M4 12h16M4 18h16";
const TWO_SIDES = "M4 5h16M4 12h16M4 19h16";

export const BOX = "rounded-md border border-gray-300 bg-gray-100 text-xs text-gray-900 shadow-xl dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100";
export const TITLE = "flex h-7 items-center gap-1.5 rounded-t-md bg-gray-200 px-2 text-[11px] font-semibold tracking-wide uppercase dark:bg-neutral-700";
export const BODY = "space-y-2 px-3 py-3";
export const ROW = "grid min-h-8 grid-cols-[6.5rem_1fr] items-center gap-2";
export const FIELD =
  "h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 " +
  "aria-invalid:border-red-500 dark:border-neutral-500 dark:bg-neutral-900";
export const BUTTON =
  "flex h-8 items-center justify-center gap-1.5 rounded border px-3 text-xs font-medium border-gray-300 bg-white hover:bg-gray-50 " +
  "dark:border-neutral-500 dark:bg-neutral-700 dark:hover:bg-neutral-600";

const SIDE_LABELS: Record<OffsetPanelState["sides"], [string, string]> = {
  closed: ["Extérieur", "Intérieur"],
  open: ["Gauche", "Droite"],
  mixed: ["Côté +", "Côté −"],
  none: ["", ""],
};

const HELP =
  "Cliquez les lignes, arcs ou cercles à décaler (un clic prend toute la chaîne connectée si la case est cochée). " +
  "La distance est négative pour décaler de l'autre côté. « Inverser » change le côté. L'original est conservé.";

export function row(label: string, control: Node): HTMLElement {
  return el("div", { class: ROW }, el("span", {}, label), control);
}

function distanceControl(state: OffsetPanelState, actions: OffsetPanelActions): HTMLElement {
  const shown = trim(toDisplay(state.distance, state.unit), 4);
  const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: shown, "aria-label": `Distance (${UNIT_LABELS[state.unit]})` });
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
  const keypad = el("button", { type: "button", class: `${BUTTON} w-8 shrink-0 px-0`, title: "Calculatrice", "aria-label": "Saisir la distance" }, "⌨");
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
  return el("div", { class: "flex items-center gap-1.5" }, input, el("span", { class: "text-gray-500 dark:text-neutral-400" }, UNIT_LABELS[state.unit]), keypad);
}

function selectControl(label: string, value: string, options: [string, string][], onPick: (value: string) => void, lead?: SVGElement): HTMLElement {
  const select = el("select", { class: `${FIELD} ${lead ? "pl-7" : ""}`, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
  select.addEventListener("change", () => onPick(select.value));
  const wrap = el("div", { class: "relative" }, select);
  if (lead) {
    lead.classList.add("pointer-events-none", "absolute", "top-2", "left-2", "text-orange-500");
    wrap.append(lead);
  }
  return wrap;
}

/** (Re)draws the dialog for the current state. */
export function renderOffsetPanel(panel: HTMLElement, state: OffsetPanelState, actions: OffsetPanelActions): void {
  const collapse = el(
    "button",
    { type: "button", class: "flex size-5 items-center justify-center rounded text-base leading-none hover:bg-gray-300 dark:hover:bg-neutral-600", title: state.collapsed ? "Déplier" : "Replier", "aria-expanded": String(!state.collapsed), "aria-label": "Replier ou déplier le panneau" },
    state.collapsed ? "+" : "−",
  );
  collapse.addEventListener("click", actions.toggleCollapsed);
  const title = el("div", { class: `${TITLE} ${state.collapsed ? "rounded-b-md" : ""}` }, collapse, el("h2", {}, "Décalage"));
  if (state.collapsed) {
    panel.replaceChildren(el("div", { class: BOX, role: "group" }, title));
    return;
  }

  // Courbes: always in selection mode; with a selection the button shows the count and clears it.
  const hasSelection = state.selected > 0;
  const curves = el(
    "button",
    {
      type: "button",
      class: `${BUTTON} w-full justify-start whitespace-nowrap border-sky-500 bg-sky-500/10 hover:bg-sky-500/20 dark:border-sky-400 dark:bg-sky-400/10`,
      title: hasSelection ? "Effacer la sélection" : "Cliquez des éléments dans l'esquisse",
      "aria-label": hasSelection ? `${state.selected} élément(s) sélectionné(s) — effacer la sélection` : "Sélection",
    },
    icon(CURSOR, true),
    hasSelection ? `${state.selected} élément${state.selected > 1 ? "s" : ""}` : "Sélection…",
    hasSelection ? el("span", { class: "ml-auto text-gray-500 dark:text-neutral-400", "aria-hidden": "true" }, "✕") : null,
  );
  curves.addEventListener("click", () => hasSelection && actions.clearSelection());

  const chain = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: state.chain, "aria-label": "Sélection en chaîne" });
  chain.addEventListener("change", () => actions.setChain(chain.checked));

  const [positive, negative] = SIDE_LABELS[state.sides];
  // The side that is actually produced depends on the sign of the distance as well as on "Inverser".
  const negativeSide = state.flip !== state.distance < 0;
  const caption = state.sides === "none" || state.direction === "both" ? "" : negativeSide ? negative : positive;
  const flip = el(
    "button",
    { type: "button", class: `${BUTTON} w-9 px-0 ${state.flip ? "border-sky-500 bg-sky-500/10" : ""}`, title: "Inverser le côté", "aria-label": "Inverser", "aria-pressed": String(state.flip), disabled: state.direction === "both" },
    icon(FLIP),
  );
  flip.addEventListener("click", () => actions.setFlip(!state.flip));

  const info = el(
    "button",
    { type: "button", class: "flex size-6 items-center justify-center rounded-full border border-gray-400 text-[11px] font-bold hover:bg-gray-200 dark:border-neutral-400 dark:hover:bg-neutral-600", title: "Aide", "aria-label": "Aide", "aria-expanded": String(state.showHelp) },
    "i",
  );
  info.addEventListener("click", actions.toggleHelp);
  const ok = el("button", { type: "button", class: "h-8 min-w-20 rounded bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-neutral-600 dark:disabled:text-neutral-400", disabled: state.result === null || state.busy }, "OK");
  ok.addEventListener("click", actions.confirm);
  const cancel = el("button", { type: "button", class: `${BUTTON} min-w-20` }, "Annuler");
  cancel.addEventListener("click", actions.cancel);

  const status =
    state.selected === 0
      ? "Cliquez les lignes, arcs ou cercles à décaler."
      : `${state.paths} contour(s) ou chaîne(s)${state.result !== null ? ` — aperçu : ${state.result} courbe(s)` : ""}`;

  const body: (HTMLElement | null)[] = [
    row("Courbes", curves),
    row("Sélection en chaîne", chain),
    row("Direction", selectControl("Direction", state.direction, [["one", "Un côté"], ["both", "Deux côtés"]], (v) => actions.setDirection(v as "one" | "both"), icon(state.direction === "both" ? TWO_SIDES : ONE_SIDE))),
    row("Inverser", el("div", { class: "flex items-center gap-2" }, flip, caption ? el("span", { class: "text-gray-600 dark:text-neutral-300" }, caption) : null)),
    row("Distance", distanceControl(state, actions)),
    row("Coins", selectControl("Coins", state.join, [["round", "Arrondis"], ["sharp", "Vifs"]], (v) => actions.setJoin(v as OffsetJoin))),
    el("p", { class: "text-[11px] text-gray-500 dark:text-neutral-400" }, status),
    state.problem ? el("p", { class: "rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, state.problem) : null,
    ...state.warnings.map((w) => el("p", { class: "rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" }, w)),
    state.showHelp ? el("p", { class: "rounded bg-gray-200 px-2 py-1.5 text-gray-700 dark:bg-neutral-700 dark:text-neutral-200" }, HELP) : null,
  ];
  const footer = el("div", { class: "flex items-center gap-2 border-t border-gray-300 px-3 py-2 dark:border-neutral-600" }, info, el("span", { class: "flex-1" }), ok, cancel);
  panel.replaceChildren(el("div", { class: BOX, role: "group" }, title, el("div", { class: BODY }, ...body.filter((n): n is HTMLElement => n !== null)), footer));
}
