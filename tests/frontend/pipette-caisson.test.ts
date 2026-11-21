/** Pipette, Ctrl + clic : l'apparence va à tout le caisson du corps cliqué — ses panneaux, pas ses portes ni ses tiroirs. */
import { describe, expect, it } from "vitest";
import { caissonOf } from "../../frontend/src/app/pipette-tool";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

describe("pipette sur tout un caisson", () => {
  it("les panneaux de la Répartition du corps cliqué, sans ses portes ; un corps seul reste seul", () => {
    const doc = { ...createReferencePlate(), features: [
      { id: "sk1", type: "sketch", name: "Répartition", plane: "XZ", offset: 0, points: [], curves: [], constraints: [], offsets: [{ id: "of1", step: { kind: "partition" } }] },
      { id: "ex1", type: "extrude", name: "Côtés", sketch: "sk1", distance: 600, operation: "new" },
      { id: "ex2", type: "extrude", name: "Dessus", sketch: "sk1", distance: 600, operation: "new" },
      { id: "pn1", type: "niche", name: "Porte", sketch: "sk1", partition: "of1", niche: [0], fill: "door" },
      { id: "sk2", type: "sketch", name: "Croquis", plane: "XY", offset: 0, points: [], curves: [], constraints: [] },
      { id: "ex3", type: "extrude", name: "Planche", sketch: "sk2", distance: 18, operation: "new" },
    ] } as unknown as CadDocument;
    const shown = ["ex1#0", "ex1#1", "ex2", "pn1#0", "ex3"];
    expect(caissonOf(doc, "ex1#1", shown).sort()).toEqual(["ex1#0", "ex1#1", "ex2"]);
    expect(caissonOf(doc, "pn1#0", shown).sort()).toEqual(["ex1#0", "ex1#1", "ex2"]);
    expect(caissonOf(doc, "ex3", shown)).toEqual(["ex3"]);
  });
});
