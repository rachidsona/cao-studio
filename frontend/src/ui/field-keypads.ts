/**
 * Une calculatrice à chaque champ de saisie d'un nombre de l'éditeur (outils, panneaux, dessin), même ceux qui n'en
 * avaient pas : un petit bouton « ⌨ » à droite du champ ouvre la calculatrice (ui/calculator.ts) sur sa valeur — un
 * calcul (600-2*18), des unités (60 cm + 2 mm) —, et ✓ écrit le résultat dans le champ, comme s'il avait été tapé.
 * Une longueur (son nom dit son unité : « Hauteur (cm) ») se calcule en unités ; un nombre sans unité, tel quel. Ce
 * qui apparaît ensuite (un panneau qui s'ouvre) en reçoit un aussi ; un champ qui a déjà son « ⌨ », la case de la
 * calculatrice, ou un champ marqué `data-no-keypad` (tapé sur place, qui disparaît en perdant la main), non.
 */
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { openCalculator } from "./calculator";
import { el } from "./dom";

const FIELDS = 'input[inputmode="decimal"], input[type="number"]';

/** The unit a field's name gives (« Largeur (cm) »), or null: a number with no unit. */
function unitOf(input: HTMLInputElement): DisplayUnit | null {
  const name = `${input.getAttribute("aria-label") ?? ""} ${input.closest("label")?.textContent ?? ""}`;
  const found = (Object.entries(UNIT_LABELS) as [DisplayUnit, string][]).find(([, label]) => new RegExp(`\\(${label}\\)`).test(name));
  return found ? found[0] : null;
}

/** Whether this field takes a keypad: a number field, without one of its own. */
function wants(input: HTMLInputElement): boolean {
  if (input.dataset.keypad || input.hasAttribute("data-no-keypad") || input.hasAttribute("data-expression") || input.hasAttribute("data-dim-editor")) return false;
  if (input.disabled || input.readOnly || input.closest('[role="dialog"][aria-label="Saisie de cote"], [data-no-keypad]')) return false;
  // A field typed in place, focused as it appears (a dimension turned into a field): moving it would end it.
  if (document.activeElement === input) return false;
  // One beside it already (the panel tools' own « ⌨ »).
  const near = input.parentElement?.querySelectorAll("button") ?? [];
  return ![...near].some((b) => b.textContent?.trim() === "⌨");
}

function attach(input: HTMLInputElement): void {
  if (!wants(input)) return;
  input.dataset.keypad = "on";
  const name = input.getAttribute("aria-label")?.replace(/\s*\([^)]*\)\s*$/, "") || "Valeur";
  const keypad = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "aria-label": `Calculatrice : ${name}`, "data-field-keypad": "" }, "⌨");
  // The field and its keypad side by side, where the field was.
  const pair = el("span", { class: "flex min-w-0 items-center gap-1" });
  input.replaceWith(pair);
  input.classList.add("min-w-0", "flex-1");
  pair.append(input, keypad);
  keypad.addEventListener("pointerdown", (event) => event.stopPropagation());
  keypad.addEventListener("click", (event) => {
    event.stopPropagation();
    const unit = unitOf(input);
    const shown = parseNumber(input.value) ?? 0;
    const r = keypad.getBoundingClientRect();
    // In the 3D view (a field drawn there): beside it, kept inside the view. In a panel: under the field, over the
    // panel — never over the 3D view it is set for.
    const inPanel = input.closest<HTMLElement>('[role="dialog"]');
    const container = (inPanel ? document.body : (input.closest("main") ?? document.querySelector("#editor main") ?? document.body)) as HTMLElement;
    const box = container.getBoundingClientRect();
    const row = (input.closest("label") ?? pair).getBoundingClientRect();
    const panel = (inPanel ?? pair).getBoundingClientRect();
    openCalculator({
      container,
      // Beside the field, kept inside the area.
      anchor: { x: Math.max(box.left + 8, Math.min(r.right + 8, box.right - 248)), y: r.top + r.height / 2 },
      ...(inPanel ? { under: { left: Math.max(8, Math.min(panel.right - 248, row.right - 240)), top: row.top, bottom: row.bottom } } : {}),
      value: unit ? fromDisplay(shown, unit) : shown,
      unit: unit ?? "deg",
      plain: !unit,
      title: name,
      locked: true,
      noLock: true,
      allowNegative: true,
      onSubmit: (value) => {
        input.value = trim(unit ? toDisplay(value, unit) : value, 4);
        // As if typed: what listens to the field takes it.
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
    });
  });
}

export function bindFieldKeypads(root: HTMLElement): void {
  const all = (node: ParentNode) => node.querySelectorAll<HTMLInputElement>(FIELDS).forEach(attach);
  all(root);
  new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes) if (node instanceof HTMLElement) (node.matches(FIELDS) ? attach(node as HTMLInputElement) : all(node));
  }).observe(root, { subtree: true, childList: true });
}
