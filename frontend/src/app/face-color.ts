/**
 * « Couleur de la face » (panneau Sélection, une face ou plusieurs choisies dans la vue) : ces faces seules prennent une
 * couleur — une laque satinée de la couleur choisie —, le reste du corps garde la sienne ; « D'origine » la leur rend.
 * La vue passe aux apparences pour la montrer. Le même réglage que l'outil Apparence, « Seulement la face choisie ».
 */
import { faceLooks, faceMarks, matchFace, setFaceAppearance } from "../appearance/face-looks";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** The paint a face's own colour goes on. */
const PAINT = "lacquer-satin";

/** The faces picked, each by its mark (how it is found again on its body). */
function picks(editor: Editor, viewport: Viewport) {
  return editor.picked.selection.faces.flatMap((f) => {
    const mesh = viewport.bodyMesh(f.bodyId);
    const mark = mesh ? faceMarks(mesh)[f.faceIndex] : undefined;
    return mark ? [{ bodyId: f.bodyId, mark }] : [];
  });
}

/** The colour of the first face picked, when it has one of its own. */
export function pickedFaceColor(editor: Editor, viewport: Viewport): string | null {
  const [first] = picks(editor, viewport);
  if (!first) return null;
  const looks = faceLooks(editor.doc, first.bodyId);
  const at = matchFace(looks, first.mark);
  return at >= 0 ? (looks[at]!.color ?? null) : null;
}

/** The faces picked painted this colour (null: their own look back), in one step; the view shows the appearances. */
export function paintPickedFaces(root: HTMLElement, editor: Editor, viewport: Viewport, color: string | null): void {
  const faces = picks(editor, viewport);
  if (!faces.length) return editor.notify("Choisissez d'abord une face dans la vue.", "info");
  void editor.change(setFaceAppearance(editor.doc, faces, color ? PAINT : null, color ?? undefined));
  const render = root.querySelector<HTMLButtonElement>('[data-workshop="render"]');
  if (color && render?.getAttribute("aria-pressed") === "false") render.click();
  editor.notify(color ? `${faces.length > 1 ? `${faces.length} faces colorées` : "Face colorée"} ; le reste du corps garde sa couleur.` : "La face a repris la couleur de son corps.", "success");
}
