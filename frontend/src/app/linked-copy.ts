/**
 * « Copie liée » (comme les composants de SketchUp) : une copie des corps sélectionnés, posée à côté, qui reste une
 * fonction de l'original — modifier l'original (cotes, usinages) met la copie à jour. On la place ensuite avec
 * Déplacer ou Tourner : elle reste liée. C'est un réseau d'une copie dans l'historique.
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { CadDocument, Vec3 } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** The document with one linked copy of `bodies`, `gap` mm beside their box along X. */
export function addLinkedCopy(doc: CadDocument, bodies: string[], box: [Vec3, Vec3], gap = 50): { doc: CadDocument; id: string } {
  const id = uniqueId(doc, "ar");
  const step: Vec3 = [Number((box[1][0] - box[0][0] + gap).toFixed(6)), 0, 0];
  return { doc: { ...doc, features: [...doc.features, { id, type: "array", name: uniqueName(doc, "Copie liée"), targets: bodies, step, count: 1 }] }, id };
}

export function bindLinkedCopy(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-linked-copy]')?.addEventListener("click", () => {
    const { bodies, faces } = editor.picked.selection;
    const ids = [...new Set([...bodies, ...faces.map((f) => f.bodyId)])];
    if (!ids.length) return editor.notify("Sélectionnez d'abord les corps à copier (clic, Maj + clic ou fenêtre).", "info");
    const boxes = ids.map((id) => viewport.bodyMesh(id)?.metrics.bbox).filter((b): b is [Vec3, Vec3] => !!b);
    const box: [Vec3, Vec3] = [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
    void editor.change(addLinkedCopy(editor.doc, ids, box).doc);
    editor.notify("Copie liée créée à côté : placez-la avec Déplacer ; elle suit les modifications de l'original.", "success");
  });
}
