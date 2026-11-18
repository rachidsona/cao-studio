/**
 * La bande d'un linéaire de cuisine sans ses portes ni ses façades de tiroir, pour voir l'intérieur des caissons :
 * étagères, cloisons, tiroirs (app/kitchen/unit-elevation.ts). La case « Sans portes » le choisit, à côté de « Plan
 * fixe », et le navigateur s'en souvient.
 */
import { el } from "../../ui/dom";

const KEY = "cao:strip-no-doors";

/** Whether the strips are drawn without their fronts. */
export function doorsHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** The « Sans portes » box: ticked, the units are drawn open; `changed` draws the panel again. */
export function doorsToggle(changed: () => void): HTMLElement {
  const box = el("input", { type: "checkbox", checked: doorsHidden(), "aria-label": "Sans portes", "data-strip-no-doors": "" });
  box.addEventListener("change", () => {
    try {
      localStorage.setItem(KEY, box.checked ? "1" : "0");
    } catch {
      // For this window only: drawn as asked anyway.
    }
    box.blur();
    changed();
  });
  return el("label", { class: "flex items-center gap-1.5 text-2xs text-gray-500 dark:text-gray-400", title: "Coché : les meubles sont dessinés sans leurs portes ni leurs façades de tiroir, pour voir leur intérieur (étagères, cloisons, tiroirs)." }, box, "Sans portes");
}
