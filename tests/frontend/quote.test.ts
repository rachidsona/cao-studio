/** Devis à partir de la liste de débit : matières avec chutes, chants, découpe, montage, marge et TVA. */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES, euros, makeQuote, quoteCsv } from "../../frontend/src/document/quote";

const totals = [
  { material: "Mélaminé blanc", thickness: 18, area: 2, bandLength: 10, parts: 6 },
  { material: "Panneau de fond (HDF)", thickness: 3, area: 0.5, bandLength: 0, parts: 1 },
];

describe("devis", () => {
  it("chiffre matières, chants, découpe et montage, puis marge et TVA", () => {
    const q = makeQuote(totals, { ...DEFAULT_RATES, waste: 10, margin: 20, vat: 20 });
    expect(q.lines.map((l) => [l.unit, l.quantity, l.total])).toEqual([
      ["m²", 2.2, 39.6], // 2 m² + 10 % at 18 €
      ["m²", 0.55, 3.3], // 0,5 m² + 10 % at 6 €
      ["m", 10, 15], // 10 m at 1,50 €
      ["pièce", 7, 28], // 7 parts at 4 €
      ["h", 1.75, 78.75], // 7 × 0,25 h at 45 €
    ]);
    expect(q.cost).toBe(164.65);
    expect(q.margin).toBe(32.93);
    expect(q.net).toBe(197.58);
    expect(q.vat).toBe(39.52);
    expect(q.gross).toBe(237.1);
  });

  it("une matière sans tarif prend le prix par défaut ; rien à chiffrer sans pièce", () => {
    const q = makeQuote([{ material: "Bambou", thickness: 19, area: 1, bandLength: 0, parts: 1 }], { ...DEFAULT_RATES, waste: 0 });
    expect(q.lines[0]?.unitPrice).toBe(DEFAULT_RATES.boards.default);
    expect(makeQuote([], DEFAULT_RATES).gross).toBe(0);
  });

  it("s'écrit en euros à la française et en CSV pour un tableur", () => {
    expect(euros(1234.5).replace(/\s/g, " ")).toBe("1 234,50 €");
    const csv = quoteCsv(makeQuote(totals, DEFAULT_RATES));
    expect(csv.split("\r\n")[0]).toBe('"Désignation";"Quantité";"Unité";"Prix unitaire HT";"Total HT"');
    expect(csv).toContain('"Total TTC"');
  });
});
