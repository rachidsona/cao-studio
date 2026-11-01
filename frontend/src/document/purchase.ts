/**
 * Liste d'achat (comme celle de SketchList ou d'OpenCutList) : ce qu'il faut commander pour fabriquer, déduit du
 * calepinage — les panneaux neufs par matière et épaisseur (les chutes du stock à part), le chant au mètre par
 * épaisseur, avec sa surlongueur de collage, et la quincaillerie arrondie au conditionnement (boîtes de vis, de
 * tourillons). Pur.
 */
import type { CutRow } from "./cut-list";
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

export interface PurchaseLine {
  label: string;
  quantity: number;
  unit: string;
  detail?: string;
}

const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function purchaseList(sheets: readonly Sheet[], rows: readonly CutRow[], hardware: readonly { name: string; quantity: number; unit?: string }[] = []): PurchaseLine[] {
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
    lines.push({ label: `${b.material} ${fmt(b.thickness)} mm`, quantity: b.count, unit: b.count > 1 ? "panneaux" : "panneau", detail: `${b.size[0]} × ${b.size[1]} mm, utilisés à ${Math.round((b.used / b.count) * 100)} %` });
  }
  if (offcuts) lines.push({ label: "Chutes du stock utilisées", quantity: offcuts, unit: offcuts > 1 ? "chutes" : "chute", detail: "à sortir du stock" });
  const bands = new Map<number, number>();
  for (const r of rows) {
    if (!r.band) continue;
    const e = r.edges;
    const edges = Number(e.length1) + Number(e.length2) + Number(e.width1) + Number(e.width2);
    const length = r.length * (Number(e.length1) + Number(e.length2)) + r.width * (Number(e.width1) + Number(e.width2));
    bands.set(r.band, (bands.get(r.band) ?? 0) + ((length + edges * BAND_EXTRA) * r.quantity) / 1000);
  }
  for (const [band, metres] of [...bands].sort((a, b) => a[0] - b[0])) {
    lines.push({ label: `Chant ${fmt(band)} mm`, quantity: Math.ceil(metres * 10) / 10, unit: "m", detail: `surlongueur de ${BAND_EXTRA} mm par chant comprise` });
  }
  for (const h of hardware) {
    if (h.quantity <= 0) continue;
    const pack = PACKS[h.name];
    if (pack && !h.unit) {
      const boxes = Math.ceil(h.quantity / pack);
      lines.push({ label: h.name, quantity: boxes, unit: boxes > 1 ? `boîtes de ${pack}` : `boîte de ${pack}`, detail: `${fmt(h.quantity)} utilisés` });
    } else lines.push({ label: h.name, quantity: Math.round(h.quantity * 100) / 100, unit: h.unit ?? "pièce" });
  }
  return lines;
}

/** Cut lists of several projects made `quantity` times each, as one (part names prefixed by their project). */
export function combineRows(items: readonly { name: string; quantity: number; rows: readonly CutRow[] }[]): CutRow[] {
  return items.flatMap((item) =>
    item.rows.map((r) => ({ ...r, quantity: r.quantity * item.quantity, names: Array.from({ length: item.quantity }, () => r.names.map((n) => `${item.name} — ${n}`)).flat() })),
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
