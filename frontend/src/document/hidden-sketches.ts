/**
 * « Esquisses » cachées d'un clic sur l'œil de leur titre (ui/browser.ts) : tant qu'elles le sont toutes, une esquisse
 * nouvelle arrive cachée elle aussi. Une seule remontrée, et les nouvelles se montrent de nouveau. Pur.
 */
import type { CadDocument } from "./types";

/** `next` with its new sketches hidden when every sketch of `before` was (one at least); else `next` itself. */
export function withNewSketchesHidden(before: CadDocument, next: CadDocument): CadDocument {
  const old = before.features.filter((f) => f.type === "sketch");
  if (!old.length || old.some((f) => !f.hidden)) return next;
  const known = new Set(old.map((f) => f.id));
  if (!next.features.some((f) => f.type === "sketch" && !f.hidden && !known.has(f.id))) return next;
  return { ...next, features: next.features.map((f) => (f.type === "sketch" && !f.hidden && !known.has(f.id) ? { ...f, hidden: true } : f)) };
}
