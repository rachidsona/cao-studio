import { describe, expect, it } from "vitest";
import { centeredRectangle, emptySketchGeometry } from "../../frontend/src/document/sketch";
import {
  dimensionAnnotations,
  measureAnnotations,
  outwardNormal,
  previewAnnotations,
  specFor,
} from "../../frontend/src/sketcher/annotations";
import { addCircle, addConstraint } from "../../frontend/src/sketcher/edit";
import { dimensionLineDistance, matchingDimension, pairAnnotation, pairSpec, selectionSpec } from "../../frontend/src/sketcher/annotations";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { beforeAll } from "vitest";

describe("annotations de cotes", () => {
  it("place les cotes du rectangle à l'extérieur, valeurs dans l'unité d'affichage", () => {
    const g = centeredRectangle(2400, 1100);
    const dims = dimensionAnnotations(g, "cm");
    expect(dims.map((d) => d.text)).toEqual(["240", "110"]);
    const width = dims[0]?.shape;
    // l1 is the bottom edge: its dimension line goes down, away from the centre.
    expect(width?.kind === "linear" && width.normal).toEqual([0, -1]);
  });

  it("propose des mesures cliquables uniquement pour les éléments sans cote", () => {
    const g = centeredRectangle(80, 50);
    expect(measureAnnotations(g, ["l1", "l3"], "mm").map((m) => m.key)).toEqual(["measure:l3"]);
    const m = measureAnnotations(g, ["l3"], "mm")[0];
    expect(m?.spec).toEqual({ kind: "length", line: "l3" });
    expect(m?.text).toBe("80");
  });

  it("mesure un cercle par son diamètre", () => {
    const { geometry, created } = addCircle(emptySketchGeometry(), { at: [0, 0] }, 6);
    expect(specFor(geometry, created[0] as string)).toEqual({ kind: "diameter", curve: "k1" });
    expect(measureAnnotations(geometry, created, "mm")[0]?.text).toBe("Ø12");
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
    expect(previewAnnotations(preview, "mm").map((a) => a.text)).toEqual(["30", "20"]);
  });

  it("oriente la normale vers l'extérieur", () => {
    const [x1, y1] = outwardNormal([0, 0], [10, 0], [5, 5]);
    const [x2, y2] = outwardNormal([0, 0], [10, 0], [5, -5]);
    expect([x1 + 0, y1]).toEqual([0, -1]);
    expect([x2 + 0, y2]).toEqual([0, 1]);
  });
});

describe("cote entre deux éléments sélectionnés", () => {
  beforeAll(() => initSolver());

  it("mesure la distance entre deux lignes parallèles", () => {
    const g = centeredRectangle(80, 50);
    expect(pairSpec(g, ["l1", "l3"])).toEqual({ kind: "pointLineDistance", point: "p1", line: "l3", label: "Distance entre lignes" });
    expect(pairAnnotation(g, ["l1", "l3"], "mm")?.text).toBe("50");
  });

  it("mesure l'angle entre deux lignes non parallèles", () => {
    const g = centeredRectangle(80, 50);
    const a = pairAnnotation(g, ["l1", "l2"], "mm");
    expect(a?.spec).toEqual({ kind: "angle", a: "l1", b: "l2" });
    expect(a?.angle).toBe(true);
    expect(Math.abs(a?.value ?? 0)).toBeCloseTo(90, 9);
  });

  it("mesure l'entraxe de deux cercles et la distance cercle–ligne", () => {
    let g = centeredRectangle(80, 50);
    g = addCircle(g, { at: [10, 0] }, 3).geometry;
    g = addCircle(g, { at: [-20, 0] }, 3).geometry;
    expect(pairAnnotation(g, ["k1", "k2"], "mm")?.text).toBe("30");
    expect(pairSpec(g, ["l1", "k1"])).toMatchObject({ kind: "pointLineDistance", line: "l1" });
  });

  it("pilote la distance entre deux lignes une fois la cote posée", () => {
    const g = centeredRectangle(80, 50);
    g.constraints = g.constraints.filter((c) => c.id !== "d2");
    const spec = pairSpec(g, ["l1", "l3"]);
    const withDim = addConstraint(g, { ...spec, value: 70 } as never).geometry;
    const solved = solveSketch(withDim);
    expect(solved.state).toBe("ok");
    const p1 = solved.geometry.points.find((p) => p.id === "p1");
    const p4 = solved.geometry.points.find((p) => p.id === "p4");
    expect(Math.abs((p4?.y ?? 0) - (p1?.y ?? 0))).toBeCloseTo(70, 6);
    // Once dimensioned, the relation is shown by the dimension itself, not as a measurement.
    expect(pairAnnotation(withDim, ["l1", "l3"], "mm")).toBeNull();
  });
});

describe("pose d'une cote depuis la sélection", () => {
  it("décrit la cote d'un élément seul ou d'une paire", () => {
    const g = centeredRectangle(80, 50);
    expect(selectionSpec(g, ["l1"])).toEqual({ kind: "length", line: "l1" });
    expect(selectionSpec(g, ["l1", "l2"])).toEqual({ kind: "angle", a: "l1", b: "l2" });
    expect(selectionSpec(g, ["p1"])).toBeNull();
  });

  it("retrouve une cote déjà posée pour ne pas la dupliquer", () => {
    const g = centeredRectangle(80, 50);
    expect(matchingDimension(g, { kind: "length", line: "l1" } as never)?.id).toBe("d1");
    const spec = pairSpec(g, ["l1", "l3"]);
    expect(spec && matchingDimension(g, spec)).toBeUndefined();
    const withDim = addConstraint(g, { ...spec, value: 50 } as never).geometry;
    expect(spec && matchingDimension(withDim, spec)?.kind).toBe("pointLineDistance");
  });
});

describe("traits de cote cliquables", () => {
  it("détecte un clic sur la ligne de cote et sur ses lignes d'attache", () => {
    const g = centeredRectangle(80, 50);
    const [width] = dimensionAnnotations(g, "mm"); // l1 (bottom, y = -25), drawn below
    if (!width) throw new Error("annotation attendue");
    const px = 0.1; // 1 pixel = 0.1 mm → default offset 3 mm
    expect(dimensionLineDistance(width, [0, -28], px)).toBeCloseTo(0, 6); // on the dimension line
    expect(dimensionLineDistance(width, [-40, -27], px)).toBeCloseTo(0, 6); // on an extension line
    expect(dimensionLineDistance(width, [0, 0], px)).toBeGreaterThan(20); // centre of the part
  });

  it("dessine la ligne de cote à la position mémorisée", () => {
    const g = centeredRectangle(80, 50);
    g.constraints = g.constraints.map((c) => (c.id === "d1" ? { ...c, offset: 10 } : c));
    const [width] = dimensionAnnotations(g, "mm");
    if (!width) throw new Error("annotation attendue");
    expect(dimensionLineDistance(width, [0, -35], 0.1)).toBeCloseTo(0, 6);
  });
});
