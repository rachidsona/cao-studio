/**
 * Ce qu'on déplace avec « Le corps entier » : le meuble ou la Répartition dont l'élément est une pièce. Un caisson
 * se déplace par son origine, ses façades le suivent ; une Répartition par son esquisse, ses panneaux, portes et niches
 * la suivent. Le meuble reste ainsi un seul meuble, réglable, avec une seule annulation.
 */
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument } from "../document/types";

export interface Whole {
  kind: "cabinet" | "sketch";
  id: string;
  name: string;
  /** Its bodies in the view. */
  bodies: string[];
}

/** The feature that holds a body together with its neighbours. */
function ownerOf(doc: CadDocument, bodyId: string): { kind: Whole["kind"]; id: string } | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  if (f?.type === "cabinet") return { kind: "cabinet", id: f.id };
  if (f?.type === "fronts") return { kind: "cabinet", id: f.cabinet };
  if ((f?.type === "extrude" || f?.type === "niche" || f?.type === "panels") && f.sketch) return { kind: "sketch", id: f.sketch };
  return null;
}

/** The whole a body belongs to, among the bodies shown; null when it stands alone (it is its own whole). */
export function wholeOf(doc: CadDocument, bodyId: string, displayed: readonly string[]): Whole | null {
  const owner = ownerOf(doc, bodyId);
  const feature = owner && findFeature(doc, owner.id);
  if (!owner || !feature) return null;
  const bodies = displayed.filter((id) => {
    const other = ownerOf(doc, id);
    return other?.kind === owner.kind && other.id === owner.id;
  });
  return bodies.length > 1 ? { ...owner, name: feature.name, bodies } : null;
}
