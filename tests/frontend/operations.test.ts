import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson, sameDocument } from "../../frontend/src/document/canonical";
import { addHole, addPlate, deleteFeature, dependentsOf, latestBody } from "../../frontend/src/document/operations";
import { createReferencePlate } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { formatLength, fromDisplay, parseNumber, toDisplay } from "../../frontend/src/measurements/units";
import { gridStepFor } from "../../frontend/src/viewport/grid";
import { setupKernel } from "./kernel-setup";

describe("opérations sur l'historique", () => {
  beforeAll(setupKernel);

  it("ajoute un perçage enchaîné sur le dernier corps sans modifier l'original", () => {
    const doc = createReferencePlate();
    const next = addHole(doc, "h1", 20, 10, 6);
    expect(doc.features).toHaveLength(3);
    expect(next.features[3]).toMatchObject({ id: "h2", target: "h1", x: 20, y: 10, diameter: 6, name: "Perçage 2" });
    expect(latestBody(next, "ex1")).toBe("h2");
    expect(validateDocument(next)).toEqual([]);

    const recomputer = new Recomputer();
    const result = recomputer.recompute(next);
    expect(result.bodies).toEqual(["h2"]);
    const output = recomputer.output("h2");
    if (output?.kind !== "solid") throw new Error("solid expected");
    expect(bodyMetrics(output.shape).volume).toBeCloseTo(40000 - Math.PI * 250 - Math.PI * 90, 6);
    recomputer.dispose();
  });

  it("supprime un perçage intermédiaire en reliant les suivants au corps précédent", () => {
    const doc = addHole(createReferencePlate(), "h1", 20, 10);
    const next = deleteFeature(doc, "h1");
    expect(next.features.map((f) => f.id)).toEqual(["sk1", "ex1", "h2"]);
    expect(next.features[2]).toMatchObject({ target: "ex1" });
  });

  it("supprime en cascade les opérations qui dépendent d'une esquisse", () => {
    const doc = createReferencePlate();
    expect(dependentsOf(doc, "sk1")).toEqual(["ex1", "h1"]);
    expect(deleteFeature(doc, "sk1").features).toEqual([]);
  });

  it("ajoute une plaque comme nouveau corps indépendant", () => {
    const next = addPlate(createReferencePlate(), 30, 20, 5);
    expect(next.features.slice(3).map((f) => [f.id, f.type])).toEqual([
      ["sk2", "sketch"],
      ["ex2", "extrude"],
    ]);
    const recomputer = new Recomputer();
    expect(recomputer.recompute(next).bodies).toEqual(["h1", "ex2"]);
    recomputer.dispose();
  });
});

describe("unités et saisie", () => {
  it("convertit sans perte les unités d'affichage", () => {
    expect(fromDisplay(toDisplay(80, "in"), "in")).toBeCloseTo(80, 12);
    expect(toDisplay(25.4, "in")).toBe(1);
    expect(formatLength(1234.5, "m")).toBe("1,2345 m");
  });

  it("accepte la virgule décimale et refuse les saisies invalides", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" -3.25 ")).toBe(-3.25);
    expect(parseNumber("1e3")).toBe(1000);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("12mm")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("utilitaires", () => {
  it("compare les documents indépendamment de l'ordre des clés", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    const doc = createReferencePlate();
    const reordered = JSON.parse(canonicalJson(doc));
    expect(sameDocument(doc, reordered)).toBe(true);
  });

  it("adapte le pas de la grille au zoom", () => {
    expect(gridStepFor(200)).toBe(10);
    expect(gridStepFor(20)).toBe(1);
    expect(gridStepFor(2000)).toBe(100);
  });
});
