/**
 * Selection filter of the 3D model toolbar (Auto / Faces / Arêtes / Points / Corps):
 * what a click selects. The choice is remembered per browser. The "Fenêtre" button
 * makes a drag draw a selection window instead of turning the view.
 */
import type { SelectionFilter, Viewport } from "../viewport/viewport";

const KEY = "cao-studio:selection-filter";
const FILTERS: ReadonlySet<string> = new Set(["auto", "face", "edge", "vertex", "body"]);

function stored(): SelectionFilter {
  try {
    const value = localStorage.getItem(KEY);
    return value && FILTERS.has(value) ? (value as SelectionFilter) : "auto";
  } catch {
    return "auto";
  }
}

export function bindSelectionFilter(root: HTMLElement, viewport: Viewport): void {
  const apply = (filter: SelectionFilter) => {
    viewport.selectionFilter = filter;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-select-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.selectFilter === filter));
    }
  };
  root.addEventListener("click", (event) => {
    const windowButton = (event.target as HTMLElement).closest<HTMLElement>("[data-select-window]");
    if (windowButton) {
      viewport.windowSelect = !viewport.windowSelect;
      windowButton.setAttribute("aria-pressed", String(viewport.windowSelect));
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-select-filter]");
    const filter = button?.dataset.selectFilter;
    if (!filter || !FILTERS.has(filter)) return;
    // A different filter starts a fresh selection (faces and bodies are not mixed).
    if (filter !== viewport.selectionFilter) viewport.clearSelection();
    apply(filter as SelectionFilter);
    try {
      localStorage.setItem(KEY, filter);
    } catch {
      // Private mode: the choice simply is not remembered.
    }
  });
  apply(stored());
}
