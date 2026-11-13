/**
 * Bons de commande : la liste d'achat (purchase.ts) partagée entre les fournisseurs de l'atelier. Chaque fournisseur
 * dit ce qu'il vend — des familles d'articles (panneaux, tasseaux, chants, quincaillerie) — et un article peut être
 * confié à un autre ; ce qui n'a pas de fournisseur forme un bon « à attribuer », les chutes du stock n'en font pas
 * partie. Chaque ligne porte un prix unitaire indicatif HT tiré des tarifs du devis (le panneau au m² de sa surface,
 * la barre et le chant au mètre, la quincaillerie à la pièce ou à la boîte), le bon son total. Pur.
 */
import { csvText } from "./csv-text";
import type { PurchaseFamily, PurchaseLine } from "./purchase";
import { CURRENCY, DEFAULT_RATES, type QuoteRates } from "./quote";

export type OrderFamily = Exclude<PurchaseFamily, "offcut">;

export const FAMILIES: [OrderFamily, string][] = [
  ["board", "Panneaux"],
  ["bar", "Tasseaux"],
  ["band", "Chants"],
  ["hardware", "Quincaillerie"],
];

export interface Supplier {
  id: string;
  name: string;
  /** How to reach them: an address, a telephone, an e-mail — as typed. */
  contact?: string;
  families: OrderFamily[];
}

export interface SupplierSettings {
  suppliers: Supplier[];
  /** An article given to one supplier, whatever its family: by its label. */
  articles: Record<string, string>;
}

export const NO_SUPPLIERS: SupplierSettings = { suppliers: [], articles: {} };

export interface OrderLine extends PurchaseLine {
  /** Indicative price of one unit, and of the line (MAD HT); none when no rate gives it. */
  unitPrice?: number;
  total?: number;
}

export interface PurchaseOrder {
  /** Null: the articles no supplier sells yet. */
  supplier: Supplier | null;
  lines: OrderLine[];
  /** Total of the lines priced (MAD HT), and whether some are not. */
  total: number;
  unpriced: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** The indicative price of one unit of a line, from the rates of the quote; undefined when none applies. */
export function unitPrice(line: PurchaseLine, rates: QuoteRates = DEFAULT_RATES): number | undefined {
  const b = line.basis;
  if (!b) return undefined;
  if (line.family === "board" && b.material && b.area) return cents((rates.boards[b.material] ?? rates.boards.default ?? 0) * b.area);
  if (line.family === "bar" && b.material && b.metres) {
    const rate = rates.boards[b.material] ?? DEFAULT_RATES.boards[b.material];
    return rate === undefined ? undefined : cents(rate * b.metres);
  }
  if (line.family === "band") return cents(rates.band * (b.metres ?? 1));
  if (line.family === "hardware" && b.name) {
    // A rate set by hand wins, then the catalogue's price of the model chosen.
    const each = rates.hardware?.[b.name] ?? b.price;
    return each === undefined ? undefined : cents(each * (b.pieces ?? 1));
  }
  return undefined;
}

/** The supplier of a line: the one it is given to, else the first that sells its family. */
export function supplierOf(line: PurchaseLine, settings: SupplierSettings): Supplier | null {
  const given = settings.articles[line.label];
  const chosen = given ? settings.suppliers.find((s) => s.id === given) : undefined;
  if (chosen) return chosen;
  return settings.suppliers.find((s) => s.families.includes(line.family as OrderFamily)) ?? null;
}

/** One order per supplier, in the order of the settings, the articles without one last; the offcuts left out. */
export function purchaseOrders(lines: readonly PurchaseLine[], settings: SupplierSettings, rates: QuoteRates = DEFAULT_RATES): PurchaseOrder[] {
  const orders = new Map<string, PurchaseOrder>();
  for (const line of lines) {
    if (line.family === "offcut" || line.quantity <= 0) continue;
    const supplier = supplierOf(line, settings);
    const key = supplier?.id ?? "";
    const order = orders.get(key) ?? { supplier, lines: [], total: 0, unpriced: 0 };
    const price = unitPrice(line, rates);
    order.lines.push(price === undefined ? { ...line } : { ...line, unitPrice: price, total: cents(price * line.quantity) });
    if (price === undefined) order.unpriced++;
    else order.total = cents(order.total + price * line.quantity);
    orders.set(key, order);
  }
  const rank = (o: PurchaseOrder) => (o.supplier ? settings.suppliers.indexOf(o.supplier) : settings.suppliers.length);
  return [...orders.values()].sort((a, b) => rank(a) - rank(b));
}

const money = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The orders as printable pages, one per supplier: its name and contact, the project, the date, a number, the lines. */
export function ordersHtml(orders: readonly PurchaseOrder[], project: string, date: string, number: string): string {
  return orders
    .map((o, i) => {
      const to = o.supplier ? `<p class="to"><b>${escape(o.supplier.name)}</b>${o.supplier.contact ? `<br>${escape(o.supplier.contact).replace(/\n/g, "<br>")}` : ""}</p>` : `<p class="to"><b>Fournisseur à choisir</b> — articles qu'aucun fournisseur ne vend encore</p>`;
      const rows = o.lines
        .map((l) => `<tr><td>${escape(l.label)}${l.detail ? `<br><small>${escape(l.detail)}</small>` : ""}</td><td class="n">${quantity(l.quantity)}</td><td>${escape(l.unit)}</td><td class="n">${l.unitPrice === undefined ? "—" : money(l.unitPrice)}</td><td class="n">${l.total === undefined ? "—" : money(l.total)}</td></tr>`)
        .join("");
      return `<section class="order"><h1>Bon de commande n° ${escape(number)}-${i + 1}</h1><p>Projet : ${escape(project)} · ${escape(date)}</p>${to}
        <table><thead><tr><th>Article</th><th>Quantité</th><th>Unité</th><th>Prix unitaire HT (${CURRENCY})</th><th>Total HT (${CURRENCY})</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th colspan="4">Total HT indicatif${o.unpriced ? ` (${o.unpriced} article${o.unpriced > 1 ? "s" : ""} sans prix)` : ""}</th><th class="n">${money(o.total)}</th></tr></tfoot></table>
        <p class="note">Prix indicatifs, tirés des tarifs du devis : à confirmer par le fournisseur.</p></section>`;
    })
    .join("");
}

export const ORDERS_CSS = ".order{page-break-after:always}.order table{width:100%;border-collapse:collapse}.order td,.order th{border-bottom:1px solid #ccc;padding:4px;text-align:left}.order .n{text-align:right}.order .to{margin:8px 0;padding:6px;border:1px solid #999}.order .note{font-size:11px;color:#555}";

/** An order as CSV, for the supplier's spreadsheet: « ; » between columns, French decimals. */
export function orderCsv(order: PurchaseOrder): string {
  const cell = (text: string) => (/^[=+\-@\t\r]/.test(text) || /[;"\n]/.test(text) ? csvText(text) : text);
  const dec = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));
  return [
    `Article;Quantité;Unité;Détail;Prix unitaire HT (${CURRENCY});Total HT (${CURRENCY})`,
    ...order.lines.map((l) => [cell(l.label), dec(l.quantity), cell(l.unit), cell(l.detail ?? ""), dec(l.unitPrice), dec(l.total)].join(";")),
  ].join("\n");
}

/** A name for a file of this supplier: plain letters, no accent. */
export function supplierFile(order: PurchaseOrder): string {
  const name = (order.supplier?.name ?? "a-attribuer").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return name || "fournisseur";
}

/** Settings read back from storage: what is not as expected is left out. */
export function parseSuppliers(raw: unknown): SupplierSettings {
  if (typeof raw !== "object" || raw === null) return { suppliers: [], articles: {} };
  const r = raw as { suppliers?: unknown; articles?: unknown };
  const known = new Set(FAMILIES.map(([f]) => f));
  const suppliers = (Array.isArray(r.suppliers) ? r.suppliers : [])
    .filter((s): s is Supplier => typeof s === "object" && s !== null && typeof (s as Supplier).id === "string" && typeof (s as Supplier).name === "string" && Array.isArray((s as Supplier).families))
    .map((s) => ({ id: s.id, name: s.name.slice(0, 200), ...(typeof s.contact === "string" ? { contact: s.contact.slice(0, 1000) } : {}), families: s.families.filter((f) => known.has(f)) }));
  const ids = new Set(suppliers.map((s) => s.id));
  const articles = Object.fromEntries(Object.entries(typeof r.articles === "object" && r.articles !== null ? r.articles : {}).filter(([, id]) => typeof id === "string" && ids.has(id))) as Record<string, string>;
  return { suppliers, articles };
}
