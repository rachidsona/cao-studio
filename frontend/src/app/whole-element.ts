/**
 * « Sélectionner … entier », au clic droit sur n'importe quelle pièce d'un élément (une porte, un côté, une étagère, le
 * dessus, le dessous…) : tout l'élément dont elle est — un caisson avec ses façades, une Répartition avec ses panneaux,
 * un appareil d'électroménager (une pièce du réfrigérateur : le réfrigérateur seul) ; le caisson ou un côté d'un
 * habillage de réfrigérateur, tout l'habillage, un seul meuble (comme Coller par face : `glueKey`).
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { CadDocument } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import { alignWhole } from "./align-whole";
import { elementKey } from "../document/swap";
import { glueKey } from "./face-glue-tool";

/**
 * The element a body is a piece of, its name and its bodies shown; null when the body is its own element. The piece
 * clicked is followed: a part of the fridge selects the fridge, a door of the surround's caisson the caisson; only a
 * piece alone in its element (a side of the surround) takes what it stands in (the whole surround).
 */
export function wholeSelection(doc: CadDocument, displayed: readonly string[], bodyId: string): { name: string; bodies: string[] } | null {
  const own = (key: (id: string) => string) => {
    const k = key(bodyId);
    return { k, bodies: displayed.filter((id) => key(id) === k) };
  };
  // Its own element first (a cabinet with its fronts, a Répartition, an appliance), else the unit it is a piece of; the
  // caisson of a unit made of several (a surround's) is that whole unit: its sides and its fridge with it.
  const near = own((id) => alignWhole(doc, id)?.kind === "sketch" ? alignWhole(doc, id)!.id : elementKey(doc, id));
  const unit = own((id) => glueKey(doc, id));
  const { k, bodies } = near.bodies.length > 1 && near.k !== unit.k ? near : unit;
  if (bodies.length < 2) return null;
  return { name: findFeature(doc, k)?.name ?? bodyLabel(doc, bodyId), bodies };
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
