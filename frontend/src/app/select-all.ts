/**
 * « Tout sélectionner » : tous les corps et toutes les esquisses montrés dans la vue d'un coup, comme une fenêtre de
 * sélection qui couvrirait tout le modèle ; ce qui est caché (calques, isolement, coupe) n'est pas pris. Bouton de la
 * colonne Vue, Ctrl ou ⌘ + A hors d'une esquisse (dans une esquisse, Ctrl + A prend tout le dessin) ; Échap vide la
 * sélection. « Sélectionner les esquisses » de même, mais les esquisses seules (comme le filtre « Corps » prend les
 * corps) : pour les déplacer, les cacher, les supprimer d'un coup. La sélection seulement : rien ne change dans le projet.
 */
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** « 12 corps et 2 esquisses sélectionnés », or why nothing is. */
export function selectAllText(bodies: number, sketches: number): string {
  if (!bodies && !sketches) return "Rien à sélectionner : aucun corps ni esquisse n'est montré dans la vue.";
  const parts = [bodies ? `${bodies} corps` : "", sketches ? `${sketches} esquisse${sketches > 1 ? "s" : ""}` : ""].filter(Boolean);
  return `Tout est sélectionné : ${parts.join(" et ")}. Échap vide la sélection.`;
}

/** « 3 esquisses sélectionnées », or why none is: none in the project, or all hidden (`total`: the project's). */
export function selectSketchesText(shown: number, total: number): string {
  if (!shown) return total ? `Aucune esquisse montrée dans la vue : les ${total > 1 ? `${total} esquisses sont cachées` : "esquisse est cachée"} — l'œil du titre « Esquisses » les montre.` : "Aucune esquisse dans le projet.";
  const hidden = total - shown;
  return `${shown} esquisse${shown > 1 ? "s" : ""} sélectionnée${shown > 1 ? "s" : ""}${hidden > 0 ? ` (${hidden} cachée${hidden > 1 ? "s" : ""}, non prise${hidden > 1 ? "s" : ""})` : ""}. Échap vide la sélection.`;
}

export function selectSketches(viewport: Viewport, editor: Editor): void {
  const shown = viewport.selectSketches();
  const total = editor.doc.features.filter((f) => f.type === "sketch").length;
  editor.notify(selectSketchesText(shown, total), shown ? "info" : "error");
}

export function selectAll(viewport: Viewport, editor: Editor): void {
  const { bodies, sketches } = viewport.selectAll();
  editor.notify(selectAllText(bodies, sketches), "info");
}

export function bindSelectAll(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector<HTMLButtonElement>("[data-select-all]")?.addEventListener("click", () => selectAll(viewport, editor));
  root.querySelector<HTMLButtonElement>("[data-select-sketches]")?.addEventListener("click", () => selectSketches(viewport, editor));
  // « Supprimer la sélection »: the Suppr key as a button.
  root.querySelector<HTMLButtonElement>("[data-delete-selection]")?.addEventListener("click", () => {
    if (!editor.deleteSelection()) editor.notify("Rien à supprimer : sélectionnez d'abord un élément (un clic, une fenêtre ou « Tout sélectionner »).", "info");
  });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "a" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (root.dataset.mode !== "model" || viewport.inSketch || root.dataset.tool) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    selectAll(viewport, editor);
  });
}
