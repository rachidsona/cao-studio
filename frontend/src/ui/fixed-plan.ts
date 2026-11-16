/**
 * Le plan en haut d'un panneau — le schéma de la Répartition (dressing), les murs et la bande d'un linéaire (Plan de
 * cuisine) — reste fixe pendant qu'on fait défiler les réglages en dessous, ou défile avec eux : la case « Plan fixe »
 * le choisit, pour le dressing comme pour la cuisine, et le navigateur s'en souvient.
 */
import { el } from "./dom";

const KEY = "cao:plan-fixed";

/** Whether the plan stays at the top of its panel (the usual). */
export function planFixed(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setPlanFixed(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // For this window only.
  }
}

/** The classes that keep the block of the plan at the top of its panel while it scrolls (none: it scrolls along). */
export const fixedPlanClass = (): string => (planFixed() ? "sticky top-0 z-10" : "relative");

/** The « Plan fixe » box: ticked, the plan stays at the top; `changed` draws the panel again. */
export function fixedPlanToggle(changed: () => void): HTMLElement {
  const box = el("input", { type: "checkbox", checked: planFixed(), "aria-label": "Plan fixe", "data-plan-fixed": "" });
  box.addEventListener("change", () => {
    setPlanFixed(box.checked);
    // A panel does not draw itself again under a field being edited: the box lets go first.
    box.blur();
    changed();
  });
  return el("label", { class: "flex items-center justify-end gap-1.5 text-2xs text-gray-500 dark:text-gray-400", title: "Coché : le plan reste en haut du panneau quand on fait défiler les réglages. Décoché : il défile avec eux." }, box, "Plan fixe");
}
