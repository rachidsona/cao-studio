/**
 * « Arêtes cachées » (groupe Curic, comme Curic Hidden) : un interrupteur qui efface les lignes de joint entre les
 * pièces qui se rejoignent à fleur (viewport/joint-edges.ts), pour voir le meuble comme une seule surface lisse — les
 * pièces restent séparées, la liste de débit et la mise en plan ne changent pas. L'état est gardé dans ce navigateur.
 */
import type { Viewport } from "../viewport/viewport";

const KEY = "cao.hidden-joints";

export function bindHiddenJoints(root: HTMLElement, viewport: Viewport): void {
  const button = root.querySelector<HTMLButtonElement>("[data-hidden-joints]");
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: shown.
  }
  const set = (value: boolean) => {
    on = value;
    viewport.setJointsHidden(on);
    button?.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
  };
  set(on);
  button?.addEventListener("click", () => set(!on));
}
