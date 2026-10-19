/** Native project files (.cao.json): the full parametric document, not a mesh. */
import type { CadDocument } from "../document/types";
import { parseDocument } from "../document/validate";

export const NATIVE_EXTENSION = ".cao.json";
export const MAX_NATIVE_FILE_BYTES = 5 * 1024 * 1024;

export function serializeNative(doc: CadDocument): Blob {
  return new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
}

/** Parses and validates an imported native file; throws a French message on failure. */
export function parseNative(text: string): CadDocument {
  if (text.length > MAX_NATIVE_FILE_BYTES) throw new Error("Fichier trop volumineux (5 Mo maximum).");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  return parseDocument(data);
}
