/**
 * Ce qui garde son aspect quand on donne une apparence (un bois) à toute une sélection : la quincaillerie — vitres,
 * tringles et leurs supports, poignées — et une façade vitrée à cadre alu. Un seul corps choisi la prend quand même :
 * on l'a visé exprès. Pur.
 */
import { frontsParts } from "../features/fronts-parts";
import { isGlass, woodFrame } from "../features/glass-door";
import { nichePartsIn } from "../features/niche-parts";
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument } from "./types";

/** Whether this body keeps its own look (glass, metal) when a whole selection takes an appearance. */
export function keepsOwnLook(doc: CadDocument, bodyId: string): boolean {
  const origin = bodyOrigin(doc, bodyId);
  const f = findFeature(doc, featureOfBody(origin));
  if (!f || !origin.includes(PART_SEPARATOR)) return false;
  const n = Number(origin.slice(origin.indexOf(PART_SEPARATOR) + 1));
  if (f.type === "niche") {
    const part = nichePartsIn(doc.features, f)[n];
    // A glazed front with an aluminium frame: the frame is metal.
    return part?.role === "hardware" || (part?.role === "front" && isGlass(f) && !woodFrame(f));
  }
  if (f.type === "fronts") {
    const part = frontsParts(f, findFeature(doc, f.cabinet) as CabinetFeature | undefined)[n];
    return part?.of !== undefined || (!!part?.role && isGlass(f) && !woodFrame(f));
  }
  return false;
}

/** The bodies of a selection that take an appearance: all of one, the ones that are not glass or metal of several. */
export function lookTargets(doc: CadDocument, bodyIds: readonly string[]): string[] {
  if (bodyIds.length < 2) return [...bodyIds];
  return bodyIds.filter((b) => !keepsOwnLook(doc, b));
}
