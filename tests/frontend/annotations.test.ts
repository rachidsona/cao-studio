import { describe, expect, it } from "vitest";
import { centeredRectangle, emptySketchGeometry } from "../../frontend/src/document/sketch";
import {
  dimensionAnnotations,
  measureAnnotations,
  outwardNormal,
  previewAnnotations,
  specFor,
} from "../../frontend/src/sketcher/annotations";
import { addCircle } from "../../frontend/src/sketcher/edit";

describe("annotations de cotes", () => {
  it("place les cotes du rectangle à l'extérieur, valeurs dans l'unité d'affichage", () => {
    const g = centeredRectangle(2400, 1100);
    const dims = dimensionAnnotations(g, "cm");
    expect(dims.map((d) => d.text)).toEqual(["240 cm", "110 cm"]);
    const width = dims[0]?.shape;
    // l1 is the bottom edge: its dimension line goes down, away from the centre.
    expect(width?.kind === "linear" && width.normal).toEqual([0, -1]);
  });

  it("propose des mesures cliquables uniquement pour les éléments sans cote", () => {
    const g = centeredRectangle(80, 50);
    expect(measureAnnotations(g, ["l1", "l3"], "mm").map((m) => m.key)).toEqual(["measure:l3"]);
    const m = measureAnnotations(g, ["l3"], "mm")[0];
    expect(m?.spec).toEqual({ kind: "length", line: "l3" });
    expect(m?.text).toBe("80 mm");
  });

  it("mesure un cercle par son diamètre", () => {
    const { geometry, created } = addCircle(emptySketchGeometry(), { at: [0, 0] }, 6);
    expect(specFor(geometry, created[0] as string)).toEqual({ kind: "diameter", curve: "k1" });
    expect(measureAnnotations(geometry, created, "mm")[0]?.text).toBe("Ø 12 mm");
  });

  it("affiche largeur et hauteur pendant le tracé d'un rectangle", () => {
    const preview = {
      lines: [
        [[0, 0], [30, 0]],
        [[30, 0], [30, 20]],
        [[30, 20], [0, 20]],
        [[0, 20], [0, 0]],
      ] as [[number, number], [number, number]][],
      circles: [],
      arcs: [],
    };
    expect(previewAnnotations(preview, "mm").map((a) => a.text)).toEqual(["30 mm", "20 mm"]);
  });

  it("oriente la normale vers l'extérieur", () => {
    const [x1, y1] = outwardNormal([0, 0], [10, 0], [5, 5]);
    const [x2, y2] = outwardNormal([0, 0], [10, 0], [5, -5]);
    expect([x1 + 0, y1]).toEqual([0, -1]);
    expect([x2 + 0, y2]).toEqual([0, 1]);
  });
});
