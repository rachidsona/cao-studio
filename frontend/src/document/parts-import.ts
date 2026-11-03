/**
 * Importer une liste de pièces (l'« Importateur » d'OpenCutList) : un fichier CSV d'un tableur — une ligne par pièce,
 * son nom, sa quantité, sa longueur, sa largeur, son épaisseur et sa matière — devient autant de planches, posées à
 * plat côte à côte à droite du modèle, avec leur nom et leur matière : la liste de débit, le calepinage et le devis
 * les prennent aussitôt. Séparateur « ; », « , » ou tabulation, virgule décimale acceptée. La ligne d'en-tête dit
 * quelle colonne est quoi (et l'unité : « Longueur (cm) ») ; sans en-tête, l'ordre est nom, quantité, longueur,
 * largeur, épaisseur, matière. La liste de débit exportée par poly_3D se réimporte telle quelle. Pur.
 */
import { MATERIALS } from "./materials";
import { uniqueId, uniqueName } from "./operations";
import { rectangleAt } from "./sketch";
import type { BodyInfo, CadDocument, Feature } from "./types";

export interface ImportedPart {
  name: string;
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  /** Id of a known material. */
  material?: string;
}

type Column = "name" | "quantity" | "length" | "width" | "thickness" | "material";
const ORDER: Column[] = ["name", "quantity", "length", "width", "thickness", "material"];
/** How a header starts, without accents, in lower case. */
const HEADERS: [Column, RegExp][] = [
  ["name", /^(piece|nom|name|designation|part)/],
  ["quantity", /^(qte|quantite|qty|quantity|nombre|nb)/],
  ["length", /^(longueur|length|long\b|l\b)/],
  ["width", /^(largeur|width|larg\b)/],
  ["thickness", /^(epaisseur|ep\b|ep\.|thickness|thick)/],
  ["material", /^(matiere|materiau|material)/],
];
const UNITS: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, po: 25.4 };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** One line of CSV in cells (quotes, doubled quotes inside). */
function cells(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) out.push(cell.trim()), (cell = "");
    else cell += c;
  }
  out.push(cell.trim());
  return out;
}

const number = (s: string | undefined) => (s === undefined || s === "" ? NaN : Number(s.replace(/\s/g, "").replace(",", ".")));

/** The material a cell names (its name or id, accents and case aside). */
function materialOf(cell: string | undefined): string | undefined {
  const name = plain(cell ?? "");
  if (!name) return undefined;
  return MATERIALS.find((m) => plain(m.name) === name || m.id === name)?.id;
}

/** The parts of a CSV text, and what was wrong with the lines left out. */
export function parsePartsCsv(text: string): { parts: ImportedPart[]; problems: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const parts: ImportedPart[] = [];
  const problems: string[] = [];
  if (!lines.length) return { parts, problems: ["Le fichier est vide."] };
  const first = lines[0]!;
  const separator = ["\t", ";", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const head = cells(first, separator);
  // A header: the columns it names (the first of each), and the unit of the lengths.
  const columns = new Map<Column, number>();
  let scale = 1;
  head.forEach((h, i) => {
    const p = plain(h);
    const column = HEADERS.find(([, re]) => re.test(p))?.[0];
    if (column && !columns.has(column)) columns.set(column, i);
    const unit = /\(([a-z]+)\)/.exec(p)?.[1];
    if (column === "length" && unit && UNITS[unit]) scale = UNITS[unit]!;
  });
  const headed = columns.has("length") && columns.has("width");
  if (!headed) ORDER.forEach((c, i) => columns.set(c, i));
  lines.slice(headed ? 1 : 0).forEach((line, k) => {
    const row = cells(line, separator);
    const at = (c: Column) => (columns.has(c) ? row[columns.get(c)!] : undefined);
    const n = k + (headed ? 2 : 1);
    const [length, width, thickness] = (["length", "width", "thickness"] as const).map((c) => number(at(c)) * scale);
    const quantity = columns.has("quantity") ? number(at("quantity")) : 1;
    if (!(length! > 0 && width! > 0)) return void problems.push(`Ligne ${n} : longueur et largeur attendues.`);
    if (!(quantity > 0 && Number.isInteger(quantity))) return void problems.push(`Ligne ${n} : la quantité doit être un nombre entier.`);
    if (quantity > 500) return void problems.push(`Ligne ${n} : plus de 500 pièces.`);
    const material = materialOf(at("material"));
    parts.push({ name: (at("name") || `Pièce ${parts.length + 1}`).replace(/\s*\(≈\)$/, ""), quantity, length: length!, width: width!, thickness: thickness! > 0 ? thickness! : 19, ...(material ? { material } : {}) });
  });
  return { parts, problems };
}

/** Space between two boards laid out, and the length of a row before the next one (mm). */
const GAP = 50;
const ROW = 3000;

/**
 * The parts as boards laid flat side by side from `from` (x, y): each a rectangle sketched on the floor, extruded by
 * its thickness, with its name and material (a part made 3 times: « Nom (1) », « Nom (2) »…). One step.
 */
export function importParts(base: CadDocument, parts: readonly ImportedPart[], from: [number, number] = [0, 0]): { doc: CadDocument; boards: number } {
  const features = [...base.features];
  const info: Record<string, BodyInfo> = { ...base.bodyInfo };
  const names: Record<string, string> = { ...base.bodyNames };
  const probe = () => ({ ...base, features });
  let [x, y] = from;
  let rowDepth = 0;
  let boards = 0;
  for (const p of parts) {
    for (let i = 0; i < p.quantity; i++) {
      if (x > from[0] && x - from[0] + p.length > ROW) [x, y, rowDepth] = [from[0], y + rowDepth + GAP, 0];
      const sketch: Feature = { id: uniqueId(probe(), "sk"), type: "sketch", name: uniqueName(probe(), "Esquisse"), plane: "XY", offset: 0, hidden: true, ...rectangleAt(x + p.length / 2, y + p.width / 2, p.length, p.width) };
      features.push(sketch);
      const id = uniqueId(probe(), "ex");
      const name = p.quantity > 1 ? `${p.name} (${i + 1})` : p.name;
      features.push({ id, type: "extrude", name, sketch: sketch.id, distance: p.thickness, operation: "new" });
      names[id] = name;
      info[id] = { ...(p.material ? { material: p.material } : {}), grain: "length" };
      x += p.length + GAP;
      rowDepth = Math.max(rowDepth, p.width);
      boards++;
    }
  }
  return { doc: { ...base, features, bodyInfo: info, bodyNames: names }, boards };
}
