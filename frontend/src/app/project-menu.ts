/**
 * The menu of the project's name (top bar): back to the projects, the project's sheet, what goes to the workshop (the
 * production folder, the cut list, the drawings) and to the client (the quote, the link), the workshop's settings; the drawing of the whole
 * project, and « Mise en plan du caisson sélectionné » — a sheet of the cabinet one of whose pieces is picked in the
 * view (or of the only cabinet of the model), the other bodies left out (app/drawing/standard-views.ts).
 */
import { furnitureBodies, furnitureOf } from "../document/cabinet-of";
import { keyOf } from "../ui/ribbon-layout";
import type { Viewport } from "../viewport/viewport";
import { cabinetSheetName, type CabinetFocus } from "./drawing/standard-views";
import type { Editor } from "./editor";

/** The bodies picked in the view, whatever was picked of them (whole, a face, an edge, a corner). */
export function pickedBodies(selection: Editor["picked"]["selection"]): string[] {
  const ids = [...selection.bodies, ...selection.faces.map((f) => f.bodyId), ...selection.edges.map((e) => e.bodyId), ...selection.vertices.map((v) => v.bodyId)];
  return [...new Set(ids)];
}

export function bindProjectMenu(root: HTMLElement, viewport: Viewport, editor: Editor, openDrawing: (focus: CabinetFocus) => void): void {
  const menu = root.querySelector<HTMLDetailsElement>("[data-project-menu]");
  if (!menu) return;
  // A choice closes the menu; so does a click elsewhere.
  menu.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest('[role="menuitem"]')) menu.removeAttribute("open");
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.removeAttribute("open");
  });
  // « Pour l'atelier », « Pour le client »: the ribbon's tools, as if clicked there (folded or hidden too).
  for (const item of menu.querySelectorAll<HTMLElement>("[data-menu-run]")) {
    item.addEventListener("click", () => {
      const key = item.dataset.menuRun!;
      const tool = [...root.querySelectorAll<HTMLElement>('[data-ribbon="model"] button')].find((b) => keyOf(b) === key);
      tool?.click();
    });
  }
  menu.querySelector("[data-project-menu-cabinet]")?.addEventListener("click", () => {
    const doc = editor.doc;
    const displayed = viewport.displayedBodies;
    let found = furnitureBodies(doc, displayed, pickedBodies(editor.picked.selection));
    if (!found) {
      // Nothing of a cabinet picked: the only cabinet of the model, if there is one.
      const keys = new Set(displayed.map((id) => furnitureOf(doc, id)?.key).filter((k): k is string => !!k));
      if (keys.size === 1) found = furnitureBodies(doc, displayed, displayed);
    }
    if (!found || !found.bodies.length) {
      editor.notify("Cliquez d'abord une pièce du caisson dans la vue (un côté, une porte, une étagère…), puis « Mise en plan du caisson sélectionné ».", "info");
      return;
    }
    openDrawing({ name: found.name, sheetName: cabinetSheetName(found.name), bodies: found.bodies });
  });
}
