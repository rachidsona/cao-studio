/**
 * La liste de débit rangée en plusieurs listes, au choix : par matière et épaisseur (comme elle est faite), par type
 * d'élément (côtés, dessus, étagères, portes…), par type de bois, par épaisseur, ou par type d'élément et épaisseur à
 * la fois. Le type d'une pièce se lit dans son nom : « Bas 2 portes (A1) — Côté gauche » est un « Côté »,
 * « Étagère 3 » une « Étagère ». Une ligne qui réunit des pièces identiques de types différents (une cloison et une
 * étagère de mêmes cotes) est partagée entre leurs listes, sous le même repère. Pur.
 */
import type { CutRow } from "./cut-list";

export type CutGrouping = "material" | "kind" | "wood" | "thickness" | "kind-thickness";

export const CUT_GROUPINGS: [CutGrouping, string][] = [
  ["material", "Matière et épaisseur"],
  ["kind", "Type d'élément"],
  ["wood", "Type de bois"],
  ["thickness", "Épaisseur"],
  ["kind-thickness", "Type d'élément et épaisseur"],
];

/** A copy made by a mirror or an array: the name before says what the piece is. */
const COPY = /^(symétrie|.*\(\d+\))$/i;
/** Where a piece is, which does not change what it is. */
const SIDE = /\s+(gauche|droite?|avant|arrière|hauts?|haute|bas|basse|du haut|du bas|d'angle|intérieure?|extérieure?)$/i;
/** Its number, or the letter of its run (« Plinthe A », « Étagère 12 », « panneau 3 »). */
const NUMBER = /\s+(\d+|[A-Z]\d*)$/;

/** What a piece is, from its name: « Côté », « Étagère », « Porte », « Plan de travail »… */
export function partKind(name: string): string {
  const pieces = name.split(" — ").map((p) => p.trim()).filter(Boolean);
  let piece = pieces.at(-1) ?? "";
  for (let i = pieces.length - 1; i > 0 && COPY.test(piece); i--) piece = pieces[i - 1]!;
  for (let guard = 0; guard < 6; guard++) {
    const shorter = piece.replace(NUMBER, "").replace(SIDE, "");
    if (shorter === piece || !shorter) break;
    piece = shorter;
  }
  return piece ? piece.charAt(0).toLocaleUpperCase("fr-FR") + piece.slice(1) : "Pièce";
}

export interface CutGroup {
  /** Its heading: the material, the kind of piece, the thickness. */
  title: string;
  /** The thickness all its rows share, when the grouping says so (mm). */
  thickness?: number;
  rows: CutRow[];
}

/** The parts of a row of this kind: the row itself when they all are. */
function ofKind(row: CutRow, kind: string): CutRow {
  const keep = row.names.map((n, i) => (partKind(n) === kind ? i : -1)).filter((i) => i >= 0);
  if (keep.length === row.names.length) return row;
  return { ...row, names: keep.map((i) => row.names[i]!), quantity: keep.length, ...(row.ids ? { ids: keep.map((i) => row.ids![i]!) } : {}), ...(row.runs ? { runs: keep.map((i) => row.runs![i] ?? null) } : {}) };
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** The rows in their lists, each list in the order of the cut list. */
export function cutGroups(rows: readonly CutRow[], by: CutGrouping): CutGroup[] {
  const groups = new Map<string, CutGroup>();
  const put = (key: string, title: string, row: CutRow, thickness?: number) => {
    const group = groups.get(key) ?? { title, ...(thickness !== undefined ? { thickness } : {}), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  };
  for (const row of rows) {
    if (by === "material") put(`${row.material}|${row.thickness}`, row.material, row, row.thickness);
    else if (by === "wood") put(row.material, row.material, row);
    else if (by === "thickness") put(String(row.thickness), "Épaisseur", row, row.thickness);
    else for (const kind of [...new Set(row.names.map(partKind))]) put(by === "kind" ? kind : `${kind}|${row.thickness}`, kind, ofKind(row, kind), by === "kind" ? undefined : row.thickness);
  }
  const list = [...groups.values()];
  // Kinds and woods by name, thicknesses from the thickest; the list made by material keeps its order.
  if (by !== "material") list.sort((a, b) => (by === "thickness" ? 0 : collator.compare(a.title, b.title)) || (b.thickness ?? 0) - (a.thickness ?? 0));
  return list;
}

/** The kinds of the parts of a row, for the spreadsheet: « Côté, Cloison ». */
export const rowKinds = (row: CutRow): string => [...new Set(row.names.map(partKind))].join(", ");
