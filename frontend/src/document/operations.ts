/**
 * Pure edits of the parametric history. Each function returns a new document
 * and never mutates its input, so every edit can be undone.
 */
import { rectangleAt } from "./sketch";
import { cloneDocument, consumedBodies, featureInputs, SOLID_FEATURES, type CadDocument, type Feature, type HoleFeature } from "./types";

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
    if (featureInputs(feature).some((input) => affected.has(input))) affected.add(feature.id);
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
  if (next.bodyNames) {
    // A freed id can be reused by a later feature: it must not inherit the name of a deleted body.
    const names = Object.fromEntries(Object.entries(next.bodyNames).filter(([key]) => !removed.has(key)));
    next = { ...next, bodyNames: names };
  }
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

/** Feature that created a body: the first of its chain that consumes no body ("new" extrusion…). */
export function bodyOrigin(doc: CadDocument, bodyId: string): string {
  let id = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    const feature = findFeature(doc, id);
    const previous = feature ? consumedBodies(feature)[0] : undefined;
    if (!previous) return id;
    id = previous;
  }
  return id;
}

/** Display name of a body: the name given to it, else "Corps n" in order of creation. */
export function bodyLabel(doc: CadDocument, bodyId: string): string {
  const origin = bodyOrigin(doc, bodyId);
  const given = doc.bodyNames?.[origin];
  if (given) return given;
  const origins = doc.features.filter((f) => SOLID_FEATURES.has(f.type) && consumedBodies(f).length === 0).map((f) => f.id);
  const n = origins.indexOf(origin) + 1;
  return n > 0 ? `Corps ${n}` : (findFeature(doc, origin)?.name ?? origin);
}

/** Gives a body its own name (kept with the feature that created it). */
export function renameBody(doc: CadDocument, bodyId: string, name: string): CadDocument {
  return { ...doc, bodyNames: { ...doc.bodyNames, [bodyOrigin(doc, bodyId)]: name } };
}

/** Shows or hides a feature in the 3D view (sketches, and the body a feature created). */
export function toggleHidden(doc: CadDocument, id: string): CadDocument {
  return updateFeature(doc, id, (f) => ({ ...f, hidden: !f.hidden }));
}
