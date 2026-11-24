/**
 * « Isoler la sélection » : plusieurs éléments choisis (Ctrl ou Maj + clic, une fenêtre, le navigateur) restent seuls
 * dans la vue pour y travailler, les autres cachés, comme « Isoler » de Fusion. Un élément est le meuble entier dont on
 * a choisi une pièce, une face ou une arête : un caisson avec ses façades, une Répartition avec ses panneaux et ses
 * niches, sinon le corps lui-même. Ce qu'on crée pendant ce temps se voit aussi. Bouton de la colonne Vue, touche I,
 * clic droit ; « Tout montrer » (ou I sans sélection) rend le reste. Quand quelque chose est déjà isolé (un mur vu
 * seul, un meuble), « Isoler » descend d'un cran : les pièces choisies seules (le cadre d'une façade de tiroir, une
 * étagère). La vue seulement : rien ne change dans le projet. Dans chaque menu du clic droit, « Modifier la sélection »
 * ouvre l'outil principal de l'élément choisi (ou celui cliqué) : pour ce que le Plan de cuisine a fait, le plan sur son
 * linéaire, son meuble choisi ; sinon l'outil qui l'a fait, comme un double-clic dans l'arbre.
 */
import { bodyLabel, bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument } from "../document/types";
import { kitchenRunOf } from "../document/kitchen-floor";
import { planItemOf } from "../document/kitchen-plan-add";
import { kitchenRunOpen } from "./kitchen/kitchen-plan-tool";
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

/** The pieces of the selection themselves (their bodies), each with its name. */
export function selectedPieces(editor: Editor): Map<string, string> {
  const doc = editor.doc;
  const { bodies, faces, edges, vertices } = editor.picked.selection;
  const out = new Map<string, string>();
  for (const id of [...bodies, ...faces.map((p) => p.bodyId), ...edges.map((p) => p.bodyId), ...vertices.map((p) => p.bodyId)]) out.set(bodyOrigin(doc, id), bodyLabel(doc, id));
  return out;
}

/** Inside what is isolated already, the pieces chosen alone; else the whole elements they belong to. */
const toIsolate = (editor: Editor) => (isolating() ? selectedPieces(editor) : selectedElements(editor));

/** The name of an element: its cabinet's or its Répartition's, else its body's. */
export function elementName(doc: CadDocument, key: string, bodyId: string): string {
  const owner = key.includes(":") ? findFeature(doc, key.slice(key.indexOf(":") + 1)) : undefined;
  return owner?.name ?? bodyLabel(doc, bodyId);
}

/** « 3 éléments isolés », « « Bas 2 portes » isolé ». */
export const isolatedText = (names: readonly string[]): string => (names.length === 1 ? `« ${names[0]} » isolé` : `${names.length} éléments isolés`);

/** Isolates the selection; with nothing selected, shows everything again when something is isolated. */
export function isolateSelection(editor: Editor): void {
  const elements = toIsolate(editor);
  if (elements.size) {
    isolateElements(new Set(elements.keys()), isolatedText([...elements.values()]));
    return editor.notify(`${isolatedText([...elements.values()])} : les autres sont cachés. « Tout montrer » (ou la touche I) les rend.`, "info");
  }
  if (isolating()) return showAll();
  editor.notify("Sélectionnez d'abord les éléments à isoler : Ctrl ou Maj + clic pour en ajouter, ou une fenêtre de sélection.", "info");
}

/**
 * « Modifier la sélection »: the main tool of the element chosen — the first selected, else the one clicked. Made by the
 * Plan de cuisine: the plan on its run, its unit chosen there, « Meuble choisi » open; else the tool that made it, as a
 * double click in the tree. Null when it was made by nothing one edits.
 */
export function modifyMenuItem(editor: Editor, viewport: Viewport, clicked?: string): [string, () => void] | null {
  const { bodies, faces, edges, vertices } = editor.picked.selection;
  const picked = [...bodies, ...faces.map((p) => p.bodyId), ...edges.map((p) => p.bodyId), ...vertices.map((p) => p.bodyId)];
  const bodyId = picked[0] ?? clicked;
  const feature = bodyId ? findFeature(editor.doc, featureOfBody(bodyId)) : undefined;
  if (!bodyId || !feature) return null;
  const label = picked.length ? "Modifier la sélection" : `Modifier « ${bodyLabel(editor.doc, bodyId)} »`;
  const owner = kitchenRunOf(editor.doc, feature.id);
  if (!owner) return [label, () => editor.editFeature(feature.id)];
  return [label, () => {
    // A body of the plan selected opens its run (app/kitchen/kitchen-plan-tool.ts); its unit then chosen there.
    viewport.selectLevel({ bodies: [bodyId] }, false);
    const cabinet = feature.type === "cabinet" ? feature.id : feature.type === "fronts" ? feature.cabinet : null;
    const item = cabinet ? planItemOf(editor.doc, cabinet)?.item : undefined;
    const open = kitchenRunOpen();
    if (item && open?.plan === owner.plan && open.run === owner.run) open.choose(item);
  }];
}

/** The line of a menu that isolates the selection (or shows everything again), or null: nothing to do. */
export function isolateMenuItem(editor: Editor): [string, () => void] | null {
  const count = toIsolate(editor).size;
  if (count && isolating()) return [count > 1 ? `Isoler ces ${count} pièces seules` : "Isoler la pièce seule", () => isolateSelection(editor)];
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
