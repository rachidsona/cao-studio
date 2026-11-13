/**
 * Liste d'achat (comme celle de SketchList ou d'OpenCutList) : ce qu'il faut commander pour fabriquer, déduit du
 * calepinage — les panneaux neufs par matière et épaisseur (les chutes du stock à part), le chant au mètre par
 * épaisseur, avec sa surlongueur de collage, et la quincaillerie arrondie au conditionnement (boîtes de vis, de
 * tourillons). Pur.
 */
import { csvText } from "./csv-text";
import type { CutRow } from "./cut-list";
import type { Bar } from "./bars";
import type { Sheet } from "./nesting";

/** How the hardware is sold: pieces per box. */
export const PACKS: Record<string, number> = {
  "Vis confirmat 7 × 50": 100,
  "Tourillon Ø8 × 30": 100,
  "Excentrique Minifix 15 + tige": 50,
  "Pied réglable": 4,
};

/** Extra length of edge band per banded edge, for the trimming at both ends (mm). */
export const BAND_EXTRA = 50;

/** What kind of article a line is: who sells it, how it is priced (document/purchase-orders.ts). */
export type PurchaseFamily = "board" | "bar" | "band" | "hardware" | "offcut";

export interface PurchaseLine {
  label: string;
  quantity: number;
  unit: string;
  detail?: string;
  family: PurchaseFamily;
  /**
   * What one unit is, to price it: a board of `material` of `area` m², a bar of `material` of `metres`, a metre of band,
   * or `pieces` of the hardware `name` (its catalogue `price`, MAD HT each, when it has one).
   */
  basis?: { material?: string; area?: number; metres?: number; name?: string; pieces?: number; price?: number };
}

const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function purchaseList(sheets: readonly Sheet[], rows: readonly CutRow[], hardware: readonly { name: string; quantity: number; unit?: string; price?: number }[] = [], bars: readonly Bar[] = []): PurchaseLine[] {
  const lines: PurchaseLine[] = [];
  const boards = new Map<string, { material: string; thickness: number; size: [number, number]; count: number; used: number }>();
  let offcuts = 0;
  for (const s of sheets) {
    if (s.offcut !== undefined) {
      offcuts++;
      continue;
    }
    const key = `${s.material}|${s.thickness}|${s.size.join("x")}`;
    const b = boards.get(key) ?? { material: s.material, thickness: s.thickness, size: s.size, count: 0, used: 0 };
    b.count++;
    b.used += s.usage;
    boards.set(key, b);
  }
  for (const b of boards.values()) {
    lines.push({ label: `${b.material} ${fmt(b.thickness)} mm`, quantity: b.count, unit: b.count > 1 ? "panneaux" : "panneau", detail: `${b.size[0]} × ${b.size[1]} mm, utilisés à ${Math.round((b.used / b.count) * 100)} %` , family: "board", basis: { material: b.material, area: (b.size[0] * b.size[1]) / 1e6 } });
  }
  // Battens: the bars of each section.
  const sections = new Map<string, { bar: Bar; count: number; used: number }>();
  for (const b of bars) {
    const key = `${b.material}|${b.section.join("x")}|${b.length}`;
    const s = sections.get(key) ?? { bar: b, count: 0, used: 0 };
    s.count++;
    s.used += b.usage;
    sections.set(key, s);
  }
  for (const { bar, count, used } of sections.values()) {
    lines.push({ label: `${bar.material} ${fmt(bar.section[0])} × ${fmt(bar.section[1])} mm`, quantity: count, unit: count > 1 ? "barres" : "barre", detail: `de ${bar.length} mm, utilisées à ${Math.round((used / count) * 100)} %` , family: "bar", basis: { material: bar.material, metres: bar.length / 1000 } });
  }
  if (offcuts) lines.push({ label: "Chutes du stock utilisées", quantity: offcuts, unit: offcuts > 1 ? "chutes" : "chute", detail: "à sortir du stock", family: "offcut" });
  const bands = new Map<number, number>();
  for (const r of rows) {
    if (!r.band) continue;
    const e = r.edges;
    const edges = Number(e.length1) + Number(e.length2) + Number(e.width1) + Number(e.width2);
    const length = r.length * (Number(e.length1) + Number(e.length2)) + r.width * (Number(e.width1) + Number(e.width2));
    bands.set(r.band, (bands.get(r.band) ?? 0) + ((length + edges * BAND_EXTRA) * r.quantity) / 1000);
  }
  for (const [band, metres] of [...bands].sort((a, b) => a[0] - b[0])) {
    lines.push({ label: `Chant ${fmt(band)} mm`, quantity: Math.ceil(metres * 10) / 10, unit: "m", detail: `surlongueur de ${BAND_EXTRA} mm par chant comprise`, family: "band", basis: { metres: 1 } });
  }
  for (const h of hardware) {
    if (h.quantity <= 0) continue;
    const pack = PACKS[h.name];
    if (pack && !h.unit) {
      const boxes = Math.ceil(h.quantity / pack);
      lines.push({ label: h.name, quantity: boxes, unit: boxes > 1 ? `boîtes de ${pack}` : `boîte de ${pack}`, detail: `${fmt(h.quantity)} utilisés`, family: "hardware", basis: { name: h.name, pieces: pack, ...(h.price === undefined ? {} : { price: h.price }) } });
    } else lines.push({ label: h.name, quantity: Math.round(h.quantity * 100) / 100, unit: h.unit ?? "pièce", family: "hardware", basis: { name: h.name, pieces: 1, ...(h.price === undefined ? {} : { price: h.price }) } });
  }
  return lines;
}

/** The list to buy for a spreadsheet or a supplier: « ; » between columns, as cutListCsv. */
export function purchaseCsv(lines: readonly PurchaseLine[]): string {
  // Quoted only when needed (a « ; », a quote, a line break), or when it would read as a formula (csvText).
  const cell = (text: string) => (/^[=+\-@\t\r]/.test(text) || /[;"\n]/.test(text) ? csvText(text) : text);
  return ["Article;Quantité;Unité;Détail", ...lines.map((l) => [cell(l.label), String(l.quantity).replace(".", ","), cell(l.unit), cell(l.detail ?? "")].join(";"))].join("\n");
}

/** Cut lists of several projects made `quantity` times each, as one (part names prefixed by their project). */
export function combineRows(items: readonly { name: string; quantity: number; rows: readonly CutRow[] }[]): CutRow[] {
  return items.flatMap((item) =>
    // The marks and bodies are those of each project: not kept.
    item.rows.map(({ tag, ids, ...r }) => ({ ...r, quantity: r.quantity * item.quantity, names: Array.from({ length: item.quantity }, () => r.names.map((n) => `${item.name} — ${n}`)).flat() })),
  );
}

/** Hardware of several projects made `quantity` times each, added up by name. */
export function combineHardware(items: readonly { quantity: number; hardware: readonly { name: string; quantity: number; unit?: string }[] }[]): { name: string; quantity: number; unit?: string }[] {
  const out = new Map<string, { name: string; quantity: number; unit?: string }>();
  for (const item of items) {
    for (const h of item.hardware) {
      const known = out.get(h.name) ?? { name: h.name, quantity: 0, ...(h.unit ? { unit: h.unit } : {}) };
      known.quantity = Math.round((known.quantity + h.quantity * item.quantity) * 100) / 100;
      out.set(h.name, known);
    }
  }
  return [...out.values()];
}
