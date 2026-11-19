/** « Murs de la pièce » du Plan de cuisine : les murs cachés ou montrés, ceux de la pièce comme ceux que le plan dessine. */
import { describe, expect, it } from "vitest";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { kitchenWallsShown, withKitchenWalls } from "../../frontend/src/document/kitchen-walls";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const walls = (doc: CadDocument) => doc.features.filter((f) => f.name.startsWith("Mur ")).length;

describe("murs du plan de cuisine", () => {
  it("sans pièce : les murs que le plan dessine s'enlèvent et reviennent", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "L-left" });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [newItem([], "base-bas-1-porte", 600)] } });
    if (typeof built === "string") throw new Error(built);
    expect(walls(built.doc)).toBeGreaterThan(0);
    expect(kitchenWallsShown(built.doc, made.id)).toBe(true);
    const off = withKitchenWalls(built.doc, made.id, false);
    if (typeof off === "string") throw new Error(off);
    expect(walls(off)).toBe(0);
    expect(kitchenWallsShown(off, made.id)).toBe(false);
    const on = withKitchenWalls(off, made.id, true);
    if (typeof on === "string") throw new Error(on);
    expect(walls(on)).toBe(walls(built.doc));
    expect(() => parseDocument(on)).not.toThrow();
  });

  it("sur une pièce : ses murs cachés sans être supprimés, et remis même supprimés", () => {
    const room = { id: "pc1", type: "room", name: "Pièce 1", walls: [{ length: 3000, angle: 90 }, { length: 2500, angle: 90 }, { length: 3000, angle: 90 }, { length: 2500, angle: 90 }], height: 2500, thickness: 200, obstacles: [] };
    const plate = { ...createReferencePlate(), features: [room] } as unknown as CadDocument;
    const made = withKitchenPlan(plate, { ...KITCHEN_PLAN, model: "U", room: { id: "pc1", wall: 0 } });
    // The four walls deleted, as in the project where they were gone.
    const deleted: CadDocument = { ...made.doc, removedBodies: ["pc1#0", "pc1#1", "pc1#2", "pc1#3", "cb7#3"] };
    expect(kitchenWallsShown(deleted, made.id)).toBe(false);
    const back = withKitchenWalls(deleted, made.id, true) as CadDocument;
    expect(back.removedBodies).toEqual(["cb7#3"]);
    expect(kitchenWallsShown(back, made.id)).toBe(true);
    const hidden = withKitchenWalls(back, made.id, false) as CadDocument;
    expect(hidden.hiddenBodies).toEqual(["pc1#0", "pc1#1", "pc1#2", "pc1#3"]);
    expect(hidden.removedBodies).toEqual(["cb7#3"]);
    expect(kitchenWallsShown(hidden, made.id)).toBe(false);
  });
});
