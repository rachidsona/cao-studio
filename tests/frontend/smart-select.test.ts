/** Sélections intelligentes de l'esquisse : tout, les semblables (même sorte, même taille), la chaîne. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { addCircle, addLine, addRectangle } from "../../frontend/src/sketcher/edit";
import { allCurves, chainCurves, similarCurves } from "../../frontend/src/sketcher/smart-select";

function drawing() {
  let g = addRectangle(emptySketchGeometry(), { at: [0, 0] }, { at: [600, 400] }).geometry;
  for (const x of [37, 69, 101]) g = addCircle(g, { at: [x, 37] }, 2.5).geometry;
  g = addCircle(g, { at: [300, 200] }, 17.5).geometry;
  g = addLine(g, { at: [0, 600] }, { at: [600, 600] }).geometry;
  return g;
}

describe("sélections intelligentes", () => {
  it("les semblables : les trous de Ø 5, pas le grand trou ; les lignes de 600", () => {
    const g = drawing();
    const small = g.curves.find((c) => c.kind === "circle" && c.radius === 2.5)!.id;
    expect(similarCurves(g, new Set([small]))).toHaveLength(3);
    const top = g.curves.find((c) => c.kind === "line")!.id;
    // Two sides of 600 and the free line of 600.
    expect(similarCurves(g, new Set([top]))).toHaveLength(3);
    expect(similarCurves(g, new Set())).toEqual([]);
  });

  it("la chaîne : un côté donne tout le rectangle ; tout le dessin", () => {
    const g = drawing();
    const side = g.curves.find((c) => c.kind === "line")!.id;
    expect(chainCurves(g, new Set([side]))).toHaveLength(4);
    expect(allCurves(g)).toHaveLength(g.curves.length);
  });
});
