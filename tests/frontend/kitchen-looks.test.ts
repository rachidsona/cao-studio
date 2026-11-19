/** Une cuisine refaite par son plan garde les apparences posées à la main sur ses pièces. */
import { describe, expect, it } from "vitest";
import { setBodyAppearance } from "../../frontend/src/appearance/assign";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { bodyInfo } from "../../frontend/src/document/materials";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const empty = () => ({ ...createReferencePlate(), features: [] }) as unknown as CadDocument;

describe("apparences d'une cuisine refaite", () => {
  it("la porte peinte à la main le reste ; l'aspect des plinthes choisi dans le plan change toujours", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I" });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [{ ...newItem([], "base-bas-1-porte", 600), id: "u1" }] }, kickLook: "dekton-sirius" });
    if (typeof built === "string") throw new Error(built);
    const fronts = (doc: CadDocument) => doc.features.find((f) => f.type === "fronts")!.id;
    const kick = (doc: CadDocument) => doc.features.find((f) => f.name === "Plinthe A")!.id;
    const painted = setBodyAppearance(built.doc, [`${fronts(built.doc)}#0`], "ral-5014", "#123456");
    // Made again: its plinth set back, the plinths in another look.
    const again = withKitchenBuilt(painted, made.id, { kickSetback: { A: 80 }, kickLook: "wood-oak" });
    if (typeof again === "string") throw new Error(again);
    expect(kitchenPlanIn(again.doc, made.id)!.kickSetback).toEqual({ A: 80 });
    expect(bodyInfo(again.doc, `${fronts(again.doc)}#0`)).toMatchObject({ appearance: "ral-5014", color: "#123456" });
    // A board made by the plan keeps its look under its own id.
    expect(again.doc.bodyInfo?.[kick(again.doc)]?.appearance).toBe("wood-oak");
  });
});
