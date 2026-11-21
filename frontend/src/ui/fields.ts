/** Form building blocks of the side panels (numeric fields in display units, sections, rows). */
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "./dom";

export const inputClass =
  "h-8 w-full border border-gray-300 bg-white px-2 text-right font-mono text-sm tabular-nums " +
  "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 " +
  "dark:border-gray-600 dark:bg-gray-900";

export const textInputClass = inputClass.replace("text-right font-mono", "text-left");

export interface NumberFieldOptions {
  label: string;
  /** Stored value: mm for lengths, degrees for angles. */
  value: number;
  unit: DisplayUnit | "deg";
  /** Allows zero and negative values. */
  signed?: boolean;
  /** Receives the new stored value; returns false when the change was refused. */
  onCommit(value: number): boolean | void;
  dataset?: Record<string, string>;
  trailing?: HTMLElement | null;
}

export function numberField(options: NumberFieldOptions): HTMLElement {
  const isAngle = options.unit === "deg";
  const unitLabel = isAngle ? "°" : UNIT_LABELS[options.unit as DisplayUnit];
  const shown = isAngle ? options.value : toDisplay(options.value, options.unit as DisplayUnit);
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    class: inputClass,
    value: trim(shown, 6),
    "aria-label": `${options.label} (${unitLabel})`,
  });
  for (const [key, value] of Object.entries(options.dataset ?? {})) input.dataset[key] = value;
  const error = el("p", { class: "col-span-full hidden text-xs text-red-600 dark:text-red-400", role: "alert" });
  const fail = (message: string) => {
    input.setAttribute("aria-invalid", message ? "true" : "false");
    error.textContent = message;
    error.classList.toggle("hidden", !message);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      input.value = trim(shown, 6);
      fail("");
      input.blur();
    }
  });
  input.addEventListener("change", () => {
    const parsed = parseNumber(input.value);
    if (parsed === null) return fail("Saisissez un nombre.");
    if (!options.signed && parsed <= 0) return fail("La valeur doit être strictement positive.");
    fail("");
    const stored = isAngle ? parsed : fromDisplay(parsed, options.unit as DisplayUnit);
    if (stored === options.value) return;
    if (options.onCommit(stored) === false) {
      input.value = trim(shown, 6);
      fail("Valeur impossible avec les autres contraintes de l'esquisse.");
    }
  });
  return el(
    "label",
    { class: `grid ${options.trailing ? "grid-cols-[1fr_7rem_auto]" : "grid-cols-[1fr_8rem]"} items-center gap-x-2 gap-y-1 text-sm` },
    el("span", { class: "text-gray-600 dark:text-gray-300" }, `${options.label} (${unitLabel})`),
    input,
    options.trailing ?? null,
    error,
  );
}

const FOLDED = "cao.sections.folded";

/** Name of a section without what changes in it ("Contraintes (4)" → "Contraintes"), to remember it folded. */
export const sectionKey = (title: string): string => title.replace(/\s*\(.*\)\s*$/, "").replace(/\s+—.*$/, "").trim();

function folded(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(FOLDED) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function remember(key: string, open: boolean): void {
  const keys = folded();
  if (open) keys.delete(key);
  else keys.add(key);
  try {
    localStorage.setItem(FOLDED, JSON.stringify([...keys]));
  } catch {
    // Not remembered: only this visit.
  }
}

/**
 * One card open at a time among those beside it (`selector` from its parent, or from `up` parents): one opened by a
 * click folds the others; as a panel is drawn, the first open one (in the panel's order) stays, the others fold.
 */
export function alone(card: HTMLElement, selector: string, up = 1): void {
  let asked = false;
  card.querySelector("summary")?.addEventListener("click", (event) => (asked = !event.defaultPrevented));
  card.addEventListener("toggle", () => {
    const clicked = asked;
    asked = false;
    if (!(card as HTMLDetailsElement).open) return;
    let scope: HTMLElement | null = card;
    for (let i = 0; i < up; i++) scope = scope?.parentElement ?? null;
    const others = [...(scope?.querySelectorAll<HTMLDetailsElement>(`:scope > ${selector}[open]`) ?? [])].filter((o) => o !== card);
    if (clicked) for (const other of others) other.open = false;
    else if (others.some((o) => o.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)) (card as HTMLDetailsElement).open = false;
  });
}

/** Cards of the right panel, like those of the navigator: straight corners, with a strong shadow. */
export const PANEL_CARD =
  "cad-card border border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.30)] " +
  "dark:border-gray-700 dark:bg-gray-900 dark:shadow-[0_6px_20px_rgba(0,0,0,0.75)]";

/** A card of the side panel that folds and unfolds by its title (▸); folded cards stay folded (remembered). */
export function section(title: string, ...children: (Node | null)[]): HTMLElement {
  const key = sectionKey(title);
  const card = el(
    "details",
    { class: `group/card mx-2 my-3 ${PANEL_CARD}`, "data-section": key, ...(folded().has(key) ? {} : { open: "" }) },
    el(
      "summary",
      { class: "flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 select-none hover:bg-gray-50 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden" },
      el("span", { class: "inline-block w-3 text-3xs text-gray-400 transition-transform group-open/card:rotate-90", "aria-hidden": "true" }, "▶"),
      el("h3", { class: "panel-title" }, title),
    ),
    el("div", { class: "space-y-3 px-3 pt-1 pb-3" }, ...children),
  );
  card.addEventListener("toggle", () => remember(key, card.open));
  alone(card, "details[data-section]");
  return card;
}

export function row(label: string, value: string, valueClass = ""): HTMLElement {
  return el(
    "div",
    { class: "flex justify-between gap-4 text-sm" },
    el("dt", { class: "text-gray-600 dark:text-gray-300" }, label),
    el("dd", { class: `font-mono tabular-nums text-right ${valueClass}` }, value),
  );
}

export function selectField(label: string, value: string, options: [string, string][], onChange: (value: string) => void): HTMLElement {
  const select = el(
    "select",
    { class: `${textInputClass} pr-8`, "aria-label": label },
    ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)),
  );
  select.addEventListener("change", () => onChange(select.value));
  return el(
    "label",
    { class: "grid grid-cols-[1fr_10rem] items-center gap-x-3 text-sm" },
    el("span", { class: "text-gray-600 dark:text-gray-300" }, label),
    select,
  );
}

export function iconButton(label: string, glyph: string, onClick: () => void, extra = ""): HTMLButtonElement {
  const button = el(
    "button",
    { type: "button", class: `size-9 shrink-0 text-gray-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950 ${extra}`, title: label, "aria-label": label },
    glyph,
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
}
