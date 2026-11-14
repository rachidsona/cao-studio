/** Gabarits de perçage à l'échelle 1 : pages A4 à coller, trous en vraie grandeur à leur place, barre de 100 mm. */
import { describe, expect, it } from "vitest";
import { clipSegment, drillTemplatePages, tiling } from "../../frontend/src/document/drill-template";
import { sheetsPdf } from "../../frontend/src/drawing/svg-pdf";
import type { FlatPart } from "../../frontend/src/io/dxf";

const rect = (w: number, h: number): FlatPart["edges"] => [
  { kind: "line", a: [0, 0], b: [w, 0] },
  { kind: "line", a: [w, 0], b: [w, h] },
  { kind: "line", a: [w, h], b: [0, h] },
  { kind: "line", a: [0, h], b: [0, 0] },
];

describe("gabarit de perçage 1:1", () => {
  it("une petite pièce tient sur une page ; un côté de caisson en demande plusieurs", () => {
    expect(tiling({ width: 100, height: 80 })).toEqual({ cols: 1, rows: 1 });
    expect(tiling({ width: 720, height: 560 })).toEqual({ cols: 5, rows: 3 });
  });

  it("un trou à sa vraie place et à sa vraie taille, avec sa croix et son diamètre", () => {
    const part: FlatPart = { name: "Tablette", thickness: 18, width: 100, height: 80, edges: [...rect(100, 80), { kind: "circle", center: [37, 37], radius: 2.5, depth: 12 }] };
    const [page, ...more] = drillTemplatePages(part, "Cuisine");
    expect(more).toEqual([]);
    // The part's corner is 8 mm into the area (10 mm margin, 22 mm header); y runs down.
    expect(page).toContain('<circle cx="55" cy="83" r="2.5"');
    expect(page).toContain(">Ø5 p12<");
    expect(page).toContain("page 1 / 1 (colonne 1, rangée 1)");
    expect(page).toContain('<line x1="100" y1="27" x2="200" y2="27"');
  });

  it("chaque page ne garde que son morceau de contour, et le recouvrement est repéré", () => {
    const part: FlatPart = { name: "Côté", thickness: 18, width: 300, height: 100, edges: rect(300, 100) };
    const pages = drillTemplatePages(part, "Dressing");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Pointillés : recouvrement");
    expect(pages[1]).not.toContain("Pointillés : recouvrement");
    expect(clipSegment([0, 0], [100, 0], [20, -5, 50, 5])).toEqual([[20, 0], [50, 0]]);
    expect(clipSegment([0, 10], [100, 10], [20, -5, 50, 5])).toBeNull();
    // As a PDF: one A4 page each.
    const pdf = sheetsPdf(pages, "Gabarits");
    expect(pdf).toContain("/Count 2");
    expect(pdf).toContain("/MediaBox [0 0 595.2756 841.8898]");
  });
});
