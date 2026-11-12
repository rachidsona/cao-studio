/** Combiner : des corps réunis en un seul prennent le bleu #2078CF (une laque satinée), le corps qu'ils font compris. */
import { describe, expect, it } from "vitest";
import { bodyAppearance, setBodyAppearance } from "../../frontend/src/appearance/assign";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";

describe("corps réunis par Combiner", () => {
  it("le corps qu'ils font est bleu #2078CF, une laque satinée ; le document se relit", () => {
    const plate = createReferencePlate();
    const doc: CadDocument = { ...plate, features: [...plate.features, { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk1", distance: 5, operation: "new" }, { id: "cb1", type: "combine", name: "Combinaison 1", target: "h1", tools: ["ex2"], operation: "join" }] };
    const painted = setBodyAppearance(doc, ["cb1"], "lacquer-satin", "#2078CF");
    expect(bodyAppearance(painted, "cb1", undefined)).toMatchObject({ appearance: { id: "lacquer-satin", paintable: true }, color: "#2078CF" });
    expect(validateDocument(painted)).toEqual([]);
  });
});
