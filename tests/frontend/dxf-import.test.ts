/** Importer un plan DXF dans l'esquisse : entités lues, unité, arrondis des polylignes, points partagés. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { bulgeArc, parseDxf, shapesBox } from "../../frontend/src/io/dxf-import";
import { addShapes } from "../../frontend/src/sketcher/import-shapes";

const dxf = (units: number | null, entities: string[]) =>
  [
    ...(units === null ? [] : ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", String(units), "0", "ENDSEC"]),
    "0", "SECTION", "2", "ENTITIES", ...entities, "0", "ENDSEC", "0", "EOF",
  ].join("\r\n");

describe("import DXF", () => {
  it("lit lignes, cercles et arcs, dans l'unité du fichier ramenée en mm, et compte ce qu'il laisse", () => {
    const read = parseDxf(dxf(5, [
      "0", "LINE", "8", "MURS", "10", "0", "20", "0", "11", "300", "21", "0",
      "0", "CIRCLE", "10", "100", "20", "50", "40", "10",
      "0", "ARC", "10", "0", "20", "0", "40", "20", "50", "0", "51", "90",
      "0", "TEXT", "1", "Cuisine",
    ]));
    expect(read.unitName).toBe("cm");
    expect(read.shapes[0]).toEqual({ kind: "line", a: [0, 0], b: [3000, 0] });
    expect(read.shapes[1]).toEqual({ kind: "circle", center: [1000, 500], radius: 100 });
    expect(read.shapes[2]).toMatchObject({ kind: "arc", radius: 200, start: 0 });
    expect(read.shapes[2]!.kind === "arc" && read.shapes[2]!.end).toBeCloseTo(Math.PI / 2);
    expect(read.skipped).toEqual({ TEXT: 1 });
    expect(parseDxf(dxf(null, [])).unitName).toContain("mm");
  });

  it("ferme une polyligne et en tire les arcs de ses arrondis", () => {
    // A 1000 × 500 rectangle whose top edge is rounded (bulge −1 : half a circle, turning clockwise).
    const read = parseDxf(dxf(4, [
      "0", "LWPOLYLINE", "90", "4", "70", "1",
      "10", "0", "20", "0", "10", "1000", "20", "0", "10", "1000", "20", "500", "42", "1", "10", "0", "20", "500",
    ]));
    expect(read.shapes.map((s) => s.kind)).toEqual(["line", "line", "arc", "line"]);
    expect(shapesBox(read.shapes)).toEqual([[0, 0], [1000, 1000]]);
    // A positive bulge goes counter-clockwise: a half circle of radius 500 around (500, 500), above the chord here.
    expect(bulgeArc([1000, 500], [0, 500], 1)).toMatchObject({ kind: "arc", center: [500, 500], radius: 500 });
  });

  it("met les traits dans l'esquisse, les bouts communs devenant un seul point", () => {
    const read = parseDxf(dxf(4, [
      "0", "LWPOLYLINE", "90", "4", "70", "1", "10", "10", "20", "20", "10", "110", "20", "20", "10", "110", "20", "70", "10", "10", "20", "70",
    ]));
    const ref = addShapes(emptySketchGeometry(), read.shapes, { reference: true, shift: [-10, -20] });
    expect(ref.points).toHaveLength(4);
    expect(ref.curves).toHaveLength(4);
    expect(ref.points.every((p) => p.fixed)).toBe(true);
    expect(ref.curves.every((c) => c.construction)).toBe(true);
    expect(ref.points.map((p) => [p.x, p.y])).toEqual([[0, 0], [100, 0], [100, 50], [0, 50]]);
    const drawn = addShapes(emptySketchGeometry(), read.shapes, { reference: false, shift: [0, 0] });
    expect(drawn.curves.some((c) => c.construction)).toBe(false);
  });
});
