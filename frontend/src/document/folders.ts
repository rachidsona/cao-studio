/**
 * Dossiers du navigateur, comme ceux de Fusion : on y range des corps à la main — « Placard », « Dressing »… Un corps
 * est dans un dossier au plus, retenu par son origine (l'id de ce qui l'a créé, comme ses nom et matériau), pour y
 * rester quand l'historique le refait. Éditions pures du document.
 */
import type { CadDocument, Folder } from "./types";

export function foldersOf(doc: CadDocument): Folder[] {
  return doc.folders ?? [];
}

/** A new folder (its name made unique), with these bodies taken out of their folders. */
export function addFolder(doc: CadDocument, name = "Dossier", bodies: string[] = []): { doc: CadDocument; id: string } {
  const folders = foldersOf(doc);
  let n = 1;
  while (folders.some((f) => f.id === `fd${n}`)) n++;
  let label = name.trim() || "Dossier";
  let k = 1;
  if (label === "Dossier" || folders.some((f) => f.name === label)) {
    while (folders.some((f) => f.name === `${label} ${k}`)) k++;
    label = `${label} ${k}`;
  }
  const id = `fd${n}`;
  const out = moveToFolder({ ...doc, folders: [...folders, { id, name: label, bodies: [] }] }, bodies, id);
  return { doc: out, id };
}

export function renameFolder(doc: CadDocument, id: string, name: string): CadDocument {
  const label = name.trim();
  if (!label) return doc;
  return { ...doc, folders: foldersOf(doc).map((f) => (f.id === id ? { ...f, name: label } : f)) };
}

/** Puts these bodies in a folder (null: out of every folder); a body leaves the folder it was in. */
export function moveToFolder(doc: CadDocument, bodies: string[], id: string | null): CadDocument {
  const moved = new Set(bodies);
  const folders = foldersOf(doc).map((f) => {
    const kept = f.bodies.filter((b) => !moved.has(b));
    return { ...f, bodies: f.id === id ? [...kept, ...bodies.filter((b, i) => bodies.indexOf(b) === i)] : kept };
  });
  return { ...doc, folders };
}

/** Removes a folder; its bodies stay, out of any folder. */
export function removeFolder(doc: CadDocument, id: string): CadDocument {
  const folders = foldersOf(doc).filter((f) => f.id !== id);
  if (folders.length > 0) return { ...doc, folders };
  const { folders: _gone, ...rest } = doc;
  return rest;
}

/** The folder of each body, by origin. */
export function folderIndex(doc: CadDocument): Map<string, string> {
  return new Map(foldersOf(doc).flatMap((f) => f.bodies.map((b): [string, string] => [b, f.id])));
}
