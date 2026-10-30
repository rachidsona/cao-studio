/**
 * The bodies of the navigator grouped by corps, then by what they are. Each corps — a Répartition, with its divisions
 * and what equips its niches — has its folder, where its first body stood; inside it, the pieces — Dessous, Dessus,
 * Côté, Étagère, Cloison, numbered — go in a folder each (« Étagères », « Côtés »…) as soon as there are two of a kind,
 * so that the Étagères of two cabinets are never mixed. The other bodies, and the folders already made, stay.
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

/** The pieces in a folder per kind; `scope` keeps the folders of two corps apart (and their fold remembered apart). */
export function groupByKind(entries: BodyEntry[], scope = ""): BodyEntry[] {
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
    out.push({ group: { id: `kind:${scope}${kind.id}`, name: kind.folder, entries: rows.map((body) => ({ body })) } });
  }
  return out;
}

/**
 * A folder per corps (`corpsOf`: the corps of an entry, null for a body of its own), its pieces grouped by kind inside;
 * then the pieces left outside any corps grouped by kind as before.
 */
export function groupByCorps(entries: BodyEntry[], corpsOf: (entry: BodyEntry) => { id: string; name: string } | null, scope = ""): BodyEntry[] {
  const members = new Map<string, BodyEntry[]>();
  const corps = entries.map(corpsOf);
  entries.forEach((entry, i) => {
    const c = corps[i];
    if (c) members.set(c.id, [...(members.get(c.id) ?? []), entry]);
  });
  const out: BodyEntry[] = [];
  const placed = new Set<string>();
  entries.forEach((entry, i) => {
    const c = corps[i];
    if (!c) out.push(entry);
    else if (!placed.has(c.id)) {
      placed.add(c.id);
      out.push({ group: { id: `corps:${scope}${c.id}`, name: c.name, entries: groupByKind(members.get(c.id) ?? [], `${scope}${c.id}:`) } });
    }
  });
  return groupByKind(out, scope);
}
