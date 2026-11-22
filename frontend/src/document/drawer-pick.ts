/**
 * Un tiroir entier, pris par une de ses pièces : sa façade (séparée en cadre aussi), ses côtés, son arrière, son fond,
 * sa vitre, sa poignée — pour le choisir d'un coup (Sélection++ dans la vue, son dossier dans le Navigateur). Les
 * tiroirs d'une niche et ceux des façades d'un caisson. Pur.
 */
import { frontsParts } from "../features/fronts-parts";
import { nichePartsIn } from "../features/niche-parts";
import { bodyOrigin, findFeature } from "./operations";
import { consumedBodies, featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument } from "./types";

/** A drawer: the feature that makes it, its number. */
export interface Drawer {
  feature: string;
  n: number;
}

const NUMBER = /\btiroir (\d+)\b/i;

/** The drawer a body is part of (through what was made of a piece: its front split into a frame…), or null. */
export function drawerOf(doc: CadDocument, bodyId: string): Drawer | null {
  let id = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    const origin = bodyOrigin(doc, id);
    const f = findFeature(doc, featureOfBody(origin));
    if (!f) return null;
    if (origin.includes(PART_SEPARATOR) && (f.type === "niche" || f.type === "fronts")) {
      const parts = f.type === "niche" ? nichePartsIn(doc.features, f) : frontsParts(f, findFeature(doc, f.cabinet) as CabinetFeature | undefined);
      const n = NUMBER.exec(parts[Number(origin.slice(origin.indexOf(PART_SEPARATOR) + 1))]?.name ?? "")?.[1];
      return n ? { feature: f.id, n: Number(n) } : null;
    }
    // A piece made from one body (its sides split, a cut): the drawer of that body.
    const from = consumedBodies(f);
    if (from.length !== 1) return null;
    id = from[0]!;
  }
  return null;
}

/** All the bodies shown of the drawer `bodyId` is part of (itself alone when it is no drawer). */
export function drawerBodies(doc: CadDocument, bodyId: string, displayed: readonly string[]): string[] {
  const drawer = drawerOf(doc, bodyId);
  if (!drawer) return [bodyId];
  return displayed.filter((b) => {
    const d = drawerOf(doc, b);
    return d?.feature === drawer.feature && d.n === drawer.n;
  });
}
