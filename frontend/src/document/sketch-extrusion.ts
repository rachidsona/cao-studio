/**
 * A sketch stored with the extrusions made in the same step (a Répartition and its divisions): each element is a body
 * of its own (they touch, so one extrusion would fuse them), named after what it is; the bodies a step made before
 * are replaced and keep what they carried (material, edges, layer, appearance), and the step remembers its new ones;
 * the doors of its partitions follow, and its modules programmed their niches (module-follow.ts). Pure: used by the
 * sketch controller and by the Dressing assistant.
 */
import type { SketchGeometry } from "./sketch";
import type { SketchExtrusion } from "../sketcher/mode";
import { addExtrude, bodyOrigin, deleteFeature, findFeature, uniqueId, uniqueName, updateFeature } from "./operations";
import { withModulesFollowing } from "./module-follow";
import { syncPartitionDoors } from "./partition-doors";
import type { BodyInfo, CadDocument, NicheFeature, SketchFeature } from "./types";

/** Drawers and rods of this sketch as changed in the step: each one replaces its own; a new one gets an id and a name of its own. */
function withNiches(doc: CadDocument, sketchId: string, niches: readonly NicheFeature[] = []): CadDocument {
  let next = doc;
  for (const f of niches) {
    if (f.sketch !== sketchId) continue;
    if (findFeature(next, f.id)?.type === "niche") next = { ...next, features: next.features.map((g) => (g.id === f.id ? structuredClone(f) : g)) };
    else next = { ...next, features: [...next.features, { ...structuredClone(f), id: uniqueId(next, f.fill === "rod" ? "pd" : f.fill === "accessory" ? "ac" : "td"), name: uniqueName(next, f.name.replace(/ \d+$/, "")) }] };
  }
  return next;
}

/** « Côté 3 »: the next number after the bodies of this name already in the document. */
export function nextNumber(doc: CadDocument, name: string): number {
  const used = doc.features.map((f) => new RegExp(`^${name} (\\d+)$`).exec(f.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  return Math.max(0, ...used) + 1;
}

/** What these bodies carry, kind by kind (« Étagère », « Côté »…), in their order. */
function carried(doc: CadDocument, bodies: string[]): Map<string, BodyInfo[]> {
  const kinds = new Map<string, BodyInfo[]>();
  for (const id of bodies) {
    const kind = (findFeature(doc, id)?.name ?? "").replace(/ \d+$/, "");
    kinds.set(kind, [...(kinds.get(kind) ?? []), doc.bodyInfo?.[id] ?? {}]);
  }
  return kinds;
}

/** The step of a Répartition that made this body — the partition, or a division of its niches — and its sketch. */
export function stepOfBody(doc: CadDocument, body: string): { sketch: string; offset: string; name: string; kind: "partition" | "shelves" } | null {
  const origin = bodyOrigin(doc, body);
  for (const f of doc.features) {
    if (f.type !== "sketch") continue;
    const record = f.offsets?.find((r) => r.bodies?.includes(origin));
    if (record?.step) return { sketch: f.id, offset: record.id, name: record.name, kind: record.step.kind };
  }
  return null;
}

export function withSketchExtrusion(base: CadDocument, featureId: string, geometry: SketchGeometry, extrusion?: SketchExtrusion): CadDocument {
  const pruned = (extrusion?.removeNiches ?? []).reduce((d, id) => (findFeature(d, id)?.type === "niche" ? deleteFeature(d, id) : d), base);
  const updated = withNiches(updateFeature(pruned, featureId, (f) => (f.type === "sketch" ? { ...f, ...geometry } : f)), featureId, extrusion?.niches);
  const doc = (extrusion?.repath ?? []).reduce((d, { partition, path }) => ({ ...d, features: d.features.map((f) => (f.type === "niche" && f.sketch === featureId && f.partition === partition && (f.fill === "rod" || f.fill === "drawers") ? { ...f, niche: path(f.niche) } : f)) }), updated);
  // The doors of its partitions follow (made, changed or taken away with their step), and its modules programmed their niches.
  if (!extrusion) return withModulesFollowing(syncPartitionDoors(doc, featureId), featureId);
  let next = doc;
  const { clip, ceiling } = (findFeature(doc, featureId) ?? {}) as Pick<SketchFeature, "clip" | "ceiling">;
  const kept = new Map(extrusion.groups.map((group) => [group, carried(doc, group.remove ?? [])]));
  // Every body made again is removed first, so the new ones are numbered from 1 again (Cloison 1, 2…).
  for (const group of extrusion.groups) for (const old of group.remove ?? []) next = deleteFeature(next, old);
  for (const group of extrusion.groups) {
    const made: string[] = [];
    for (const element of group.elements) {
      next = addExtrude(next, featureId, group.distance);
      const id = next.features[next.features.length - 1]?.id as string;
      const name = element.numbered ? `${element.name} ${nextNumber(next, element.name)}` : element.name;
      next = updateFeature(next, id, (f) => (f.type === "extrude" ? { ...f, name, regions: [element.probe], ...(clip ? { clip } : {}), ...(ceiling ? { ceiling } : {}) } : f));
      next = { ...next, bodyNames: { ...next.bodyNames, [id]: name } };
      // The k-th of a kind from the k-th; one more than before from the last.
      const before = kept.get(group)?.get(element.name);
      const info = before && before.length > 1 ? before.shift() : before?.[0];
      if (info && Object.keys(info).length) next = { ...next, bodyInfo: { ...next.bodyInfo, [id]: info } };
      made.push(id);
    }
    // The step remembers its bodies, to make them again when it is changed.
    const record = group.record;
    if (record) next = updateFeature(next, featureId, (f) => (f.type === "sketch" ? { ...f, offsets: f.offsets?.map((o) => (o.id === record ? { ...o, bodies: made } : o)) } : f));
  }
  return withModulesFollowing(syncPartitionDoors(next, featureId), featureId);
}
