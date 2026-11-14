/**
 * Devis d'un meuble à partir de sa liste de débit : les panneaux au m² par matière (chutes comprises), les chants
 * au mètre, la découpe par pièce, les perçages (le « Tooling Price » de Polyboard), les rainures des façades décor au
 * mètre et la main-d'œuvre de montage, puis
 * la marge, une remise par paliers de montant et la TVA. Les tarifs sont indicatifs et se règlent (ils sont retenus
 * par le navigateur). Un scénario remplace une matière par une autre pour comparer les prix ; les versions
 * enregistrées dans le projet (le devis initial, puis les avenants) gardent chacune ses lignes et son total.
 * Les prix sont en dirhams marocains (MAD). Les tarifs d'origine, fixés en euros, sont convertis à 10,8 MAD l'euro ;
 * ceux des portes vitrées (verre trempé au m², profilé alu au mètre, charnière pour cadre alu) sont fixés en MAD.
 */
import { GLASS_RATES } from "../features/glass-door";
import { csvText } from "./csv-text";
import { formatLength } from "../measurements/units";
import { barLength } from "./bars";
import type { CutTotals } from "./cut-list";
import type { DisplayUnit } from "./types";

export interface QuoteRates {
  /** Price of the boards (MAD HT per m², per metre for battens), by material name; `default` for the others. */
  boards: Record<string, number>;
  /** Share of the sheets lost in offcuts (%). */
  waste: number;
  /** Edge band, glued (MAD HT per m). */
  band: number;
  /** Sawing and drilling of one part (MAD HT). */
  cutPerPart: number;
  /** Assembly time per part (h) and hourly rate (MAD HT). */
  hoursPerPart: number;
  hourly: number;
  /** Price of the hardware (MAD HT each), by name. */
  hardware: Record<string, number>;
  /** Margin on the cost (%) and VAT (%). */
  margin: number;
  vat: number;
  /** Price of one hole drilled (MAD HT); 0: included in the cutting. */
  perHole?: number;
  /** Routing of the grooves of fluted or slatted fronts (MAD HT per metre of groove). */
  perGrooveMetre?: number;
  /** Discounts by amount: from this total HT (MAD), this discount (%) — the highest reached applies. */
  tiers?: [number, number][];
}

/** The currency of every price: the Moroccan dirham. */
export const CURRENCY = "MAD";

/** Dirhams for one euro: the usual rates below were set in euros. */
export const EURO_IN_MAD = 10.8;

/** A price set in euros, in dirhams (to the centime). */
export const mad = (euros: number): number => Math.round(euros * EURO_IN_MAD * 100) / 100;

const inMad = (prices: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, mad(v)]));

export const DEFAULT_RATES: QuoteRates = {
  boards: inMad({
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
    "Tasseau sapin raboté": 3,
    "Tasseau chêne": 12,
  }),
  waste: 15,
  hardware: {
    ...inMad({ "Charnière à boîtier Ø35": 3.5, "Coulisse de tiroir (paire)": 18, "Poignée entraxe 128 mm": 6, "Vis confirmat 7 × 50": 0.15, "Tourillon Ø8 × 30": 0.05, "Excentrique Minifix 15 + tige": 0.6, "Tringle de penderie Ø25 (m)": 8, "Support de tringle": 2.5, "Pied réglable": 2.5, "Rail de porte coulissante": 25, "Porte-pantalons coulissant": 45, "Penderie escamotable": 90, "Compas de porte relevable force 1 (paire)": 35, "Compas de porte relevable force 2 (paire)": 45, "Compas de porte relevable force 3 (paire)": 60, "Compas de porte relevable force 4 (paire)": 80, "Compas d'abattant (paire)": 15, "Profil gorge alu (m)": 12 }),
    // Glazed doors, in MAD already.
    ...GLASS_RATES,
  },
  band: mad(1.5),
  cutPerPart: mad(4),
  perGrooveMetre: mad(2.5),
  hoursPerPart: 0.25,
  hourly: mad(45),
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
  /** Discount of the tier reached (HT, positive), and its rate (%). */
  discount?: number;
  discountRate?: number;
  /** Total HT, VAT, TTC. */
  net: number;
  vat: number;
  gross: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

export function makeQuote(totals: CutTotals[], rates: QuoteRates, hardware: { name: string; quantity: number; unit?: string; price?: number }[] = [], unit: DisplayUnit = "mm", holes = 0, grooves = 0): Quote {
  const lines: QuoteLine[] = [];
  for (const t of totals) {
    // Battens by the metre, the boards by the square metre.
    if (barLength(t.material) !== null) {
      const metres = cents((t.metres ?? 0) * (1 + rates.waste / 100));
      const price = rates.boards[t.material] ?? DEFAULT_RATES.boards[t.material] ?? mad(3);
      lines.push({ label: `${t.material} ${formatLength(t.thickness, unit)} (chutes ${rates.waste} % comprises)`, quantity: metres, unit: "m", unitPrice: price, total: cents(metres * price) });
      continue;
    }
    const area = cents(t.area * (1 + rates.waste / 100));
    const price = rates.boards[t.material] ?? rates.boards.default ?? 0;
    lines.push({ label: `${t.material} ${formatLength(t.thickness, unit)} (chutes ${rates.waste} % comprises)`, quantity: area, unit: "m²", unitPrice: price, total: cents(area * price) });
  }
  const band = cents(totals.reduce((s, t) => s + t.bandLength, 0));
  if (band > 0) lines.push({ label: "Chant collé", quantity: band, unit: "m", unitPrice: rates.band, total: cents(band * rates.band) });
  const parts = totals.reduce((s, t) => s + t.parts, 0);
  if (parts > 0) {
    lines.push({ label: "Découpe et perçage", quantity: parts, unit: "pièce", unitPrice: rates.cutPerPart, total: cents(parts * rates.cutPerPart) });
    if ((rates.perHole ?? 0) > 0 && holes > 0) lines.push({ label: "Perçages (usinage)", quantity: holes, unit: "perçage", unitPrice: rates.perHole!, total: cents(holes * rates.perHole!) });
    // Fluted or slatted fronts: their grooves routed, by the metre (features/decor-length.ts).
    const perGroove = rates.perGrooveMetre ?? DEFAULT_RATES.perGrooveMetre ?? 0;
    if (perGroove > 0 && grooves > 0) lines.push({ label: "Rainures décor (usinage)", quantity: cents(grooves), unit: "m", unitPrice: perGroove, total: cents(grooves * perGroove) });
    const hours = cents(parts * rates.hoursPerPart);
    lines.push({ label: "Montage", quantity: hours, unit: "h", unitPrice: rates.hourly, total: cents(hours * rates.hourly) });
  }
  for (const h of hardware) {
    if (h.quantity <= 0) continue;
    // A rate set by hand wins; else the catalogue's price of the model chosen.
    const price = rates.hardware?.[h.name] ?? h.price ?? 0;
    lines.push({ label: h.name, quantity: h.quantity, unit: h.unit ?? "pièce", unitPrice: price, total: cents(h.quantity * price) });
  }
  const cost = cents(lines.reduce((s, l) => s + l.total, 0));
  const margin = cents((cost * rates.margin) / 100);
  const before = cents(cost + margin);
  const discountRate = [...(rates.tiers ?? [])].sort((a, b) => b[0] - a[0]).find(([from]) => before >= from)?.[1] ?? 0;
  const discount = cents((before * discountRate) / 100);
  const net = cents(before - discount);
  const vat = cents((net * rates.vat) / 100);
  return { lines, cost, margin, ...(discount ? { discount, discountRate } : {}), net, vat, gross: cents(net + vat) };
}

/** "1 234,50 MAD". */
export function money(value: number): string {
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY}`;
}

/** The quote as CSV (semicolon separated, for a spreadsheet in French). */
export function quoteCsv(quote: Quote): string {
  const n = (v: number) => String(v).replace(".", ",");
  const rows = [
    ["Désignation", "Quantité", "Unité", `Prix unitaire HT (${CURRENCY})`, `Total HT (${CURRENCY})`],
    ...quote.lines.map((l) => [l.label, n(l.quantity), l.unit, n(l.unitPrice), n(l.total)]),
    ["Coût", "", "", "", n(quote.cost)],
    ["Marge", "", "", "", n(quote.margin)],
    ...(quote.discount ? [[`Remise ${quote.discountRate} %`, "", "", "", n(-quote.discount)]] : []),
    ["Total HT", "", "", "", n(quote.net)],
    ["TVA", "", "", "", n(quote.vat)],
    ["Total TTC", "", "", "", n(quote.gross)],
  ];
  // A number (a discount is negative) as it is; a text quoted, a formula kept as text.
  return rows.map((r) => r.map((c) => (/^-?[\d,]*$/.test(c) ? c : csvText(c))).join(";")).join("\r\n");
}

/** The totals with one material replaced by another (a scenario): the same areas, priced at the other's rate. */
export function scenarioTotals(totals: readonly CutTotals[], from: string, to: string): CutTotals[] {
  return totals.map((t) => (t.material === from ? { ...t, material: to } : t));
}

/** A version of the quote kept in the project: the first is the quote, the next ones the amendments (avenants). */
export interface SavedQuote {
  id: string;
  label: string;
  date: string;
  lines: QuoteLine[];
  net: number;
  gross: number;
}

/** The project's quotes with this one added, named « Devis initial » or « Avenant n ». */
export function withSavedQuote(saved: readonly SavedQuote[], quote: Quote, date = new Date().toISOString()): SavedQuote[] {
  const label = saved.length ? `Avenant ${saved.length}` : "Devis initial";
  return [...saved, { id: `q${Date.now().toString(36)}${saved.length}`, label, date, lines: quote.lines, net: quote.net, gross: quote.gross }];
}

/** What changed from one version to the next: lines added, removed or with another total (HT). */
export function quoteChanges(before: SavedQuote, after: Pick<SavedQuote, "lines" | "gross">): { label: string; was: number; now: number }[] {
  const was = new Map(before.lines.map((l) => [l.label, l.total]));
  const now = new Map(after.lines.map((l) => [l.label, l.total]));
  return [...new Set([...was.keys(), ...now.keys()])]
    .map((label) => ({ label, was: was.get(label) ?? 0, now: now.get(label) ?? 0 }))
    .filter((c) => Math.abs(c.now - c.was) >= 0.005);
}
