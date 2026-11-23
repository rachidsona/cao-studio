/**
 * « Grille » (colonne Vue, à droite de la vue) : afficher ou cacher la grille de la vue 3D. Cachée, le dessin
 * s'accroche toujours à son pas. « Axes », juste dessous : les trois axes de la vue (viewport/world-axes.ts), comme la case
 * « Afficher les axes » de Magie extrusion. Les choix sont gardés dans ce navigateur.
 */
import type { Viewport } from "../viewport/viewport";
import { axesVisible, restoreAxes, setAxesVisible } from "../viewport/world-axes";

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
  // The three axes too (Magie extrusion's « Afficher les axes »), as they were left.
  const axes = root.querySelector<HTMLButtonElement>("[data-axes-toggle]");
  document.addEventListener("cad:axes-visible", (event) => axes?.setAttribute("aria-pressed", String((event as CustomEvent<boolean>).detail)));
  restoreAxes(viewport);
  axes?.setAttribute("aria-pressed", String(axesVisible(viewport)));
  axes?.addEventListener("click", () => setAxesVisible(viewport, !axesVisible(viewport)));
  button?.addEventListener("click", () => set(!viewport.gridVisible));
}
