/**
 * Small window of the Text tool: what is written, the height of the letters and their angle; « Supprimer » for a
 * text that exists. Placed next to the click; Entrée confirms, Échap closes.
 */
import type { DisplayUnit } from "../document/types";
import type { SketchText } from "../document/sketch";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";

const INPUT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

let current: (() => void) | null = null;

export function closeTextDialog(): void {
  current?.();
}

export function openTextDialog(options: {
  container: HTMLElement;
  anchor: { x: number; y: number };
  unit: DisplayUnit;
  text: SketchText;
  existing: boolean;
  onSubmit(text: SketchText): void;
  onDelete(): void;
}): void {
  closeTextDialog();
  const { unit, text } = options;
  const words = el("input", { type: "text", class: INPUT, value: text.text, "aria-label": "Texte", maxlength: "500" });
  const height = el("input", { type: "text", inputmode: "decimal", class: `${INPUT} text-right`, value: trim(toDisplay(text.height, unit), 4), "aria-label": `Hauteur (${UNIT_LABELS[unit]})` });
  const angle = el("input", { type: "text", inputmode: "decimal", class: `${INPUT} text-right`, value: trim(text.angle ?? 0, 3), "aria-label": "Angle (°)" });
  const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium" }, "OK");
  const remove = options.existing ? el("button", { type: "button", class: `${BUTTON} text-red-600` }, "Supprimer") : null;
  const cancel = el("button", { type: "button", class: BUTTON }, "Annuler");
  const box = el(
    "div",
    { class: "absolute z-40 w-60 space-y-2 border border-gray-200 bg-white p-2.5 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-900", role: "dialog", "aria-label": "Texte de l'esquisse" },
    el("label", { class: "block space-y-1" }, el("span", { class: "text-gray-500" }, "Texte"), words),
    el("div", { class: "grid grid-cols-2 gap-1.5" }, el("label", { class: "space-y-1" }, el("span", { class: "text-gray-500" }, `Hauteur (${UNIT_LABELS[unit]})`), height), el("label", { class: "space-y-1" }, el("span", { class: "text-gray-500" }, "Angle (°)"), angle)),
    el("div", { class: "flex gap-1.5" }, ok, remove, cancel),
  );
  const rect = options.container.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(rect.width - 248, options.anchor.x - rect.left + 12))}px`;
  box.style.top = `${Math.max(8, Math.min(rect.height - 170, options.anchor.y - rect.top + 12))}px`;
  box.addEventListener("pointerdown", (event) => event.stopPropagation());
  const close = () => {
    box.remove();
    window.removeEventListener("keydown", onKey, true);
    current = null;
  };
  const submit = () => {
    const h = parseNumber(height.value);
    const a = parseNumber(angle.value);
    height.setAttribute("aria-invalid", String(!(h && h > 0)));
    if (!words.value.trim() || !(h && h > 0) || a === null) return;
    close();
    options.onSubmit({ ...text, text: words.value.trim(), height: Number(fromDisplay(h, unit).toFixed(6)), ...(a ? { angle: a } : { angle: undefined }) });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      close();
    } else if (event.key === "Enter") {
      event.stopImmediatePropagation();
      event.preventDefault();
      submit();
    }
  };
  ok.addEventListener("click", submit);
  cancel.addEventListener("click", close);
  remove?.addEventListener("click", () => {
    close();
    options.onDelete();
  });
  window.addEventListener("keydown", onKey, true);
  options.container.append(box);
  current = close;
  words.focus();
  words.select();
}
