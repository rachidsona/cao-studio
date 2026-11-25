/**
 * « Sélectionner … entier », au clic droit sur n'importe quelle pièce d'un élément (une porte, un côté, une étagère, le
 * dessus, le dessous…) : tout l'élément dont elle est — un caisson avec ses façades, une Répartition avec ses panneaux,
 * un habillage de réfrigérateur avec ses côtés et son réfrigérateur, un appareil d'électroménager —, comme Coller par
 * face le prend (`glueKey`). Rien quand la pièce est seule à être son élément.
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { CadDocument } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import { glueKey } from "./face-glue-tool";

/** The element a body is a piece of, its name and its bodies shown; null when the body is its own element. */
export function wholeSelection(doc: CadDocument, displayed: readonly string[], bodyId: string): { name: string; bodies: string[] } | null {
  const key = glueKey(doc, bodyId);
  const bodies = displayed.filter((id) => glueKey(doc, id) === key);
  if (bodies.length < 2) return null;
  return { name: findFeature(doc, key)?.name ?? bodyLabel(doc, bodyId), bodies };
}

/** The menu's item that selects it all, or null. */
export function selectWholeItem(viewport: Viewport, doc: CadDocument, bodyId: string): [string, () => void] | null {
  const whole = wholeSelection(doc, viewport.displayedBodies, bodyId);
  if (!whole) return null;
  return [`Sélectionner « ${whole.name} » entier`, () => {
    viewport.clearSelection();
    for (const id of whole.bodies) viewport.toggleInSelection("body", id);
  }];
}
