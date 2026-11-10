/**
 * Cut list (liste de débit): every board of the model with its finished size
 * (length ≥ width, thickness the smallest), its material, grain and edge
 * bands, the size to cut (finished size less the bands), grouped when
 * identical with a quantity. Totals per material: area and length of edge
 * band. Bodies that are not boxes are listed by their bounding box (marked).
 * Each row gets a mark (A, B, C… as OpenCutList's part numbers), written on the sheet layout and in the view.
 */
import { rowKinds } from "./cut-groups";
import { bodyLabel } from "./operations";
import { bodyInfo, materialById } from "./materials";
import { bandTrimOf } from "./standards";
import type { BodyInfo, CadDocument } from "./types";
import { toDisplay, UNIT_LABELS } from "../measurements/units";
import type { DisplayUnit } from "./types";

export interface PartInput {
  id: string;
  bbox: [[number, number, number], [number, number, number]];
  volume: number;
}

export interface CutRow {
  /** Mark of the part (A, B… AA): its place in the list. */
  tag?: string;
  names: string[];
  /** The bodies of the row (to show them in the model). */
  ids?: string[];
  /** By part of the row: the run of fronts it belongs to, if any, for the sheet layout. */
  runs?: (NonNullable<BodyInfo["grainRun"]> | null)[];
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  material: string;
  grain: NonNullable<BodyInfo["grain"]>;
  edges: NonNullable<BodyInfo["edges"]>;
  band: number;
  cutLength: number;
  cutWidth: number;
  /** Size sawn before planing: the cutting size plus the material's oversize (solid wood), else the cutting size. */
  roughLength?: number;
  roughWidth?: number;
  /** Not a plain box: listed by its bounding box. */
  approximate: boolean;
}

export interface CutTotals {
  material: string;
  thickness: number;
  /** m² of finished boards. */
  area: number;
  /** m of edge band. */
  bandLength: number;
  /** m of parts end to end (for wood sold in bars). */
  metres?: number;
  parts: number;
}

const NO_EDGES = { length1: false, length2: false, width1: false, width2: false };
const round = (v: number) => Number(v.toFixed(1));

export function cutList(doc: CadDocument, parts: PartInput[]): { rows: CutRow[]; totals: CutTotals[] } {
  const rows = new Map<string, CutRow>();
  const trim = bandTrimOf(doc);
  for (const part of parts) {
    const size = [0, 1, 2].map((i) => part.bbox[1][i]! - part.bbox[0][i]!).sort((a, b) => b - a) as [number, number, number];
    const [length, width, thickness] = size.map(round) as [number, number, number];
    const info = bodyInfo(doc, part.id);
    const edges = info.edges ?? NO_EDGES;
    const band = info.band ?? (Object.values(edges).some(Boolean) ? 1 : 0);
    const known = materialById(info.material);
    const material = known?.name ?? "Non défini";
    const [plusL, plusW] = known?.oversize ?? [0, 0];
    const grain = info.grain ?? "length";
    const approximate = Math.abs(part.volume - size[0] * size[1] * size[2]) > 1e-3 * size[0] * size[1] * size[2];
    // A band thinner than the standard's threshold is not taken off (it is lost in the trimming).
    const off = band >= trim ? band : 0;
    const cutLength = round(length - off * (Number(edges.width1) + Number(edges.width2)));
    const cutWidth = round(width - off * (Number(edges.length1) + Number(edges.length2)));
    const key = JSON.stringify([material, length, width, thickness, grain, edges, band, approximate]);
    const row = rows.get(key);
    if (row) {
      row.quantity++;
      row.names.push(bodyLabel(doc, part.id));
      row.ids?.push(part.id);
      row.runs?.push(info.grainRun ?? null);
    } else rows.set(key, { names: [bodyLabel(doc, part.id)], ids: [part.id], runs: [info.grainRun ?? null], quantity: 1, length, width, thickness, material, grain, edges, band, cutLength, cutWidth, roughLength: round(cutLength + plusL), roughWidth: round(cutWidth + plusW), approximate });
  }
  const list = [...rows.values()].sort((a, b) => a.material.localeCompare(b.material) || b.thickness - a.thickness || b.length - a.length || b.width - a.width);
  list.forEach((r, i) => (r.tag = partTag(i)));
  const totals = new Map<string, CutTotals>();
  for (const r of list) {
    const key = `${r.material}|${r.thickness}`;
    const t = totals.get(key) ?? { material: r.material, thickness: r.thickness, area: 0, bandLength: 0, metres: 0, parts: 0 };
    t.area += (r.length * r.width * r.quantity) / 1e6;
    t.metres = (t.metres ?? 0) + (r.length * r.quantity) / 1000;
    t.bandLength += ((r.length * (Number(r.edges.length1) + Number(r.edges.length2)) + r.width * (Number(r.edges.width1) + Number(r.edges.width2))) * r.quantity) / 1000;
    t.parts += r.quantity;
    totals.set(key, t);
  }
  return { rows: list, totals: [...totals.values()] };
}

const STRIP = new RegExp("[\\u0300-\\u036f]", "g");
const plain = (text: string) => text.normalize("NFD").replace(STRIP, "").toLowerCase();

/** Does this row hold all the words typed: in its names, its mark, its material or its thickness? */
export function rowMatches(row: CutRow, query: string): boolean {
  const text = plain(`${row.tag ?? ""} ${row.names.join(" ")} ${row.material} ${row.thickness}`);
  return plain(query).split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

/** The mark of the n-th part: A … Z, then AA, AB … */
export function partTag(n: number): string {
  let tag = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) tag = String.fromCharCode(65 + ((i - 1) % 26)) + tag;
  return tag;
}

const GRAIN = { length: "en longueur", width: "en largeur", none: "sans fil" } as const;

/** Which edges carry a band, e.g. "L1 L2 l1". */
export function edgeText(edges: CutRow["edges"]): string {
  return [edges.length1 && "L1", edges.length2 && "L2", edges.width1 && "l1", edges.width2 && "l2"].filter(Boolean).join(" ") || "—";
}

/** The cut list as CSV (semicolon separated, for a spreadsheet in French), lengths in `unit`. */
export function cutListCsv(rows: CutRow[], unit: DisplayUnit = "mm"): string {
  const u = UNIT_LABELS[unit];
  const head = ["Repère", "Pièce", "Qté", `Longueur (${u})`, `Largeur (${u})`, `Épaisseur (${u})`, "Matière", "Fil", "Chants", "Chant (mm)", `Longueur de coupe (${u})`, `Largeur de coupe (${u})`, `Débit brut L (${u})`, `Débit brut l (${u})`, "Type"];
  const cell = (v: string | number) => (typeof v === "number" ? String(v).replace(".", ",") : `"${v.replace(/"/g, '""')}"`);
  const len = (mm: number) => Number(toDisplay(mm, unit).toFixed(4));
  const lines = rows.map((r) => [r.tag ?? "", r.names.join(", ") + (r.approximate ? " (≈)" : ""), r.quantity, len(r.length), len(r.width), len(r.thickness), r.material, GRAIN[r.grain], edgeText(r.edges), r.band, len(r.cutLength), len(r.cutWidth), len(r.roughLength ?? r.cutLength), len(r.roughWidth ?? r.cutWidth), rowKinds(r)].map(cell).join(";"));
  return [head.map(cell).join(";"), ...lines].join("\r\n");
}

export function grainText(grain: CutRow["grain"]): string {
  return GRAIN[grain];
}
