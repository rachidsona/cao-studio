/**
 * « Isoler la sélection » : plusieurs éléments choisis (Ctrl ou Maj + clic, une fenêtre, le navigateur) restent seuls
 * dans la vue pour y travailler, les autres cachés, comme « Isoler » de Fusion. Un élément est le meuble entier dont on
 * a choisi une pièce, une face ou une arête : un caisson avec ses façades, une Répartition avec ses panneaux et ses
 * niches, sinon le corps lui-même. Ce qu'on crée pendant ce temps se voit aussi. Bouton de la colonne Vue, touche I,
 * clic droit ; « Tout montrer » (ou I sans sélection) rend le reste. La vue seulement : rien ne change dans le projet.
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { CadDocument } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { elementOf, isolateElements, isolating, showAll } from "./zone-view";

/** The elements of the selection, by key (zone-view.ts, `elementOf`), each with a name. */
export function selectedElements(editor: Editor): Map<string, string> {
  const doc = editor.doc;
  const { bodies, faces, edges, vertices } = editor.picked.selection;
  const out = new Map<string, string>();
  for (const id of [...bodies, ...faces.map((p) => p.bodyId), ...edges.map((p) => p.bodyId), ...vertices.map((p) => p.bodyId)]) {
    const key = elementOf(doc, id);
    if (!out.has(key)) out.set(key, elementName(doc, key, id));
  }
  return out;
}

/** The name of an element: its cabinet's or its Répartition's, else its body's. */
function elementName(doc: CadDocument, key: string, bodyId: string): string {
  const owner = key.includes(":") ? findFeature(doc, key.slice(key.indexOf(":") + 1)) : undefined;
  return owner?.name ?? bodyLabel(doc, bodyId);
}

/** « 3 éléments isolés », « « Bas 2 portes » isolé ». */
export const isolatedText = (names: readonly string[]): string => (names.length === 1 ? `« ${names[0]} » isolé` : `${names.length} éléments isolés`);

/** Isolates the selection; with nothing selected, shows everything again when something is isolated. */
export function isolateSelection(editor: Editor): void {
  const elements = selectedElements(editor);
  if (elements.size) {
    isolateElements(new Set(elements.keys()), isolatedText([...elements.values()]));
    return editor.notify(`${isolatedText([...elements.values()])} : les autres sont cachés. « Tout montrer » (ou la touche I) les rend.`, "info");
  }
  if (isolating()) return showAll();
  editor.notify("Sélectionnez d'abord les éléments à isoler : Ctrl ou Maj + clic pour en ajouter, ou une fenêtre de sélection.", "info");
}

/** The line of a menu that isolates the selection (or shows everything again), or null: nothing to do. */
export function isolateMenuItem(editor: Editor): [string, () => void] | null {
  const count = selectedElements(editor).size;
  if (count) return [count > 1 ? `Isoler la sélection (${count} éléments)` : "Isoler la sélection", () => isolateSelection(editor)];
  return isolating() ? ["Tout montrer", () => showAll()] : null;
}

export function bindIsolateSelection(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-isolate-selection]");
  button?.addEventListener("click", () => isolateSelection(editor));
  document.addEventListener("cad:isolated", () => button?.setAttribute("aria-pressed", String(isolating())));
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "i" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (root.dataset.mode !== "model" || viewport.inSketch || root.dataset.tool) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    isolateSelection(editor);
  });
}
