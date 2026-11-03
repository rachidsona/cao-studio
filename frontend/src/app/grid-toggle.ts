/**
 * « Grille » (colonne Vue, à droite de la vue) : afficher ou cacher la grille de la vue 3D. Cachée, le dessin
 * s'accroche toujours à son pas. Le choix est gardé dans ce navigateur.
 */
import type { Viewport } from "../viewport/viewport";

const KEY = "cao.grid-visible";

export function bindGridToggle(root: HTMLElement, viewport: Viewport): void {
  const button = root.querySelector<HTMLButtonElement>("[data-grid-toggle]");
  const set = (on: boolean) => {
    viewport.gridVisible = on;
    button?.setAttribute("aria-pressed", String(on));
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
  };
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== "0";
  } catch {
    // No storage: shown.
  }
  set(on);
  button?.addEventListener("click", () => set(!viewport.gridVisible));
}
