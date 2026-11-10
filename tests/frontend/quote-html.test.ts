/** Le devis en HTML : ce qui vient du catalogue commun (l'unité d'un article de quincaillerie) est échappé. */
import { describe, expect, it } from "vitest";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { quoteHtml } from "../../frontend/src/app/workshop/quote-html";

const totals = [{ material: "Mélaminé blanc", thickness: 19, area: 1, bandLength: 0, parts: 1 }];

describe("quoteHtml", () => {
  it("échappe l'unité d'un article du catalogue", () => {
    const html = quoteHtml(makeQuote(totals, DEFAULT_RATES, [{ name: "Charnière", quantity: 2, unit: "<img src=x onerror=alert(1)>", price: 3 }]));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("échappe la désignation et garde les unités usuelles", () => {
    const html = quoteHtml(makeQuote(totals, DEFAULT_RATES, [{ name: "<b>Vis</b>", quantity: 4, unit: "pièce", price: 0.1 }]));
    expect(html).toContain("&lt;b&gt;Vis&lt;/b&gt;");
    expect(html).toContain("4 pièces");
    expect(html).toContain(" m²");
  });
});
