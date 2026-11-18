/** Combiner : des corps réunis en un seul gardent l'aspect et la matière du corps cible, plus de bleu imposé. */
import { describe, expect, it } from "vitest";
import { withTargetLook } from "../../frontend/src/app/feature-tools";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";

const doc = (): CadDocument => {
  const plate = createReferencePlate();
  return { ...plate, features: [...plate.features, { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk1", distance: 5, operation: "new" }, { id: "cb1", type: "combine", name: "Combinaison 1", target: "h1", tools: ["ex2"], operation: "join" }] };
};

describe("corps réunis par Combiner", () => {
  it("le corps qu'ils font prend l'aspect et la matière de la cible ; rien quand elle n'en a pas ; le document se relit", () => {
    const base = doc();
    expect(withTargetLook(base, "cb1", "h1")).toBe(base);
    const looked: CadDocument = { ...base, bodyInfo: { h1: { material: "mdf-19", appearance: "lacquer-satin", color: "#ffffff", edges: { length1: true, length2: false, width1: false, width2: false } } } };
    const made = withTargetLook(looked, "cb1", "h1");
    expect(made.bodyInfo?.cb1).toEqual({ material: "mdf-19", appearance: "lacquer-satin", color: "#ffffff" });
    expect(made.bodyInfo?.cb1?.color).not.toBe("#2078CF");
    expect(validateDocument(made)).toEqual([]);
  });
});
