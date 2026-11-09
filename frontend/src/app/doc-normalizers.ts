/**
 * What a document passes through before it becomes the project's, at each change (Editor.change): a module that keeps
 * two things in step registers here — the Plan de cuisine follows a unit it made, changed in the 3D
 * (document/kitchen-sync.ts). In order; each gets the document before the change and the one after.
 */
import type { CadDocument } from "../document/types";

type Normalizer = (prev: CadDocument, next: CadDocument) => CadDocument;
const normalizers: Normalizer[] = [];

export function addNormalizer(f: Normalizer): void {
  normalizers.push(f);
}

export function normalizeDoc(prev: CadDocument, next: CadDocument): CadDocument {
  return normalizers.reduce((doc, f) => f(prev, doc), next);
}
