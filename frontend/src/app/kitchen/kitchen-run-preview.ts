/**
 * L'aperçu d'un linéaire en cours de changement : à chaque changement de l'éditeur de linéaire, la cuisine est refaite
 * avec lui et montrée dans la 3D sans être enregistrée (Editor.showUnrecorded). OK l'enregistre en une annulation,
 * Annuler (ou fermer) remet la 3D du projet. La vue isolée d'un mur et ses cotes suivent l'aperçu.
 */
import { kitchenPlanIn, withKitchenBuilt } from "../../document/kitchen-floor";
import type { CornerSetting } from "../../document/kitchen-corners";
import type { RestSide } from "../../document/kitchen-plan-shapes";
import type { CadDocument, KitchenRunItem } from "../../document/types";
import type { Editor } from "../editor";

let previewing: CadDocument | null = null;

/** The document shown in the 3D: the preview of a run being changed, else the project. */
export const shownDoc = (editor: Editor): CadDocument => previewing ?? editor.doc;

/** The kitchen made again with these changes of one run, shown in the 3D without being recorded. */
export async function previewRun(editor: Editor, planId: string, runId: string, [items, rest, corners]: [KitchenRunItem[], RestSide, CornerSetting]): Promise<void> {
  const plan = kitchenPlanIn(editor.doc, planId);
  if (!plan) return;
  const made = withKitchenBuilt(editor.doc, planId, { runs: { ...plan.runs, [runId]: items }, rest: { ...plan.rest, [runId]: rest }, ...corners });
  if (typeof made === "string") return;
  previewing = made.doc;
  await editor.showUnrecorded(made.doc);
}

/** The 3D of the project again (nothing if no preview is shown). */
export function endPreview(editor: Editor): Promise<void> {
  if (!previewing) return Promise.resolve();
  previewing = null;
  return editor.showUnrecorded(null);
}
