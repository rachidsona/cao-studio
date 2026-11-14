/** Le PDF écrit directement : structure valide (renvois exacts), texte en WinAnsi, échelle exacte, arcs et hachures. */
import { describe, expect, it } from "vitest";
import { MM, pdfString, textWidth, writePdf } from "../../frontend/src/drawing/pdf-writer";
import { sheetsPdf, svgToPdfPage } from "../../frontend/src/drawing/svg-pdf";

const SHEET = `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210"><defs><pattern id="hatch-v1-0" width="2.5" height="2.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.5" stroke="#111827" stroke-width="0.18"/></pattern></defs><rect width="297" height="210" fill="#fff"/>
<g data-id="frame"><rect x="10" y="10" width="277" height="190" fill="none" stroke="#111827" stroke-width="0.6"/></g>
<line x1="20.00" y1="30.00" x2="120.00" y2="30.00" stroke="#111827" stroke-width="0.25" stroke-dasharray="2 1"/>
<path d="M50.00 50.00L60.00 50.00L60.00 60.00Z" fill="url(#hatch-v1-0)" fill-rule="evenodd" stroke="none"/>
<path d="M10.00 100.00A10.00 10.00 0 0 1 30.00 100.00" stroke="#1d4ed8" stroke-width="0.18" fill="none"/>
<path d="M5 5L7.5 5.8L7.5 4.2Z" fill="#1d4ed8"/>
<text x="148.50" y="20.00" font-size="5" font-family="Helvetica, Arial, sans-serif" fill="#111827" text-anchor="middle" font-weight="bold">Façade &amp; côté — Ø8</text>
<text x="40" y="80" font-size="3.5" fill="#1d4ed8" text-anchor="middle" transform="rotate(-90.00 40 80)">720</text>
</svg>`;

describe("PDF de la mise en plan", () => {
  it("le texte en WinAnsi : accents, Ø, tiret long, parenthèses échappées", () => {
    expect(pdfString("Façade (côté) — Ø8 €")).toBe("(Fa\\347ade \\(c\\364t\\351\\) \\227 \\3308 \\200)");
  });

  it("des largeurs de Helvetica : « 720 » fait 3 chiffres de 0,556", () => {
    expect(textWidth("720", 10)).toBeCloseTo(16.68, 6);
  });

  it("une page à la taille de la feuille, traits, pointillés, hachures, arc, flèche pleine, textes centrés et tournés", () => {
    const page = svgToPdfPage(SHEET);
    expect([page.width, page.height]).toEqual([297, 210]);
    expect(page.content).toContain("20 30 m 120 30 l S");
    expect(page.content).toContain("[2 1] 0 d");
    // The cut face: clipped (even-odd), hatched.
    expect(page.content).toMatch(/50 50 m 60 50 l 60 60 l h W\* n .* S Q/);
    // The half circle ends where the arc ends.
    expect(page.content).toMatch(/ 30 100 c S Q/);
    // The arrow: filled only.
    expect(page.content).toMatch(/0\.1137 0\.3059 0\.8471 rg 5 5 m 7\.5 5\.8 l 7\.5 4\.2 l h f Q/);
    // A bold title, centred on its x.
    const width = textWidth("Façade & côté — Ø8", 5, true);
    expect(page.content).toContain(`/F2 5 Tf 1 0 0 -1 ${Number((148.5 - width / 2).toFixed(4))} 20 Tm (Fa\\347ade & c\\364t\\351 \\227 \\3308) Tj`);
    // Turned a quarter: the text runs upwards.
    expect(page.content).toMatch(/\/F1 3\.5 Tf 0 -1 -1 0 40 /);
  });

  it("un fichier PDF dont chaque renvoi tombe sur son objet, une page par feuille, à l'échelle exacte", () => {
    const pdf = sheetsPdf([SHEET, SHEET.replace('viewBox="0 0 297 210"', 'viewBox="0 0 420 297"')], "Cuisine — plans");
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(/[^\x00-\x7f]/.test(pdf)).toBe(false);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain(`/MediaBox [0 0 ${Number((297 * MM).toFixed(4))} ${Number((210 * MM).toFixed(4))}]`);
    expect(pdf).toContain(`/MediaBox [0 0 ${Number((420 * MM).toFixed(4))} ${Number((297 * MM).toFixed(4))}]`);
    // Each stream's length is its own.
    for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });

  it("une page vide écrit un PDF valide", () => {
    expect(writePdf([{ width: 210, height: 297, content: "" }])).toContain("/Count 1");
  });
});
