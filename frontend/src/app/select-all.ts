/**
 * « Tout sélectionner » : tous les corps et toutes les esquisses montrés dans la vue d'un coup, comme une fenêtre de
 * sélection qui couvrirait tout le modèle ; ce qui est caché (calques, isolement, coupe) n'est pas pris. Bouton de la
 * colonne Vue, Ctrl ou ⌘ + A hors d'une esquisse (dans une esquisse, Ctrl + A prend tout le dessin) ; Échap vide la
 * sélection. La sélection seulement : rien ne change dans le projet.
 */
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** « 12 corps et 2 esquisses sélectionnés », or why nothing is. */
export function selectAllText(bodies: number, sketches: number): string {
  if (!bodies && !sketches) return "Rien à sélectionner : aucun corps ni esquisse n'est montré dans la vue.";
  const parts = [bodies ? `${bodies} corps` : "", sketches ? `${sketches} esquisse${sketches > 1 ? "s" : ""}` : ""].filter(Boolean);
  return `Tout est sélectionné : ${parts.join(" et ")}. Échap vide la sélection.`;
}

export function selectAll(viewport: Viewport, editor: Editor): void {
  const { bodies, sketches } = viewport.selectAll();
  editor.notify(selectAllText(bodies, sketches), "info");
}

export function bindSelectAll(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector<HTMLButtonElement>("[data-select-all]")?.addEventListener("click", () => selectAll(viewport, editor));
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "a" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (root.dataset.mode !== "model" || viewport.inSketch || root.dataset.tool) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    selectAll(viewport, editor);
  });
}
