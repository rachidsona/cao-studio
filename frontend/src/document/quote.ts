/**
 * Devis d'un meuble à partir de sa liste de débit : les panneaux au m² par matière (chutes comprises), les chants
 * au mètre, la découpe par pièce et la main-d'œuvre de montage, puis la marge et la TVA. Les tarifs sont
 * indicatifs et se règlent (ils sont retenus par le navigateur).
 */
import { formatLength } from "../measurements/units";
import type { CutTotals } from "./cut-list";
import type { DisplayUnit } from "./types";

export interface QuoteRates {
  /** Price of the boards (€ HT per m²), by material name; `default` for the others. */
  boards: Record<string, number>;
  /** Share of the sheets lost in offcuts (%). */
  waste: number;
  /** Edge band, glued (€ HT per m). */
  band: number;
  /** Sawing and drilling of one part (€ HT). */
  cutPerPart: number;
  /** Assembly time per part (h) and hourly rate (€ HT). */
  hoursPerPart: number;
  hourly: number;
  /** Price of the hardware (€ HT each), by name. */
  hardware: Record<string, number>;
  /** Margin on the cost (%) and VAT (%). */
  margin: number;
  vat: number;
}

export const DEFAULT_RATES: QuoteRates = {
  boards: {
    default: 25,
    "Mélaminé blanc": 18,
    "Mélaminé chêne": 24,
    "Mélaminé noyer": 26,
    "Mélaminé anthracite": 22,
    "MDF brut": 16,
    "MDF laqué blanc": 55,
    "Contreplaqué bouleau": 45,
    "Chêne massif": 120,
    "Panneau de fond (HDF)": 6,
  },
  waste: 15,
  hardware: { "Charnière à boîtier Ø35": 3.5, "Coulisse de tiroir (paire)": 18, "Poignée entraxe 128 mm": 6, "Vis confirmat 7 × 50": 0.15, "Tourillon Ø8 × 30": 0.05, "Tringle de penderie Ø25 (m)": 8, "Support de tringle": 2.5 },
  band: 1.5,
  cutPerPart: 4,
  hoursPerPart: 0.25,
  hourly: 45,
  margin: 30,
  vat: 20,
};

export interface QuoteLine {
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Quote {
  lines: QuoteLine[];
  /** Cost of the lines (HT). */
  cost: number;
  margin: number;
  /** Total HT, VAT, TTC. */
  net: number;
  vat: number;
  gross: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

export function makeQuote(totals: CutTotals[], rates: QuoteRates, hardware: { name: string; quantity: number; unit?: string }[] = [], unit: DisplayUnit = "mm"): Quote {
  const lines: QuoteLine[] = [];
  for (const t of totals) {
    const area = cents(t.area * (1 + rates.waste / 100));
    const price = rates.boards[t.material] ?? rates.boards.default ?? 0;
    lines.push({ label: `${t.material} ${formatLength(t.thickness, unit)} (chutes ${rates.waste} % comprises)`, quantity: area, unit: "m²", unitPrice: price, total: cents(area * price) });
  }
  const band = cents(totals.reduce((s, t) => s + t.bandLength, 0));
  if (band > 0) lines.push({ label: "Chant collé", quantity: band, unit: "m", unitPrice: rates.band, total: cents(band * rates.band) });
  const parts = totals.reduce((s, t) => s + t.parts, 0);
  if (parts > 0) {
    lines.push({ label: "Découpe et perçage", quantity: parts, unit: "pièce", unitPrice: rates.cutPerPart, total: cents(parts * rates.cutPerPart) });
    const hours = cents(parts * rates.hoursPerPart);
    lines.push({ label: "Montage", quantity: hours, unit: "h", unitPrice: rates.hourly, total: cents(hours * rates.hourly) });
  }
  for (const h of hardware) {
    if (h.quantity <= 0) continue;
    const price = rates.hardware?.[h.name] ?? 0;
    lines.push({ label: h.name, quantity: h.quantity, unit: h.unit ?? "pièce", unitPrice: price, total: cents(h.quantity * price) });
  }
  const cost = cents(lines.reduce((s, l) => s + l.total, 0));
  const margin = cents((cost * rates.margin) / 100);
  const net = cents(cost + margin);
  const vat = cents((net * rates.vat) / 100);
  return { lines, cost, margin, net, vat, gross: cents(net + vat) };
}

/** "1 234,50 €". */
export function euros(value: number): string {
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** The quote as CSV (semicolon separated, for a spreadsheet in French). */
export function quoteCsv(quote: Quote): string {
  const n = (v: number) => String(v).replace(".", ",");
  const rows = [
    ["Désignation", "Quantité", "Unité", "Prix unitaire HT", "Total HT"],
    ...quote.lines.map((l) => [l.label, n(l.quantity), l.unit, n(l.unitPrice), n(l.total)]),
    ["Coût", "", "", "", n(quote.cost)],
    ["Marge", "", "", "", n(quote.margin)],
    ["Total HT", "", "", "", n(quote.net)],
    ["TVA", "", "", "", n(quote.vat)],
    ["Total TTC", "", "", "", n(quote.gross)],
  ];
  return rows.map((r) => r.map((c) => (/^[\d,]*$/.test(c) ? c : `"${c.replace(/"/g, '""')}"`)).join(";")).join("\r\n");
}
