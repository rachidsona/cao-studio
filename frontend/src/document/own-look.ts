/**
 * Ce qui garde son aspect quand on donne une apparence (un bois) à toute une sélection : la quincaillerie — vitres,
 * tringles et leurs supports, poignées — et une façade vitrée à cadre alu ; ce qui s'achète tout fait (électroménager,
 * murs, garnitures) ; et toute pièce dont l'aspect n'est pas de la sorte de celui qu'on donne — un plan de travail en
 * marbre ne prend pas un bois, un caisson ne prend pas un granit (`lookFamily`). Un seul corps choisi la prend quand
 * même : on l'a visé exprès. Pur.
 */
import { frontsParts } from "../features/fronts-parts";
import { isGlass, woodFrame } from "../features/glass-door";
import { nichePartsIn } from "../features/niche-parts";
import { bodyAppearance } from "../appearance/assign";
import { appearanceById, type CategoryId } from "../appearance/library";
import { bodyInfo } from "./materials";
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

/**
 * The sort of pieces an appearance is for: panels (wood, melamine, lacquer, plastic), tops (stone, sintered stone,
 * concrete), or its own category; null: any piece (one's own image).
 */
export function lookFamily(category: CategoryId): string | null {
  if (category === "custom") return null;
  if (["wood", "melamine", "paint", "plastic"].includes(category)) return "panel";
  if (["stone", "sintered", "concrete"].includes(category)) return "top";
  return category;
}

/** Whether this body, as it looks now, is not of the sort `appearanceId` is for (a bought piece never is). */
function otherSort(doc: CadDocument, bodyId: string, appearanceId: string): boolean {
  if (findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)))?.type === "appliance" || bodyInfo(doc, bodyId).room) return true;
  const [now, given] = [bodyAppearance(doc, bodyId, undefined)?.appearance, appearanceById(appearanceId)];
  const [a, b] = [now && lookFamily(now.category), given && lookFamily(given.category)];
  return !!a && !!b && a !== b;
}

/**
 * The bodies of a selection that take an appearance: all of one; of several, the ones that are not glass or metal,
 * nor of another sort than `appearanceId` (none given: back to their material's look, for all).
 */
export function lookTargets(doc: CadDocument, bodyIds: readonly string[], appearanceId?: string | null): string[] {
  if (bodyIds.length < 2) return [...bodyIds];
  return bodyIds.filter((b) => !keepsOwnLook(doc, b) && !(appearanceId && otherSort(doc, b, appearanceId)));
}
