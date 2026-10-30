/**
 * Textes d'esquisse dans le noyau : chaque texte devient le dessin de ses lettres (contours exacts de la police),
 * posé à sa place et tourné de son angle, réuni au profil de l'esquisse. Pour graver, on écrit le texte dans une
 * esquisse sur la face et on l'extrude en « Couper ».
 */
import { drawText, loadFont, type Drawing } from "replicad";
import type { SketchText } from "../document/types";
import { FONT_FAMILY } from "../geometry/font";
import { GeometryError } from "../geometry/kernel";

let fontReady = false;

/** Loads the font into the kernel (once). */
export async function loadTextFont(bytes: ArrayBuffer): Promise<void> {
  if (fontReady) return;
  await loadFont(bytes, FONT_FAMILY);
  fontReady = true;
}

export const textFontReady = () => fontReady;

/** The letters of the texts as one drawing, or null when there is no text to write. */
export function textDrawing(texts: SketchText[] | undefined): Drawing | null {
  const written = (texts ?? []).filter((t) => t.text.trim() && t.height > 0);
  if (!written.length) return null;
  if (!fontReady) throw new GeometryError("La police des textes n'est pas encore chargée.");
  let out: Drawing | null = null;
  for (const t of written) {
    let letters = drawText(t.text, { fontSize: t.height, fontFamily: FONT_FAMILY });
    if (t.angle) letters = letters.rotate(t.angle, [0, 0]);
    letters = letters.translate(t.x, t.y);
    out = out ? out.fuse(letters) : letters;
  }
  return out;
}
