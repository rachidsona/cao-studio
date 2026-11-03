/**
 * The piece of furniture a body belongs to, as the navigator groups it: a cabinet (its carcass, its fronts, the
 * finishes made for it) or a « Répartition » (every panel, shelf, partition and equipment of its sketch). Used by
 * « Mise en plan du caisson sélectionné » (menu of the project's name): a sheet of that furniture alone. Pure.
 */
import { isPartition } from "../sketcher/partition-history";
import { bodyOrigin, findFeature } from "./operations";
import { PART_SEPARATOR, featureInputs, featureOfBody, type CadDocument } from "./types";

export interface Furniture {
  key: string;
  name: string;
}

/** The furniture of a body, or null when it is a body of its own (a plate, a wall, a light). */
export function furnitureOf(doc: CadDocument, bodyId: string, depth = 0): Furniture | null {
  const origin = bodyOrigin(doc, bodyId);
  const feature = findFeature(doc, origin.includes(PART_SEPARATOR) ? featureOfBody(origin) : origin);
  if (!feature) return null;
  if (feature.type === "cabinet") return { key: `cabinet:${feature.id}`, name: feature.name };
  if (feature.type === "fronts") {
    const cabinet = findFeature(doc, feature.cabinet);
    return cabinet ? { key: `cabinet:${cabinet.id}`, name: cabinet.name } : null;
  }
  // Finishes (plinth, end panels…) belong to the furniture they were made for.
  if (feature.type === "trim") return depth < 3 && feature.source?.[0] ? furnitureOf(doc, feature.source[0], depth + 1) : null;
  const sketchId = feature.type === "niche" ? feature.sketch : featureInputs(feature)[0];
  const sketch = sketchId ? findFeature(doc, sketchId) : undefined;
  if (sketch?.type === "sketch" && sketch.offsets?.some(isPartition)) return { key: `corps:${sketch.id}`, name: sketch.name };
  return null;
}

/** The furniture of the bodies picked (the first one that belongs to one) and all its displayed bodies. */
export function furnitureBodies(doc: CadDocument, displayed: readonly string[], picked: readonly string[]): (Furniture & { bodies: string[] }) | null {
  for (const id of picked) {
    const furniture = furnitureOf(doc, id);
    if (!furniture) continue;
    return { ...furniture, bodies: displayed.filter((b) => furnitureOf(doc, b)?.key === furniture.key) };
  }
  return null;
}
