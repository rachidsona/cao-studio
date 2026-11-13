/** Bons de commande : la liste d'achat partagée entre les fournisseurs, avec les prix indicatifs du devis. */
import { describe, expect, it } from "vitest";
import { purchaseList, type PurchaseLine } from "../../frontend/src/document/purchase";
import { orderCsv, ordersHtml, parseSuppliers, purchaseOrders, supplierFile, supplierOf, unitPrice, type SupplierSettings } from "../../frontend/src/document/purchase-orders";
import { DEFAULT_RATES } from "../../frontend/src/document/quote";
import type { Sheet } from "../../frontend/src/document/nesting";
import type { CutRow } from "../../frontend/src/document/cut-list";

const sheet = (material: string, offcut?: number): Sheet => ({ material, thickness: 18, size: [2800, 2070], placements: [], usage: 0.8, leftovers: [], ...(offcut === undefined ? {} : { offcut }) });
const row: CutRow = { names: ["Côté"], quantity: 2, length: 720, width: 560, thickness: 18, material: "Mélaminé blanc", grain: "length", edges: { length1: true, length2: false, width1: false, width2: false }, band: 1, cutLength: 720, cutWidth: 559, approximate: false };
const lines = (): PurchaseLine[] =>
  purchaseList([sheet("Mélaminé blanc"), sheet("Mélaminé blanc"), sheet("Mélaminé chêne"), sheet("Mélaminé blanc", 4)], [row], [
    { name: "Vis confirmat 7 × 50", quantity: 150 },
    { name: "Blum TANDEM plus BLUMOTION 550H (paire) (réf. 550H)", quantity: 3, price: 450 },
    { name: "Poignée sans prix", quantity: 2 },
  ]);
const settings: SupplierSettings = {
  suppliers: [
    { id: "f1", name: "Panneaux du Sud", contact: "Casablanca\\n05 22 00 00 00", families: ["board", "band"] },
    { id: "f2", name: "Quincaillerie Atlas", families: ["hardware"] },
  ],
  articles: {},
};

describe("bons de commande", () => {
  it("un prix indicatif par unité : le panneau au m² de sa surface, le chant au mètre, la boîte de vis, la coulisse du catalogue", () => {
    const [white, oak] = lines();
    expect(unitPrice(white!)).toBeCloseTo(DEFAULT_RATES.boards["Mélaminé blanc"]! * 2.8 * 2.07, 2);
    expect(unitPrice(oak!)).toBeCloseTo(DEFAULT_RATES.boards["Mélaminé chêne"]! * 2.8 * 2.07, 2);
    const band = lines().find((l) => l.family === "band")!;
    expect(unitPrice(band)).toBe(DEFAULT_RATES.band);
    const screws = lines().find((l) => l.label.startsWith("Vis"))!;
    expect(screws).toMatchObject({ quantity: 2, unit: "boîtes de 100" });
    expect(unitPrice(screws)).toBeCloseTo(DEFAULT_RATES.hardware["Vis confirmat 7 × 50"]! * 100, 2);
    expect(unitPrice(lines().find((l) => l.label.startsWith("Blum"))!)).toBe(450);
    expect(unitPrice(lines().find((l) => l.label === "Poignée sans prix")!)).toBeUndefined();
  });

  it("un bon par fournisseur, selon ce qu'il vend ; un article confié à un autre ; les chutes du stock hors des bons", () => {
    const orders = purchaseOrders(lines(), settings);
    expect(orders.map((o) => o.supplier?.name ?? null)).toEqual(["Panneaux du Sud", "Quincaillerie Atlas"]);
    expect(orders[0]!.lines.map((l) => l.family)).toEqual(["board", "board", "band"]);
    expect(orders.flatMap((o) => o.lines).some((l) => l.family === "offcut")).toBe(false);
    expect(orders[1]).toMatchObject({ unpriced: 1 });
    expect(orders[0]!.total).toBeCloseTo(orders[0]!.lines.reduce((t, l) => t + l.total!, 0), 2);
    // The band given to the hardware's supplier.
    const moved = purchaseOrders(lines(), { ...settings, articles: { "Chant 1 mm": "f2" } });
    expect(moved[1]!.lines.map((l) => l.label)).toContain("Chant 1 mm");
    // Nobody sells the boards: an order « to give ».
    const none = purchaseOrders(lines(), { suppliers: [settings.suppliers[1]!], articles: {} });
    expect(none.map((o) => o.supplier?.name ?? null)).toEqual(["Quincaillerie Atlas", null]);
    expect(supplierOf(lines()[0]!, { suppliers: [], articles: {} })).toBeNull();
  });

  it("les bons s'impriment, une page par fournisseur, et se tapent dans un tableur ; tout texte est échappé", () => {
    const orders = purchaseOrders(lines(), { ...settings, suppliers: [{ ...settings.suppliers[0]!, name: "<b>Bois</b> & Co" }, settings.suppliers[1]!] });
    const html = ordersHtml(orders, "Cuisine \"Dupont\"", "13/11/2026", "202611131200");
    expect(html.match(/<section class="order">/g)).toHaveLength(2);
    expect(html).toContain("Bon de commande n° 202611131200-1");
    expect(html).toContain("&lt;b&gt;Bois&lt;/b&gt; &amp; Co");
    expect(html).toContain("Cuisine &quot;Dupont&quot;");
    expect(html).toContain("1 article sans prix");
    const csv = orderCsv(orders[1]!);
    expect(csv.split("\n")[0]).toBe("Article;Quantité;Unité;Détail;Prix unitaire HT (MAD);Total HT (MAD)");
    expect(csv).toContain("Poignée sans prix;2;pièce;;;");
    expect(supplierFile(orders[0]!)).toBe("b-bois-b-co");
    expect(supplierFile({ supplier: null, lines: [], total: 0, unpriced: 0 })).toBe("a-attribuer");
  });

  it("des réglages relus du navigateur : ce qui n'a pas la forme attendue est laissé de côté", () => {
    expect(parseSuppliers(null)).toEqual({ suppliers: [], articles: {} });
    const read = parseSuppliers({ suppliers: [{ id: "f1", name: "A", families: ["board", "boats"] }, { id: 3, name: "B", families: [] }], articles: { Vis: "f1", Chant: "f9" } });
    expect(read).toEqual({ suppliers: [{ id: "f1", name: "A", families: ["board"] }], articles: { Vis: "f1" } });
  });
});
