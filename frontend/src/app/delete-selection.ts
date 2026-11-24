/**
 * What Suppr deletes, whatever is picked in the 3D view: whole bodies and
 * sketches; a body through a face, an edge or a corner of it (the whole body:
 * the question says so); a piece of a cabinet, of panels or of a split on its
 * own (the operation and its other pieces stay; all its pieces picked, the operation itself goes) — a door or a
 * drawer front with its handle and its glass; a Répartition with nothing left in view, with it; lines and points
 * of a sketch, taken out of it (with
 * their constraints). An area of a sketch is not deleted (its lines are, or
 * the whole sketch). What the deleted operations were made from goes with them when nothing else uses it — the
 * sketch of an extrusion, a revolve, a sweep (not a Répartition, which makes its own panels, nor a kitchen's or a dressing's plan) —: nothing of them is left in the
 * project. Everything goes in one undo step.
 */
import { bodyLabel, bodyOrigin, deleteFeatures, featuresOfPick, findFeature } from "../document/operations";
import { withHangingParts } from "../document/door-edit";
import { emptiedPartitions } from "../document/empty-partition";
export { removeStep, removeWithShelves } from "../document/shelf-removal";
import { featureInputs, featureOfBody, type CadDocument, type SketchFeature } from "../document/types";
import { removeEntities } from "../sketcher/edit";
import { isPartition } from "../sketcher/partition-history";
import { askConfirm } from "../ui/confirm-dialog";
import type { ModelSelection } from "../viewport/viewport";

export interface Deletion {
  /** Features deleted: what made each whole body, and whole sketches. */
  features: string[];
  /** Pieces of multi-body operations removed on their own. */
  pieces: string[];
  /** Bodies deleted whole although only a face, an edge or a corner of them is picked. */
  implied: string[];
  /** Sketches whose picked lines and points are taken out. */
  edits: SketchFeature[];
  /** Areas of sketches picked, which are not deleted. */
  skipped: number;
}

/**
 * `displayed`: the bodies in the view. With them, an operation all of whose pieces are picked (a cabinet chosen whole,
 * every door of its fronts) is deleted itself rather than emptied piece by piece: nothing of it is left, and what
 * hangs on it (a cabinet's fronts) goes with it.
 */
export function deletionOf(doc: CadDocument, selection: Partial<ModelSelection>, displayed: readonly string[] = []): Deletion {
  const bodies = [...(selection.bodies ?? [])];
  const implied: string[] = [];
  for (const { bodyId } of [...(selection.faces ?? []), ...(selection.edges ?? []), ...(selection.vertices ?? [])]) {
    if (!bodies.includes(bodyId)) {
      bodies.push(bodyId);
      implied.push(bodyId);
    }
  }
  const whole = selection.sketches ?? [];
  const pick = featuresOfPick(doc, bodies, whole);
  // A door or a drawer front taken out alone takes its handle and its glass with it.
  const picked = { ...pick, pieces: withHangingParts(doc, pick.pieces) };
  const ownerOf = (body: string) => featureOfBody(bodyOrigin(doc, body));
  // The operations with no piece left in the view once these are gone.
  const emptied = [...new Set(picked.pieces.map(featureOfBody))].filter((owner) => displayed.some((b) => ownerOf(b) === owner) && displayed.every((b) => ownerOf(b) !== owner || picked.pieces.includes(bodyOrigin(doc, b))));
  const taken = [...new Set([...picked.ids, ...emptied])];
  const left = picked.pieces.filter((p) => !emptied.includes(featureOfBody(p)));
  // A Répartition whose panels are all out (a module kept with its pieces only), its last piece in view gone: it goes too.
  const empty = emptiedPartitions(doc, taken, left, displayed);
  const ids = withSources(doc, [...new Set([...taken, ...empty])]);
  const pieces = left.filter((p) => !empty.includes(featureOfBody(p)));
  const items = (selection.sketch ?? []).filter((p) => !whole.includes(p.sketchId));
  const edits = [...new Set(items.filter((p) => p.kind !== "region").map((p) => p.sketchId))].flatMap((sketchId) => {
    const sketch = findFeature(doc, sketchId);
    if (sketch?.type !== "sketch") return [];
    const gone = items.filter((p) => p.sketchId === sketchId && p.kind !== "region").map((p) => p.id);
    return [{ ...sketch, ...removeEntities(sketch, gone) }];
  });
  return { features: ids, pieces, implied, edits, skipped: items.filter((p) => p.kind === "region").length };
}

/** The features with the sketches they were made from that nothing else would use once they are gone (not a plan's). */
function withSources(doc: CadDocument, ids: string[]): string[] {
  if (!ids.length) return ids;
  const after = deleteFeatures(doc, ids).next;
  const used = new Set(after.features.flatMap(featureInputs).map(featureOfBody));
  const sources = new Set(doc.features.filter((f) => !findFeature(after, f.id)).flatMap(featureInputs).map(featureOfBody));
  const orphans = [...sources].filter((id) => {
    const s = findFeature(after, id);
    // A Répartition makes its own panels: a body of its own, not a mere outline.
    return s?.type === "sketch" && !used.has(id) && !s.kitchenPlan && !s.dressingPlan && !(s.offsets ?? []).some(isPartition);
  });
  return [...ids, ...orphans];
}

/** The question to ask before deleting more than what is picked, or null when nothing needs asking. */
export function deletionQuestion(doc: CadDocument, deletion: Deletion): string | null {
  const parts: string[] = [];
  if (deletion.implied.length) parts.push(`le${deletion.implied.length > 1 ? "s corps entiers" : " corps entier"} « ${deletion.implied.map((id) => bodyLabel(doc, id)).join(", ")} » (une face, une arête ou un coin est sélectionné)`);
  return parts.length ? `Supprimer ${parts.join(", et ")} ?` : null;
}

/** Asks (in the page) before deleting more than what is picked; true when the deletion may go on. */
export async function confirmDeletion(doc: CadDocument, deletion: Deletion): Promise<boolean> {
  const question = deletionQuestion(doc, deletion);
  return !question || askConfirm(question, "Supprimer");
}
