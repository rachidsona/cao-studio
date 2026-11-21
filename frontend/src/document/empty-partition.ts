/**
 * Une Répartition vide : tous ses panneaux retirés de la vue (un module inséré « Seulement les pièces choisies », ses
 * pièces ensuite supprimées). Elle ne doit plus servir d'esquisse par défaut aux outils (Module, Étagères…), et la
 * suppression qui en ôte la dernière pièce visible l'emporte avec ce qui en dépend, en une annulation. Pur.
 */
import { dependencies } from "./library";
import { bodyOrigin } from "./operations";
import { featureOfBody, type CadDocument, type SketchFeature } from "./types";
import { isPartition } from "../sketcher/partition-history";

const isHolder = (f: CadDocument["features"][number]): f is SketchFeature => f.type === "sketch" && (f.offsets ?? []).some(isPartition);

/** Whether every panel of this Répartition is out of the model (`removed`: the bodies taken out). */
export function isEmptyPartition(doc: CadDocument, sketch: SketchFeature, removed: ReadonlySet<string> = new Set(doc.removedBodies ?? [])): boolean {
  const panels = doc.features.filter((f) => f.type === "extrude" && f.sketch === sketch.id);
  return panels.length > 0 && panels.every((f) => removed.has(f.id));
}

/**
 * The Répartitions this deletion leaves empty with nothing of them left in view, and every feature that depends on
 * them: to delete with it. `ids`, `pieces`: what the deletion takes; `displayed`: the bodies in view before it.
 */
export function emptiedPartitions(doc: CadDocument, ids: readonly string[], pieces: readonly string[], displayed: readonly string[]): string[] {
  const removed = new Set([...(doc.removedBodies ?? []), ...pieces]);
  const memo = new Map<string, Set<string>>();
  // A feature and all it depends on, transitively.
  const upstream = (id: string): Set<string> => {
    const known = memo.get(id);
    if (known) return known;
    const out = new Set<string>([id]);
    memo.set(id, out);
    const f = doc.features.find((x) => x.id === id);
    for (const dep of f ? dependencies(doc, f) : []) for (const x of upstream(dep)) out.add(x);
    return out;
  };
  const owner = (body: string) => featureOfBody(bodyOrigin(doc, body));
  const gone = (body: string) => removed.has(bodyOrigin(doc, body)) || ids.some((id) => upstream(owner(body)).has(id));
  const empty = doc.features.filter((s): s is SketchFeature => isHolder(s) && !ids.includes(s.id) && isEmptyPartition(doc, s, removed)).filter((s) => {
    const using = displayed.filter((b) => upstream(owner(b)).has(s.id));
    return using.length > 0 && using.every(gone);
  });
  if (!empty.length) return [];
  const sketches = new Set(empty.map((s) => s.id));
  return doc.features.filter((f) => [...upstream(f.id)].some((x) => sketches.has(x))).map((f) => f.id);
}
