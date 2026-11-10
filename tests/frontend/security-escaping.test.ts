/**
 * Non-régression de sécurité (skill secure-application-guardian) : le HTML que l'éditeur génère échappe ce qui vient
 * des autres comptes (catalogue commun, profil de l'atelier) et des fichiers (noms de pièces, de matières). Une charge
 * <img onerror> ou <script> ne doit jamais ressortir telle quelle.
 */
import { describe, expect, it } from "vitest";
import { companyHeaderHtml } from "../../frontend/src/document/catalog";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { DEFAULT_LABEL, labelHtml } from "../../frontend/src/document/label-template";
import type { CutRow, CutTotals } from "../../frontend/src/document/cut-list";
import { escapeHtml } from "../../frontend/src/app/workshop/workshop-ui";
import { quoteHtml } from "../../frontend/src/app/workshop/quote-html";
import { cutSheetHtml } from "../../frontend/src/app/workshop/cut-list-view";

const XSS = '<img src=x onerror="alert(1)">';
const raw = (html: string) => html.includes("<img src=x") || html.includes("<script");

describe("échappement du HTML généré", () => {
  it("escapeHtml neutralise les caractères du HTML", () => {
    expect(escapeHtml(`${XSS}&`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
  });

  it("l'en-tête des documents (profil de l'atelier commun) est échappé, et un logo n'est qu'une image en data URL", () => {
    const profile = { name: XSS, slogan: XSS, address: XSS, phone: XSS, email: XSS, website: XSS, logo: "javascript:alert(1)" };
    const html = companyHeaderHtml(profile);
    expect(raw(html)).toBe(false);
    expect(html).not.toContain("javascript:");
    expect(companyHeaderHtml({ ...profile, logo: "https://pirate.example/x.png" })).not.toContain("pirate.example");
    expect(companyHeaderHtml({ ...profile, logo: "data:image/png;base64,AAAA" })).toContain('src="data:image/png;base64,AAAA"');
  });

  it("le devis échappe les noms et les unités de la quincaillerie du catalogue (audit du 10/11/2026, constat 1)", () => {
    const html = quoteHtml(makeQuote([{ material: XSS, thickness: 19, area: 1, bandLength: 0, parts: 1 }], DEFAULT_RATES, [{ name: XSS, quantity: 2, unit: XSS, price: 1 }]));
    expect(raw(html)).toBe(false);
  });

  it("la liste de débit échappe les noms des pièces et des matières", () => {
    const row = { names: [XSS], quantity: 1, length: 1000, width: 400, thickness: 18, material: XSS, grain: "length", tag: XSS, edges: { length1: true, length2: false, width1: false, width2: false } } as unknown as CutRow;
    const totals: CutTotals[] = [{ material: XSS, thickness: 18, area: 0.4, bandLength: 1, parts: 1 }];
    expect(raw(cutSheetHtml([row], totals, "cm"))).toBe(false);
  });

  it("une étiquette échappe ses champs et son logo", () => {
    const html = labelHtml({ ...DEFAULT_LABEL, logo: `"><script>alert(1)</script>` }, { name: XSS, project: XSS, material: XSS, size: XSS, qr: "" } as never, escapeHtml);
    expect(raw(html)).toBe(false);
  });
});
