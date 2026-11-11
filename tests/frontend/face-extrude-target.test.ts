/**
 * Une extrusion de faces sans son corps (un « Nouveau corps » choisi dans les propriétés l'effaçait) ne bloque plus
 * l'ouverture du projet : elle échoue seule au recalcul, et ses propriétés laissent rechoisir le corps.
 */
import { describe, expect, it } from "vitest";
import { validateDocument } from "../../frontend/src/document/validate";

const doc = (extra: Record<string, unknown>) => ({
  format: "cao-studio",
  schemaVersion: 2,
  units: "cm",
  parameters: {},
  features: [
    {
      id: "ex29", type: "extrude", name: "Extrusion 2", distance: 200, operation: "new",
      faces: [{ type: "PLANE", center: [2170, -970, 2485], rel: [0.68, 0, 0.5], normal: [0, -1, 0], area: 0 }],
      ...extra,
    },
  ],
});

describe("extrusion de faces sans son corps", () => {
  it("le projet s'ouvre encore", () => {
    expect(validateDocument(doc({}))).toEqual([]);
    expect(validateDocument(doc({ target: "ex3" }))).toEqual([]);
  });

  it("un corps qui n'est pas un nom reste refusé", () => {
    expect(validateDocument(doc({ target: 12 }))).toEqual(expect.arrayContaining([expect.stringContaining("corps des faces invalide")]));
  });
});
