/** « PDF » de la vue cadrée : la vue en JPEG sur une page A4 paysage, sous son cartouche. */
import { describe, expect, it } from "vitest";
import { writePdf } from "../../frontend/src/drawing/pdf-writer";
import { viewPage } from "../../frontend/src/app/view-pdf";

describe("la vue cadrée en PDF", () => {
  it("une page A4 paysage, l'image gardée en JPEG (en hexadécimal : le fichier reste en ASCII), centrée sous le cartouche", () => {
    const page = viewPage({ hex: "ffd8ffd9", width: 1600, height: 800 }, "Dressing — Mur C isolé", ["21 novembre 2026 · cotes en cm"]);
    expect([page.width, page.height]).toEqual([297, 210]);
    expect(page.content).toContain("/Im1 Do");
    const pdf = writePdf([page], "Dressing");
    expect(pdf).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
    expect(pdf).toContain("/Filter [/ASCIIHexDecode /DCTDecode]");
    expect(pdf).toContain("stream\nffd8ffd9>\nendstream");
    expect(pdf).toContain("(Dressing \\227 Mur C isol\\351)");
    // 277 mm wide at most, 2:1: the picture takes the whole width.
    expect(page.content).toMatch(/^q 277\.000 0 0 -138\.500 10\.000/);
    expect([...pdf].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });
});
