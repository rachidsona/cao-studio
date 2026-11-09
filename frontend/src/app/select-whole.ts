/**
 * Un double-clic sur une pièce dans la vue sélectionne le meuble entier dont elle est une pièce : un caisson avec ses
 * côtés, dessus, dessous, fond, étagères et ses façades (portes, tiroirs), une Répartition avec ses panneaux, portes et
 * niches (app/move-whole.ts). De même sur une pièce du navigateur. Déplacer, Supprimer, Copier, les cotes… prennent
 * alors le meuble entier. Seulement hors d'un outil et d'une esquisse ; une pièce seule reste sélectionnée seule.
 */
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { wholeOf } from "./move-whole";

/** Two clicks closer than this are a double-click (ms). */
const DOUBLE = 450;

export function bindSelectWhole(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const free = () => root.dataset.mode === "model" && !viewport.inSketch && !root.dataset.tool;
  /** The whole of this body selected, in place of what was. */
  const selectWhole = (bodyId: string) => {
    const whole = wholeOf(editor.doc, bodyId, viewport.displayedBodies);
    if (!whole) return;
    viewport.clearSelection();
    for (const id of whole.bodies) viewport.toggleInSelection("body", id);
    editor.notify(`« ${whole.name} » sélectionné en entier : ${whole.bodies.length} pièces.`, "info");
  };
  viewport.renderer.domElement.addEventListener("dblclick", (event) => {
    const face = free() ? viewport.pickFace(event as PointerEvent) : null;
    if (face) selectWhole(face.bodyId);
  });
  // The same on a piece of the navigator: two clicks on it in a row (it is drawn again at the first, so the
  // browser's own double-click does not come), after the navigator has selected the piece.
  let last: { body: string; at: number } | null = null;
  root.addEventListener("click", (event) => {
    const entry = (event.target as HTMLElement).closest<HTMLElement>('[data-select^="body:"]');
    if (!entry || event.shiftKey || event.ctrlKey || event.metaKey) return void (last = null);
    const body = entry.dataset.select!.slice("body:".length);
    const now = performance.now();
    if (last && last.body === body && now - last.at < DOUBLE && free()) {
      last = null;
      return selectWhole(body);
    }
    last = { body, at: now };
  });
}
