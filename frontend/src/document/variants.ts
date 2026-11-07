/**
 * Les variantes : des versions entières du projet gardées dans le projet, chacune avec son prix du moment et une petite
 * image, pour les comparer avec le client et rouvrir celle qu'il préfère. Ouvrir une variante remplace le projet en
 * cours en une annulation ; la liste des variantes reste. Pur.
 */
import { cloneDocument, type CadDocument, type Variant } from "./types";

/** How many variants a project keeps. */
export const MAX_VARIANTS = 6;
/** Above this, a project would come close to what the server accepts (7 Mo). */
const MAX_SIZE = 5_000_000;

export type KeptVariant = Pick<Variant, "name" | "total" | "parts" | "image">;

/** The project as it is, kept as a new variant. */
export function withVariant(doc: CadDocument, kept: KeptVariant): CadDocument | string {
  const name = kept.name.trim();
  const list = doc.variants ?? [];
  if (!name) return "Donnez un nom à cette variante.";
  if (list.some((v) => v.name === name)) return "Une variante porte déjà ce nom.";
  if (list.length >= MAX_VARIANTS) return `Pas plus de ${MAX_VARIANTS} variantes : supprimez-en une d'abord.`;
  const { variants: _, ...snapshot } = cloneDocument(doc);
  const id = `v${Math.max(0, ...list.map((v) => Number(v.id.slice(1)) || 0)) + 1}`;
  const next = { ...doc, variants: [...list, { ...kept, id, name, doc: snapshot }] };
  return JSON.stringify(next).length > MAX_SIZE ? "Le projet deviendrait trop lourd : supprimez une variante d'abord." : next;
}

export function withoutVariant(doc: CadDocument, id: string): CadDocument {
  return { ...doc, variants: (doc.variants ?? []).filter((v) => v.id !== id) };
}

/** The project replaced by this variant; the list stays. */
export function openedVariant(doc: CadDocument, id: string): CadDocument | string {
  const variant = doc.variants?.find((v) => v.id === id);
  return variant ? { ...cloneDocument(variant.doc as CadDocument), variants: doc.variants } : "Cette variante n'existe plus.";
}
