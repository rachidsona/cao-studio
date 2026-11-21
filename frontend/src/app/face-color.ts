/**
 * « Couleur de la face » (panneau Sélection, une face ou plusieurs choisies dans la vue) : ces faces seules prennent une
 * couleur — une laque satinée de la couleur choisie —, le reste du corps garde la sienne ; « D'origine » la leur rend.
 * La vue passe aux apparences pour la montrer. Le même réglage que l'outil Apparence, « Seulement la face choisie ».
 * « Sens du fil » (même panneau) : le veinage des pièces choisies (par un corps ou une de ses faces) en longueur, en
 * largeur, ou sans fil — le même réglage que l'Atelier, suivi au débit et au calepinage.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import type { BodyInfo } from "../document/types";
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

/** The grain of a piece (along its length unless chosen). */
export const grainOf = (editor: Editor, bodyId: string): NonNullable<BodyInfo["grain"]> => bodyInfo(editor.doc, bodyId).grain ?? "length";

/** The grain of these pieces turned, in one step; the view shows the appearances. */
export function setGrain(root: HTMLElement, editor: Editor, bodyIds: string[], grain: NonNullable<BodyInfo["grain"]>): void {
  void editor.change(setBodyInfo(editor.doc, bodyIds, { grain }));
  const render = root.querySelector<HTMLButtonElement>('[data-workshop="render"]');
  if (grain !== "none" && render?.getAttribute("aria-pressed") === "false") render.click();
  editor.notify(grain === "none" ? "Sans fil : la pièce peut tourner sur le panneau." : `Fil en ${grain === "width" ? "largeur" : "longueur"} : la vue, le débit et le calepinage le suivent.`, "success");
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
