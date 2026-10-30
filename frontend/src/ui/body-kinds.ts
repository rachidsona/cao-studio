/**
 * The bodies of the navigator grouped by what they are: the pieces of a Répartition and of its divisions — Dessous,
 * Dessus, Côté, Étagère, Cloison, numbered — go in a folder each (« Étagères », « Côtés »…), where the first of
 * them stood, as soon as there are two of a kind. The other bodies, and the folders already made (a cabinet), stay.
 */
import type { BodyEntry, BodyRow } from "./browser";

/** The kinds of pieces, with the name of their folder. */
const KINDS: [RegExp, string, string][] = [
  [/^Dessous( \d+)?$/, "dessous", "Dessous"],
  [/^Dessus( \d+)?$/, "dessus", "Dessus"],
  [/^Côté( \d+)?$/, "cote", "Côtés"],
  [/^Étagère( \d+)?$/, "etagere", "Étagères"],
  [/^Cloison( \d+)?$/, "cloison", "Cloisons"],
];

/** The kind of a body by its name (null: not a piece of a Répartition). */
export function bodyKind(name: string): { id: string; folder: string } | null {
  const kind = KINDS.find(([pattern]) => pattern.test(name.trim()));
  return kind ? { id: kind[1], folder: kind[2] } : null;
}

export function groupByKind(entries: BodyEntry[]): BodyEntry[] {
  const members = new Map<string, BodyRow[]>();
  for (const entry of entries) {
    if (!("body" in entry)) continue;
    const kind = bodyKind(entry.body.label || entry.body.item.name);
    if (kind) members.set(kind.id, [...(members.get(kind.id) ?? []), entry.body]);
  }
  const out: BodyEntry[] = [];
  const placed = new Set<string>();
  for (const entry of entries) {
    const kind = "body" in entry ? bodyKind(entry.body.label || entry.body.item.name) : null;
    const rows = kind ? (members.get(kind.id) ?? []) : [];
    if (!kind || rows.length < 2) {
      out.push(entry);
      continue;
    }
    if (placed.has(kind.id)) continue;
    placed.add(kind.id);
    out.push({ group: { id: `kind:${kind.id}`, name: kind.folder, bodies: rows } });
  }
  return out;
}
