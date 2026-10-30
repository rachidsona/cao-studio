/**
 * The font of sketch texts (Roboto, OFL licence, from @fontsource), loaded once and shared: the geometry worker
 * builds the letters with it, the sketcher draws their outline with the same glyphs.
 */
import fontUrl from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";

export const FONT_FAMILY = "Roboto";

let bytes: Promise<ArrayBuffer> | null = null;

/** The font file (fetched once). */
export function fontBytes(): Promise<ArrayBuffer> {
  bytes ??= fetch(fontUrl).then((r) => {
    if (!r.ok) throw new Error(`Police des textes introuvable (erreur ${r.status}).`);
    return r.arrayBuffer();
  });
  return bytes;
}
