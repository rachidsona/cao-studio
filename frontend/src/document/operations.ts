/**
 * Pure edits of the parametric history. Each function returns a new document
 * and never mutates its input, so every edit can be undone.
 */
import { rectangleAt } from "./sketch";
import {
  cloneDocument,
  consumedBodies,
  featureInputs,
  featureOfBody,
  PART_SEPARATOR,
  SOLID_FEATURES,
  type CadDocument,
  type Feature,
  type HoleFeature,
} from "./types";

export function uniqueId(doc: CadDocument, prefix: string): string {
  const used = new Set(doc.features.map((f) => f.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function uniqueName(doc: CadDocument, base: string): string {
  const used = new Set(doc.features.map((f) => f.name));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function findFeature(doc: CadDocument, id: string): Feature | undefined {
  return doc.features.find((f) => f.id === id);
}

/** Replaces one feature by an updated copy (merging the patch). */
export function updateFeature(doc: CadDocument, id: string, patch: (feature: Feature) => Feature): CadDocument {
  const next = cloneDocument(doc);
  const index = next.features.findIndex((f) => f.id === id);
  const feature = next.features[index];
  if (!feature) throw new Error(`Opération « ${id} » introuvable.`);
  next.features[index] = patch(feature);
  return next;
}

/** Adds a rectangular plate as a new body: a sketch plus a "new body" extrusion. */
export function addPlate(doc: CadDocument, width = 80, height = 50, thickness = 10, cx = 0, cy = 0): CadDocument {
  const next = cloneDocument(doc);
  const sketchId = uniqueId(next, "sk");
  next.features.push({
    id: sketchId,
    type: "sketch",
    name: uniqueName(next, "Esquisse"),
    plane: "XY",
    offset: 0,
    ...rectangleAt(cx, cy, width, height),
  });
  next.features.push({
    id: uniqueId(next, "ex"),
    type: "extrude",
    name: uniqueName(next, "Extrusion"),
    sketch: sketchId,
    distance: thickness,
    operation: "new",
  });
  return next;
}

/** Extrudes a sketch as a new body. */
export function addExtrude(doc: CadDocument, sketchId: string, distance = 10): CadDocument {
  const next = cloneDocument(doc);
  next.features.push({
    id: uniqueId(next, "ex"),
    type: "extrude",
    name: uniqueName(next, "Extrusion"),
    sketch: sketchId,
    distance,
    operation: "new",
  });
  return next;
}

/** Adds a through hole on a body at (x, y). */
export function addHole(doc: CadDocument, target: string, x: number, y: number, diameter = 10): CadDocument {
  const next = cloneDocument(doc);
  const hole: HoleFeature = {
    id: uniqueId(next, "h"),
    type: "hole",
    name: uniqueName(next, "Perçage"),
    target,
    x,
    y,
    diameter,
    depth: "through",
  };
  next.features.push(hole);
  return next;
}

/** Ids of every feature that depends, directly or not, on `id`. */
export function dependentsOf(doc: CadDocument, id: string): string[] {
  const affected = new Set([id]);
  for (const feature of doc.features) {
    // Inputs may name one body of a multi-body feature ("split1#2").
    if (featureInputs(feature).some((input) => affected.has(featureOfBody(input)))) affected.add(feature.id);
  }
  affected.delete(id);
  return doc.features.filter((f) => affected.has(f.id)).map((f) => f.id);
}

/**
 * Deletes a feature. Dependent features are deleted too, except features that
 * merely consume the deleted body: they are rewired to the body it consumed,
 * so deleting a hole keeps the holes drilled after it.
 */
export function deleteFeature(doc: CadDocument, id: string): CadDocument {
  const feature = findFeature(doc, id);
  if (!feature) return doc;
  const replacement = consumedBodies(feature)[0];
  let next = cloneDocument(doc);
  if (replacement) {
    next.features = next.features.map((f) => {
      if (f.type === "hole" && f.target === id) return { ...f, target: replacement };
      if (f.type === "extrude" && f.target === id) return { ...f, target: replacement };
      return f;
    });
  }
  const removed = new Set([id, ...dependentsOf(next, id)]);
  next = { ...next, features: next.features.filter((f) => !removed.has(f.id)) };
  // A freed id can be reused by a later feature: it must not inherit the name (or the hidden state) of a deleted body.
  const gone = (key: string) => removed.has(featureOfBody(key));
  if (next.bodyNames) next = { ...next, bodyNames: Object.fromEntries(Object.entries(next.bodyNames).filter(([key]) => !gone(key))) };
  if (next.hiddenBodies) next = { ...next, hiddenBodies: next.hiddenBodies.filter((key) => !gone(key)) };
  return next;
}

/** The body that results from `bodyId` after every later feature consuming it. */
export function latestBody(doc: CadDocument, bodyId: string): string {
  let current = bodyId;
  for (const feature of doc.features) {
    if (consumedBodies(feature).includes(current)) current = feature.id;
  }
  return current;
}

/** A piece of a split ("sp1#2"): a body of its own, whereas a single solid keeps the body it comes from. */
const isPiece = (bodyId: string) => bodyId.includes(PART_SEPARATOR);

/** Feature (or piece) that created a body: the first of its chain that consumes no body ("new" extrusion…). */
export function bodyOrigin(doc: CadDocument, bodyId: string): string {
  let id = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    if (isPiece(id)) return id;
    const feature = findFeature(doc, id);
    const previous = feature ? consumedBodies(feature)[0] : undefined;
    if (!previous) return id;
    id = previous;
  }
  return id;
}

/** Display name of a body: the name given to it, else "Corps n" in order of creation, "… — pièce n" for a split. */
export function bodyLabel(doc: CadDocument, bodyId: string): string {
  const origin = bodyOrigin(doc, bodyId);
  const given = doc.bodyNames?.[origin];
  if (given) return given;
  if (isPiece(origin)) {
    const split = findFeature(doc, featureOfBody(origin));
    const n = Number(origin.slice(featureOfBody(origin).length + PART_SEPARATOR.length)) + 1;
    return `${split?.type === "split" ? bodyLabel(doc, split.target) : featureOfBody(origin)} — pièce ${n}`;
  }
  const origins = doc.features.filter((f) => SOLID_FEATURES.has(f.type) && consumedBodies(f).length === 0).map((f) => f.id);
  const n = origins.indexOf(origin) + 1;
  return n > 0 ? `Corps ${n}` : (findFeature(doc, origin)?.name ?? origin);
}

/** "ofN": an id for a new offset, unused by any feature or by the offsets of the sketches. */
export function uniqueOffsetId(doc: CadDocument): string {
  const used = new Set<string>(doc.features.flatMap((f) => [f.id, ...(f.type === "sketch" ? (f.offsets ?? []).map((o) => o.id) : [])]));
  let n = 1;
  while (used.has(`of${n}`)) n++;
  return `of${n}`;
}

/** Gives a body its own name (kept with the feature that created it). */
export function renameBody(doc: CadDocument, bodyId: string, name: string): CadDocument {
  return { ...doc, bodyNames: { ...doc.bodyNames, [bodyOrigin(doc, bodyId)]: name } };
}

/** Whether a body is hidden: through the feature that created it, or the list of hidden pieces. */
export function isBodyHidden(doc: CadDocument, bodyId: string): boolean {
  const origin = bodyOrigin(doc, bodyId);
  return isPiece(origin) ? !!doc.hiddenBodies?.includes(origin) : !!findFeature(doc, origin)?.hidden;
}

/** Shows or hides a sketch, a body created by a feature, or one piece of a split ("sp1#2"). */
export function toggleHidden(doc: CadDocument, id: string): CadDocument {
  if (!isPiece(id)) return updateFeature(doc, id, (f) => ({ ...f, hidden: !f.hidden }));
  const hidden = new Set(doc.hiddenBodies);
  if (!hidden.delete(id)) hidden.add(id);
  return { ...doc, hiddenBodies: [...hidden] };
}
