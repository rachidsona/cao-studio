/**
 * A sketch stored with the extrusions made in the same step (a Répartition and its divisions): each element is a body
 * of its own (they touch, so one extrusion would fuse them), named after what it is; the bodies a step made before
 * are replaced, and the step remembers its new ones. Pure: used by the sketch controller and by the Dressing assistant.
 */
import type { SketchGeometry } from "./sketch";
import type { SketchExtrusion } from "../sketcher/mode";
import { addExtrude, deleteFeature, updateFeature } from "./operations";
import type { CadDocument } from "./types";

/** « Côté 3 »: the next number after the bodies of this name already in the document. */
export function nextNumber(doc: CadDocument, name: string): number {
  const used = doc.features.map((f) => new RegExp(`^${name} (\\d+)$`).exec(f.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  return Math.max(0, ...used) + 1;
}

export function withSketchExtrusion(base: CadDocument, featureId: string, geometry: SketchGeometry, extrusion?: SketchExtrusion): CadDocument {
  const doc = updateFeature(base, featureId, (f) => (f.type === "sketch" ? { ...f, ...geometry } : f));
  if (!extrusion) return doc;
  let next = doc;
  // Every body made again is removed first, so the new ones are numbered from 1 again (Cloison 1, 2…).
  for (const group of extrusion.groups) for (const old of group.remove ?? []) next = deleteFeature(next, old);
  for (const group of extrusion.groups) {
    const made: string[] = [];
    for (const element of group.elements) {
      next = addExtrude(next, featureId, group.distance);
      const id = next.features[next.features.length - 1]?.id as string;
      const name = element.numbered ? `${element.name} ${nextNumber(next, element.name)}` : element.name;
      next = updateFeature(next, id, (f) => (f.type === "extrude" ? { ...f, name, regions: [element.probe] } : f));
      next = { ...next, bodyNames: { ...next.bodyNames, [id]: name } };
      made.push(id);
    }
    // The step remembers its bodies, to make them again when it is changed.
    const record = group.record;
    if (record) next = updateFeature(next, featureId, (f) => (f.type === "sketch" ? { ...f, offsets: f.offsets?.map((o) => (o.id === record ? { ...o, bodies: made } : o)) } : f));
  }
  return next;
}
