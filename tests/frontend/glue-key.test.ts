/** Coller par face, « le meuble entier » : une Répartition bouge avec tous ses panneaux, un caisson avec ses façades. */
import { describe, expect, it } from "vitest";
import { glueKey } from "../../frontend/src/app/face-glue-tool";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

describe("le meuble entier collé par face", () => {
  it("une Répartition : tous ses panneaux (côtés, dessus, étagères) et ses portes ; un caisson avec ses façades ; un corps seul", () => {
    const doc = { ...createReferencePlate(), features: [
      { id: "sk1", type: "sketch", name: "Plan — mur c", plane: "XZ", offset: 0, points: [], curves: [], constraints: [], offsets: [{ id: "of1", step: { kind: "partition" } }] },
      { id: "ex1", type: "extrude", name: "Côtés", sketch: "sk1", distance: 600, operation: "new" },
      { id: "ex2", type: "extrude", name: "Étagères", sketch: "sk1", distance: 600, operation: "new" },
      { id: "pn1", type: "niche", name: "Porte", sketch: "sk1", partition: "of1", niche: [0], fill: "door" },
      { id: "cb1", type: "cabinet", name: "Caisson" },
      { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1" },
      { id: "sk2", type: "sketch", name: "Croquis", plane: "XY", offset: 0, points: [], curves: [], constraints: [] },
      { id: "ex3", type: "extrude", name: "Planche", sketch: "sk2", distance: 18, operation: "new" },
    ] } as unknown as CadDocument;
    expect(["ex1#0", "ex2#3", "pn1#0"].map((b) => glueKey(doc, b))).toEqual(["sk1", "sk1", "sk1"]);
    expect(["cb1#2", "fr1#0"].map((b) => glueKey(doc, b))).toEqual(["cb1", "cb1"]);
    expect(glueKey(doc, "ex3")).toBe("ex3");
  });
});
