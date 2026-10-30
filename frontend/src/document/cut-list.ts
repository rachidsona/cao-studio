/**
 * Cut list (liste de débit): every board of the model with its finished size
 * (length ≥ width, thickness the smallest), its material, grain and edge
 * bands, the size to cut (finished size less the bands), grouped when
 * identical with a quantity. Totals per material: area and length of edge
 * band. Bodies that are not boxes are listed by their bounding box (marked).
 */
import { bodyLabel } from "./operations";
import { bodyInfo, materialById } from "./materials";
import type { BodyInfo, CadDocument } from "./types";
import { toDisplay, UNIT_LABELS } from "../measurements/units";
import type { DisplayUnit } from "./types";

export interface PartInput {
  id: string;
  bbox: [[number, number, number], [number, number, number]];
  volume: number;
}

export interface CutRow {
  names: string[];
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
  parts: number;
}

const NO_EDGES = { length1: false, length2: false, width1: false, width2: false };
const round = (v: number) => Number(v.toFixed(1));

export function cutList(doc: CadDocument, parts: PartInput[]): { rows: CutRow[]; totals: CutTotals[] } {
  const rows = new Map<string, CutRow>();
  for (const part of parts) {
    const size = [0, 1, 2].map((i) => part.bbox[1][i]! - part.bbox[0][i]!).sort((a, b) => b - a) as [number, number, number];
    const [length, width, thickness] = size.map(round) as [number, number, number];
    const info = bodyInfo(doc, part.id);
    const edges = info.edges ?? NO_EDGES;
    const band = info.band ?? (Object.values(edges).some(Boolean) ? 1 : 0);
    const material = materialById(info.material)?.name ?? "Non défini";
    const grain = info.grain ?? "length";
    const approximate = Math.abs(part.volume - size[0] * size[1] * size[2]) > 1e-3 * size[0] * size[1] * size[2];
    const cutLength = round(length - band * (Number(edges.width1) + Number(edges.width2)));
    const cutWidth = round(width - band * (Number(edges.length1) + Number(edges.length2)));
    const key = JSON.stringify([material, length, width, thickness, grain, edges, band, approximate]);
    const row = rows.get(key);
    if (row) {
      row.quantity++;
      row.names.push(bodyLabel(doc, part.id));
    } else rows.set(key, { names: [bodyLabel(doc, part.id)], quantity: 1, length, width, thickness, material, grain, edges, band, cutLength, cutWidth, approximate });
  }
  const list = [...rows.values()].sort((a, b) => a.material.localeCompare(b.material) || b.thickness - a.thickness || b.length - a.length);
  const totals = new Map<string, CutTotals>();
  for (const r of list) {
    const key = `${r.material}|${r.thickness}`;
    const t = totals.get(key) ?? { material: r.material, thickness: r.thickness, area: 0, bandLength: 0, parts: 0 };
    t.area += (r.length * r.width * r.quantity) / 1e6;
    t.bandLength += ((r.length * (Number(r.edges.length1) + Number(r.edges.length2)) + r.width * (Number(r.edges.width1) + Number(r.edges.width2))) * r.quantity) / 1000;
    t.parts += r.quantity;
    totals.set(key, t);
  }
  return { rows: list, totals: [...totals.values()] };
}

const GRAIN = { length: "en longueur", width: "en largeur", none: "sans fil" } as const;

/** Which edges carry a band, e.g. "L1 L2 l1". */
export function edgeText(edges: CutRow["edges"]): string {
  return [edges.length1 && "L1", edges.length2 && "L2", edges.width1 && "l1", edges.width2 && "l2"].filter(Boolean).join(" ") || "—";
}

/** The cut list as CSV (semicolon separated, for a spreadsheet in French), lengths in `unit`. */
export function cutListCsv(rows: CutRow[], unit: DisplayUnit = "mm"): string {
  const u = UNIT_LABELS[unit];
  const head = ["Pièce", "Qté", `Longueur (${u})`, `Largeur (${u})`, `Épaisseur (${u})`, "Matière", "Fil", "Chants", "Chant (mm)", `Longueur de coupe (${u})`, `Largeur de coupe (${u})`];
  const cell = (v: string | number) => (typeof v === "number" ? String(v).replace(".", ",") : `"${v.replace(/"/g, '""')}"`);
  const len = (mm: number) => Number(toDisplay(mm, unit).toFixed(4));
  const lines = rows.map((r) => [r.names.join(", ") + (r.approximate ? " (≈)" : ""), r.quantity, len(r.length), len(r.width), len(r.thickness), r.material, GRAIN[r.grain], edgeText(r.edges), r.band, len(r.cutLength), len(r.cutWidth)].map(cell).join(";"));
  return [head.map(cell).join(";"), ...lines].join("\r\n");
}

export function grainText(grain: CutRow["grain"]): string {
  return GRAIN[grain];
}
