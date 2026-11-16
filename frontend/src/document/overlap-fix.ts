/**
 * Corriger un chevauchement (Contrôle avant fabrication) : la pièce choisie est coupée par l'autre, qui reste telle
 * qu'elle est — une étape « Combiner » (couper, en gardant l'outil) à la fin de l'historique, qu'on reprend ou
 * supprime comme les autres. Pur.
 */
import { bodyLabel, uniqueId, uniqueName } from "./operations";
import type { CadDocument, CombineFeature } from "./types";

/** The document with `cut` cut by `by` (kept whole). */
export function withOverlapCut(doc: CadDocument, cut: string, by: string): CadDocument {
  const feature: CombineFeature = { id: uniqueId(doc, "cb"), type: "combine", name: uniqueName(doc, `Découpe de ${bodyLabel(doc, cut)}`), target: cut, tools: [by], operation: "cut", keepTools: true };
  return { ...doc, features: [...doc.features, feature] };
}

/** Every pair fixed at once: the second of each cut by the first (a body cut twice goes on from its last cut). */
export function withOverlapsCut(doc: CadDocument, pairs: readonly (readonly [string, string])[]): CadDocument {
  let next = doc;
  const now = new Map<string, string>();
  for (const [first, second] of pairs) {
    const by = now.get(first) ?? first;
    const cut = now.get(second) ?? second;
    next = withOverlapCut(next, cut, by);
    now.set(second, next.features[next.features.length - 1]!.id);
  }
  return next;
}
