/**
 * « Mes motifs » : une image prise ailleurs (une photo de bois, de pierre, un tissu… depuis son ordinateur) devient
 * une apparence. Réduite à 1024 px en JPEG, elle est gardée avec le projet (`doc.appearances`), et sa taille de motif
 * dit combien de millimètres couvre l'image. Annulable comme toute modification.
 */
import type { CadDocument, CustomAppearance } from "../document/types";
import { setCustomAppearances, type Appearance } from "./library";

/** The appearance drawn from an imported image. */
export function customAppearance(c: CustomAppearance): Appearance {
  return { id: c.id, name: c.name, category: "custom", color: "#b8a68e", pattern: "wood", roughness: 0.5, image: c.image, tile: c.tile, relief: 0.15 };
}

let synced: CustomAppearance[] | undefined;

/** Makes the images of this document known to the library (cheap when they did not change). */
export function syncCustom(doc: CadDocument): void {
  if (doc.appearances === synced) return;
  synced = doc.appearances;
  setCustomAppearances((doc.appearances ?? []).map(customAppearance));
}

/** Adds an imported image as an appearance (its name made unique). */
export function addCustomAppearance(doc: CadDocument, name: string, image: string, tile: [number, number]): { doc: CadDocument; id: string } {
  const list = doc.appearances ?? [];
  let n = 1;
  while (list.some((a) => a.id === `img${n}`)) n++;
  const base = name.trim() || "Motif";
  let label = base;
  for (let k = 2; list.some((a) => a.name === label); k++) label = `${base} ${k}`;
  const next = { ...doc, appearances: [...list, { id: `img${n}`, name: label, image, tile }] };
  syncCustom(next);
  return { doc: next, id: `img${n}` };
}

/** Removes an imported image (the bodies that had it go back to their material's appearance). */
export function removeCustomAppearance(doc: CadDocument, id: string): CadDocument {
  const list = (doc.appearances ?? []).filter((a) => a.id !== id);
  const { appearances: _gone, ...rest } = doc;
  const next = list.length ? { ...rest, appearances: list } : rest;
  syncCustom(next);
  return next;
}

/** An image file reduced to `max` pixels on its longer side, as a JPEG data URL (refused: not an image). */
export function imageFileToDataUrl(file: File, max = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Ce fichier n'est pas une image."));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cette image ne peut pas être lue."));
    };
    image.src = url;
  });
}
