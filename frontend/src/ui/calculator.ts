/**
 * Compact dimension keypad shown next to a dimension or a sketch line:
 * expression input (units, + − × ÷, parentheses), touch keypad, lock toggle
 * (locked = the value becomes a driving dimension) and validation.
 */
import { evaluateExpression, ExpressionError, type ExpressionUnit } from "../measurements/expression";
import { toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import type { DisplayUnit } from "../document/types";
import { el } from "./dom";

export interface CalculatorOptions {
  /** Positioned ancestor the popup is placed in (the viewport area). */
  container: HTMLElement;
  /** Screen point (client coordinates) the popup is placed next to. */
  anchor: { x: number; y: number };
  /** Current value: mm for lengths, degrees for angles. */
  value: number;
  unit: ExpressionUnit;
  title?: string;
  locked: boolean;
  allowNegative?: boolean;
  /** Receives the value (mm or degrees); returns false when it was refused (popup stays open). */
  onSubmit(value: number, locked: boolean): boolean;
  onClose?(): void;
}

export interface CalculatorHandle {
  close(): void;
}

let current: CalculatorHandle | null = null;

export function closeCalculator(): void {
  current?.close();
}

const KEY = "flex h-11 items-center justify-center rounded-md bg-gray-700/80 text-base font-medium text-white active:bg-gray-500 hover:bg-gray-600";

export function openCalculator(o: CalculatorOptions): CalculatorHandle {
  current?.close();
  let locked = o.locked;
  const unitLabel = o.unit === "deg" ? "°" : UNIT_LABELS[o.unit as DisplayUnit];
  const shown = o.unit === "deg" ? o.value : toDisplay(o.value, o.unit as DisplayUnit);
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    class: "min-h-10 w-full rounded-md border-2 border-gray-400 bg-gray-800 px-3 font-mono text-base text-white focus:border-sky-400 focus:outline-none",
    value: trim(shown, 4),
    "aria-label": `${o.title ?? "Valeur"} (${unitLabel})`,
    autocomplete: "off",
  });
  const error = el("p", { class: "hidden px-1 text-xs text-red-300", role: "alert" });
  const insert = (text: string) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
    input.focus();
  };
  const backspace = () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    if (start !== end) input.value = input.value.slice(0, start) + input.value.slice(end);
    else if (start > 0) input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    const caret = Math.max(0, start === end ? start - 1 : start);
    input.setSelectionRange(caret, caret);
    input.focus();
  };
  const negate = () => {
    const v = input.value.trim();
    input.value = v.startsWith("-") ? v.slice(1) : `-(${v || "0"})`;
    input.focus();
  };

  const submit = () => {
    try {
      const value = evaluateExpression(input.value, o.unit);
      if (!o.allowNegative && value <= 0) throw new ExpressionError("La valeur doit être positive.");
      if (o.onSubmit(value, locked)) handle.close();
      else showError("Valeur refusée : l'esquisse ne peut pas la respecter.");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const showError = (message: string) => {
    error.textContent = message;
    error.classList.remove("hidden");
    input.focus();
  };

  const lockButton = el("button", { type: "button", class: KEY, title: "Verrouiller la cote (contrainte)", "aria-pressed": String(locked) }, locked ? "🔒" : "🔓");
  lockButton.addEventListener("click", () => {
    locked = !locked;
    lockButton.textContent = locked ? "🔒" : "🔓";
    lockButton.setAttribute("aria-pressed", String(locked));
    input.focus();
  });
  const key = (label: string, action: () => void, extra = "", title?: string) => {
    const b = el("button", { type: "button", class: `${KEY} ${extra}`, ...(title ? { title, "aria-label": title } : {}) }, label);
    b.addEventListener("click", action);
    return b;
  };
  const units = o.unit === "deg" ? ["deg"] : ["mm", "cm", "m"];
  const ok = key("✓", submit, "row-span-2 h-auto bg-rose-500 text-xl hover:bg-rose-400 active:bg-rose-600", "Valider");

  const popup = el(
    "div",
    {
      class: "absolute z-40 w-60 space-y-2 rounded-xl border border-gray-600 bg-gray-900/95 p-2 shadow-2xl backdrop-blur select-none",
      role: "dialog",
      "aria-label": o.title ?? "Saisie de cote",
    },
    el("div", { class: "flex items-center gap-2" }, input, el("span", { class: "text-xs text-gray-300" }, unitLabel)),
    error,
    el(
      "div",
      { class: "flex justify-between px-1 text-sm font-semibold text-gray-200 underline underline-offset-4" },
      ...["(", ")", ...units].map((u) => {
        const b = el("button", { type: "button", class: "min-h-8 px-1.5 hover:text-white" }, u);
        b.addEventListener("click", () => insert(u === "(" || u === ")" ? u : ` ${u}`));
        return b;
      }),
    ),
    el(
      "div",
      { class: "grid grid-cols-5 gap-1.5" },
      key("7", () => insert("7")),
      key("8", () => insert("8")),
      key("9", () => insert("9")),
      key("÷", () => insert("÷"), "", "Diviser"),
      key("⌫", backspace, "bg-rose-500/90 hover:bg-rose-400", "Effacer"),
      key("4", () => insert("4")),
      key("5", () => insert("5")),
      key("6", () => insert("6")),
      key("×", () => insert("×"), "", "Multiplier"),
      lockButton,
      key("1", () => insert("1")),
      key("2", () => insert("2")),
      key("3", () => insert("3")),
      key("−", () => insert("−"), "", "Soustraire"),
      ok,
      key("±", negate, "", "Changer le signe"),
      key("0", () => insert("0")),
      key(",", () => insert(",")),
      key("+", () => insert("+"), "", "Ajouter"),
    ),
  );
  // Keep viewport gestures from reacting to taps on the keypad.
  popup.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handle.close();
    }
  });

  o.container.append(popup);
  // Place beside the anchor, kept inside the container.
  const box = o.container.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  let left = o.anchor.x - box.left + 16;
  let top = o.anchor.y - box.top - height / 2;
  if (left + width > box.width - 8) left = o.anchor.x - box.left - width - 16;
  left = Math.max(8, Math.min(left, box.width - width - 8));
  top = Math.max(8, Math.min(top, box.height - height - 8));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  input.focus();
  input.select();

  const onOutside = (event: PointerEvent) => {
    if (!popup.contains(event.target as Node)) handle.close();
  };
  // Defer so the click that opened the popup does not close it.
  setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);

  const handle: CalculatorHandle = {
    close() {
      if (current !== handle) return;
      current = null;
      document.removeEventListener("pointerdown", onOutside, true);
      popup.remove();
      o.onClose?.();
    },
  };
  current = handle;
  return handle;
}
