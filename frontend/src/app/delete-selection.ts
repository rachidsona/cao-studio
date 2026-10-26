/**
 * What Suppr deletes, whatever is picked in the 3D view: whole bodies and
 * sketches; a body through a face, an edge or a corner of it (the whole body:
 * the question says so); lines and points of a sketch, taken out of it (with
 * their constraints). An area of a sketch is not deleted (its lines are, or
 * the whole sketch). Everything goes in one undo step.
 */
import { bodyLabel, featuresOfPick, findFeature } from "../document/operations";
import type { CadDocument, SketchFeature } from "../document/types";
import { removeEntities } from "../sketcher/edit";
import { askConfirm } from "../ui/confirm-dialog";
import type { ModelSelection } from "../viewport/viewport";

export interface Deletion {
  /** Features deleted: what made each body (a piece takes its whole operation), and whole sketches. */
  features: string[];
  /** Multi-body operations taken whole because one of their pieces is picked. */
  wholes: string[];
  /** Bodies deleted whole although only a face, an edge or a corner of them is picked. */
  implied: string[];
  /** Sketches whose picked lines and points are taken out. */
  edits: SketchFeature[];
  /** Areas of sketches picked, which are not deleted. */
  skipped: number;
}

export function deletionOf(doc: CadDocument, selection: Partial<ModelSelection>): Deletion {
  const bodies = [...(selection.bodies ?? [])];
  const implied: string[] = [];
  for (const { bodyId } of [...(selection.faces ?? []), ...(selection.edges ?? []), ...(selection.vertices ?? [])]) {
    if (!bodies.includes(bodyId)) {
      bodies.push(bodyId);
      implied.push(bodyId);
    }
  }
  const whole = selection.sketches ?? [];
  const { ids, wholes } = featuresOfPick(doc, bodies, whole);
  const items = (selection.sketch ?? []).filter((p) => !whole.includes(p.sketchId));
  const edits = [...new Set(items.filter((p) => p.kind !== "region").map((p) => p.sketchId))].flatMap((sketchId) => {
    const sketch = findFeature(doc, sketchId);
    if (sketch?.type !== "sketch") return [];
    const gone = items.filter((p) => p.sketchId === sketchId && p.kind !== "region").map((p) => p.id);
    return [{ ...sketch, ...removeEntities(sketch, gone) }];
  });
  return { features: ids, wholes, implied, edits, skipped: items.filter((p) => p.kind === "region").length };
}

/** The question to ask before deleting more than what is picked, or null when nothing needs asking. */
export function deletionQuestion(doc: CadDocument, deletion: Deletion): string | null {
  const parts: string[] = [];
  if (deletion.implied.length) parts.push(`le${deletion.implied.length > 1 ? "s corps entiers" : " corps entier"} « ${deletion.implied.map((id) => bodyLabel(doc, id)).join(", ")} » (une face, une arête ou un coin est sélectionné)`);
  if (deletion.wholes.length) parts.push(`toute l'opération « ${deletion.wholes.map((id) => findFeature(doc, id)?.name ?? id).join(", ")} » et toutes ses pièces`);
  return parts.length ? `Supprimer ${parts.join(", et ")} ?` : null;
}

/** Asks (in the page) before deleting more than what is picked; true when the deletion may go on. */
export async function confirmDeletion(doc: CadDocument, deletion: Deletion): Promise<boolean> {
  const question = deletionQuestion(doc, deletion);
  return !question || askConfirm(question, "Supprimer");
}
