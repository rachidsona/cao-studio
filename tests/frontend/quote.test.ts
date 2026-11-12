/** Devis à partir de la liste de débit : matières avec chutes, chants, découpe, montage, marge et TVA. */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES, EURO_IN_MAD, money, makeQuote, quoteCsv } from "../../frontend/src/document/quote";

const totals = [
  { material: "Mélaminé blanc", thickness: 18, area: 2, bandLength: 10, parts: 6 },
  { material: "Panneau de fond (HDF)", thickness: 3, area: 0.5, bandLength: 0, parts: 1 },
];

describe("devis", () => {
  it("chiffre matières, chants, découpe et montage, puis marge et TVA", () => {
    const q = makeQuote(totals, { ...DEFAULT_RATES, waste: 10, margin: 20, vat: 20 });
    expect(q.lines.map((l) => [l.unit, l.quantity, l.total])).toEqual([
      ["m²", 2.2, 427.68], // 2 m² + 10 % at 194,40 MAD (18 €)
      ["m²", 0.55, 35.64], // 0,5 m² + 10 % at 64,80 MAD (6 €)
      ["m", 10, 162], // 10 m at 16,20 MAD (1,50 €)
      ["pièce", 7, 302.4], // 7 parts at 43,20 MAD (4 €)
      ["h", 1.75, 850.5], // 7 × 0,25 h at 486 MAD (45 €)
    ]);
    // In dirhams: what it was in euros, at 10,8 MAD the euro.
    expect(q.cost).toBe(1778.22);
    expect(q.cost).toBeCloseTo(164.65 * EURO_IN_MAD, 6);
    expect(q.margin).toBe(355.64);
    expect(q.net).toBe(2133.86);
    expect(q.vat).toBe(426.77);
    expect(q.gross).toBe(2560.63);
  });

  it("une matière sans tarif prend le prix par défaut ; rien à chiffrer sans pièce", () => {
    const q = makeQuote([{ material: "Bambou", thickness: 19, area: 1, bandLength: 0, parts: 1 }], { ...DEFAULT_RATES, waste: 0 });
    expect(q.lines[0]?.unitPrice).toBe(DEFAULT_RATES.boards.default);
    expect(makeQuote([], DEFAULT_RATES).gross).toBe(0);
  });

  it("s'écrit en dirhams (MAD) à la française et en CSV pour un tableur", () => {
    expect(money(1234.5).replace(/\s/g, " ")).toBe("1 234,50 MAD");
    const csv = quoteCsv(makeQuote(totals, DEFAULT_RATES));
    expect(csv.split("\r\n")[0]).toBe('"Désignation";"Quantité";"Unité";"Prix unitaire HT (MAD)";"Total HT (MAD)"');
    expect(csv).toContain('"Total TTC"');
  });
});

describe("devis et quincaillerie", () => {
  it("compte la quincaillerie à son prix unitaire", () => {
    const q = makeQuote([], DEFAULT_RATES, [{ name: "Charnière à boîtier Ø35", quantity: 4 }, { name: "Inconnu", quantity: 1 }]);
    expect(q.lines.map((l) => [l.label, l.quantity, l.total])).toEqual([
      ["Charnière à boîtier Ø35", 4, 151.2], // 37,80 MAD each (3,50 €)
      ["Inconnu", 1, 0],
    ]);
  });
});
