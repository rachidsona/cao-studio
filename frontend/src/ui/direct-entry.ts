/**
 * Saisie directe dans les outils, comme dans l'esquisse : un outil ouvert (Extrusion, Déplacer, Perçage, Congé…),
 * on tape une valeur sans cliquer de champ — elle va dans le premier champ de nombre de sa fenêtre, entourée de bleu —,
 * puis Entrée l'applique (Retour arrière efface, Échap abandonne, un clic ailleurs aussi). Elle peut être un calcul :
 * (190+100)/2, 2*70, 80-2,5 ; son résultat s'écrit dans le champ. Et tout champ de nombre tapé à la main prend un
 * calcul de même : Entrée (ou quitter le champ) écrit son résultat avant que l'outil le lise. Les outils qui ont leur
 * propre case des mesures (Magie extrude, Déplacer, Pousser, Dessiner sur le corps) la gardent : ils passent avant.
 * Rien n'est pris dans l'esquisse (ses cotes ont leurs cases), ni avec Ctrl, ⌘ ou Alt.
 */
import { evaluateExpression } from "../measurements/expression";
import { evaluateTyped, isCalculation, repairBrackets } from "../measurements/typed-expression";
import { toDisplay, UNIT_LABELS } from "../measurements/units";
import type { DisplayUnit } from "../document/types";
import { expressionKey } from "./digit-keys";

const NUMBER_FIELD = 'input[inputmode="decimal"], input[type="number"]';
/** Fields that read calculations themselves (the calculator, the dimension editors): left alone. */
const OWN = "[data-expression], [data-dim-editor], [data-no-calculation]";

/** The unit a field's name gives (« Distance (cm) »), or null: a number with no unit. */
function unitOf(input: HTMLInputElement): DisplayUnit | null {
  const name = `${input.getAttribute("aria-label") ?? ""} ${input.closest("label")?.textContent ?? ""}`;
  const found = (Object.entries(UNIT_LABELS) as [DisplayUnit, string][]).find(([, label]) => new RegExp(`\\(${label}\\)`).test(name));
  return found ? found[0] : null;
}

/** A number written as the fields show them: a decimal comma, six places at most. */
const written = (v: number) => String(Number(v.toFixed(6))).replace(".", ",");

/** The result of a calculation typed in a field, in the field's own terms; null: not a calculation, or not whole. */
export function fieldResult(input: HTMLInputElement, text = input.value): number | null {
  if (!isCalculation(text)) return null;
  const unit = unitOf(input);
  // Units typed (« 1 m + 20 cm »): worked out in the field's unit; else the numbers as they are.
  if (unit && /[a-z"]/i.test(text)) {
    try {
      return toDisplay(evaluateExpression(repairBrackets(text), unit), unit);
    } catch {
      return null;
    }
  }
  return evaluateTyped(text);
}

/** The tool window shown: the right panel's tab in front (not the properties), or a window over the view. */
function toolWindow(): HTMLElement | null {
  const docked = document.querySelector<HTMLElement>('[data-ref="dock"] > :not([data-dock-hidden])');
  if (docked && docked.offsetParent !== null) return docked;
  return [...document.querySelectorAll<HTMLElement>('[data-ref="viewport"] [role="dialog"]')].find((d) => d.offsetParent !== null) ?? null;
}

/** The field a value typed goes to: the first number field of the tool window, shown and free. */
function firstField(): HTMLInputElement | null {
  const window_ = toolWindow();
  if (!window_) return null;
  return [...window_.querySelectorAll<HTMLInputElement>(NUMBER_FIELD)].find((i) => !i.disabled && !i.readOnly && i.type !== "hidden" && i.offsetParent !== null && !i.closest(OWN)) ?? null;
}

const fire = (input: HTMLInputElement, type: "input" | "change") => input.dispatchEvent(new Event(type, { bubbles: true }));

export function bindDirectEntry(root: HTMLElement, toolOpen: () => boolean): void {
  /** What is being typed without a field, and the field it goes to (by its name: the window may be drawn again). */
  let typed: { text: string; label: string | null; before: string } | null = null;
  const field = (): HTMLInputElement | null => {
    if (!typed) return null;
    const window_ = toolWindow();
    const named = typed.label && window_ ? [...window_.querySelectorAll<HTMLInputElement>(NUMBER_FIELD)].find((i) => i.getAttribute("aria-label") === typed!.label) : null;
    return named ?? firstField();
  };
  const show = (input: HTMLInputElement | null, on: boolean) => {
    if (!input) return;
    input.style.outline = on ? "2px solid rgb(14 165 233)" : "";
    input.toggleAttribute("data-direct-entry", on);
  };
  const end = () => {
    show(field(), false);
    typed = null;
  };

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLElement | null;
      // A field one types in (a menu, a box or a button just used keeps no keys: a value typed goes to the tool's field).
      const inField = !!target?.closest?.('textarea, [contenteditable=true], input:not([type="checkbox"], [type="radio"], [type="button"], [type="range"], [type="color"])');
      // A calculation typed in a field by hand: its result written in before the tool reads it.
      if (inField) {
        if (typed) end();
        if (event.key === "Enter" && target instanceof HTMLInputElement && target.matches(NUMBER_FIELD) && !target.closest(OWN)) {
          const v = fieldResult(target);
          if (v !== null) {
            target.value = written(v);
            fire(target, "input");
          }
        }
        return;
      }
      if (root.dataset.mode === "sketch" || !toolOpen()) return void (typed = null);
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (typed) {
        const input = field();
        if (!input) return void (typed = null);
        if (event.key === "Enter" || event.key === "Tab") {
          const text = typed.text;
          const v = evaluateTyped(text);
          event.preventDefault();
          event.stopImmediatePropagation();
          if (v === null) {
            input.setAttribute("aria-invalid", "true");
            return;
          }
          end();
          input.value = written(v);
          fire(input, "input");
          fire(input, "change");
          // Entrée: as pressed in the field (the tools that apply on it, Extrusion's OK). Tab: the value only.
          if (event.key === "Enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          input.value = typed.before;
          fire(input, "input");
          end();
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          event.stopImmediatePropagation();
          typed.text = typed.text.slice(0, -1);
          if (!typed.text) {
            input.value = typed.before;
            fire(input, "input");
            end();
            return;
          }
          input.value = typed.text;
          fire(input, "input");
          return;
        }
      }
      const key = expressionKey(event);
      if (key === null || (!typed && !/^[0-9.,(-]$/.test(key))) return;
      const input = typed ? field() : firstField();
      if (!input) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!typed) typed = { text: "", label: input.getAttribute("aria-label"), before: input.value };
      typed.text = key === ")" ? repairBrackets(`${typed.text})`) : typed.text + key;
      show(input, true);
      input.removeAttribute("aria-invalid");
      input.value = typed.text;
      // A plain number is given at once (the tool shows it); a calculation once it is whole, at Entrée.
      if (!isCalculation(typed.text)) fire(input, "input");
    },
    true,
  );
  // A click anywhere, or a field taken: what was typed stays as it is in its field.
  document.addEventListener("pointerdown", () => typed && end(), true);
  // A calculation in a field left without Entrée: its result, before the tool reads the change.
  document.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches(NUMBER_FIELD) || target.closest(OWN)) return;
      const v = fieldResult(target);
      if (v !== null) target.value = written(v);
    },
    true,
  );
}
