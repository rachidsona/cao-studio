/**
 * « Cacher la sélection » (colonne Sélection et vue) : les pièces choisies seules — un tiroir (sa façade et son caisson),
 * une étagère, un côté d'un caisson, pas le caisson entier ; tout le meuble quand il est choisi entier — sont cachées d'un coup (une seule
 * annulation), et restent cachées dans le projet. Sans sélection, le bouton ouvre la liste des éléments cachés, rangés par meuble (un caisson avec ses
 * façades, une Répartition avec ses panneaux, sinon le corps) : « Montrer » en rend un, « Tout montrer » les rend tous.
 * Le nombre d'éléments cachés s'affiche sur le bouton.
 */
import { bodyOrigin, isBodyHidden, setHidden } from "../document/operations";
import type { CadDocument } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { elementName, selectedPieces } from "./isolate-selection";
import { drawerBodies } from "../document/drawer-pick";
import { elementOf } from "./zone-view";

interface HiddenGroup {
  key: string;
  name: string;
  /** What setHidden shows again: the features and pieces of its bodies. */
  ids: string[];
}

/** Whether a body is hidden by its own switch (not by its layer, which « Calques » shows again). */
const ownHidden = (doc: CadDocument, bodyId: string): boolean => {
  const layer = doc.bodyInfo?.[bodyOrigin(doc, bodyId)]?.layer;
  return isBodyHidden(doc, bodyId) && !(layer && doc.layers?.some((l) => l.id === layer && !l.visible));
};

/** The hidden elements, each with the ids of its hidden bodies, in the order of the model. */
export function hiddenGroups(doc: CadDocument, bodyIds: readonly string[]): HiddenGroup[] {
  const groups = new Map<string, HiddenGroup>();
  for (const id of bodyIds) {
    if (!ownHidden(doc, id)) continue;
    const key = elementOf(doc, id);
    const group = groups.get(key) ?? { key, name: elementName(doc, key, id), ids: [] };
    const origin = bodyOrigin(doc, id);
    if (!group.ids.includes(origin)) group.ids.push(origin);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function bindHideSelection(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const found = root.querySelector<HTMLButtonElement>("[data-hide-selection]");
  if (!found) return;
  const button: HTMLButtonElement = found;
  const bodyIds = () => (editor.result?.bodies ?? []).map((b) => b.bodyId);
  let menu: { element: HTMLElement; close: () => void } | null = null;

  const count = () => {
    const n = hiddenGroups(editor.doc, bodyIds()).length;
    button.dataset.count = String(n);
    button.setAttribute("aria-label", n ? `Cacher la sélection (${n} élément${n > 1 ? "s" : ""} caché${n > 1 ? "s" : ""})` : "Cacher la sélection");
  };
  const shown = editor.onShown;
  editor.onShown = (result, doc) => {
    shown(result, doc);
    count();
    if (menu) list();
  };

  const showAgain = (ids: string[]) => void editor.change(setHidden(editor.doc, ids, false));

  function list(): void {
    const groups = hiddenGroups(editor.doc, bodyIds());
    if (!groups.length) return menu?.close();
    const element = menu?.element ?? document.createElement("div");
    element.className = "ribbon-menu";
    element.setAttribute("role", "menu");
    element.setAttribute("aria-label", "Éléments cachés");
    const rows = groups.map((g) => {
      const row = document.createElement("div");
      row.className = "ribbon-menu-item";
      const show = document.createElement("button");
      show.type = "button";
      show.setAttribute("role", "menuitem");
      show.className = "ribbon-menu-run";
      show.dataset.showHidden = g.key;
      show.title = "Montrer à nouveau";
      show.textContent = g.ids.length > 1 ? `${g.name} (${g.ids.length} pièces)` : g.name;
      show.addEventListener("click", () => showAgain(g.ids));
      row.append(show);
      return row;
    });
    const all = document.createElement("button");
    all.type = "button";
    all.className = "ribbon-menu-reset";
    all.textContent = "Tout montrer";
    all.dataset.showAllHidden = "";
    all.addEventListener("click", () => showAgain(groups.flatMap((g) => g.ids)));
    const hint = document.createElement("p");
    hint.className = "ribbon-menu-hint";
    hint.textContent = `${groups.length} élément${groups.length > 1 ? "s" : ""} caché${groups.length > 1 ? "s" : ""} : un clic en montre un.`;
    const footer = document.createElement("div");
    footer.className = "ribbon-menu-footer";
    footer.append(hint, all);
    element.replaceChildren(...rows, footer);
    if (menu) return;
    document.body.append(element);
    const r = button.getBoundingClientRect();
    element.style.left = `${Math.max(8, r.left - element.offsetWidth - 6)}px`;
    element.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - element.offsetHeight - 8))}px`;
    button.setAttribute("aria-expanded", "true");
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !button.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const close = () => {
      element.remove();
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      menu = null;
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    menu = { element, close };
  }

  button.addEventListener("click", () => {
    // The pieces chosen themselves (a drawer, a shelf, a side), not the whole cabinet they are of; a drawer's piece
    // (its front) takes the whole drawer: its box goes with it, as Sélection++ takes it (document/drawer-pick.ts).
    const pieces = selectedPieces(editor);
    if (pieces.size) {
      const { bodies, faces, edges, vertices } = editor.picked.selection;
      const picked = [...bodies, ...faces.map((p) => p.bodyId), ...edges.map((p) => p.bodyId), ...vertices.map((p) => p.bodyId)];
      const whole = picked.flatMap((id) => drawerBodies(editor.doc, id, viewport.displayedBodies));
      viewport.clearSelection();
      void editor.change(setHidden(editor.doc, [...new Set(whole.map((id) => bodyOrigin(editor.doc, id)))], true));
      const names = [...pieces.values()];
      return editor.notify(`${names.length === 1 ? `« ${names[0]} » caché` : `${names.length} éléments cachés`} : ce bouton, sans sélection, les liste pour les montrer à nouveau.`, "info");
    }
    if (menu) return menu.close();
    if (!hiddenGroups(editor.doc, bodyIds()).length) return editor.notify("Sélectionnez d'abord ce qu'il faut cacher : Ctrl ou Maj + clic pour en ajouter, ou une fenêtre de sélection.", "info");
    list();
  });
  count();
}
