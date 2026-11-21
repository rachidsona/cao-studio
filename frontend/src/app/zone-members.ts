/**
 * Ce qui reste dans la vue quand une zone, un caisson ou des éléments sont isolés (app/zone-view.ts), sans DOM : un corps
 * reste quand ce dont il est fait est gardé ; un corps tiré d'une face (Extrusion de faces, même en « Nouveau corps »)
 * reste avec le corps d'où il est tiré, une pièce faite d'une autre (ses côtés séparés, un congé, une découpe) avec
 * celle dont elle est faite — le cadre d'une façade de tiroir séparé reste avec son mur. Lu sur le document montré,
 * aperçu d'un outil compris : une étagère qu'on extrude ne disparaît pas pendant qu'on règle la distance.
 */
import { bodyOrigin, findFeature } from "../document/operations";
import { consumedBodies, featureOfBody, type CadDocument, type Feature } from "../document/types";

/** What decides, for the feature a body is made by (and the body), whether it stays in view. */
export type Keep = (feature: Feature, bodyId: string) => boolean;

/** The body a face extrusion is pulled from, or undefined. */
const pulledFrom = (feature: Feature): string | undefined => (feature.type === "extrude" && feature.faces && feature.target ? feature.target : undefined);

/** Whether this body of `doc` stays in view. */
export function staysInView(doc: CadDocument, bodyId: string, keep: Keep): boolean {
  let id = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    if (!feature) return false;
    if (keep(feature, id)) return true;
    const from = pulledFrom(feature) ?? consumedBodies(feature)[0];
    if (!from) return false;
    id = from;
  }
  return false;
}
