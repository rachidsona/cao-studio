/** Plinthe reculée de 6 cm : les côtés des caissons entaillés au socle pour la laisser passer. */
import { describe, expect, it } from "vitest";
import { kickNotch, stampKickNotches } from "../../frontend/src/document/kick-notches";
import { KICK_BACK, kickOf } from "../../frontend/src/document/kitchen-corners";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const empty = () => ({ ...createReferencePlate(), features: [] }) as unknown as CadDocument;

describe("plinthe reculée", () => {
  it("recule de 6 cm sans réglage, et les côtés des caissons sont entaillés pour elle", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I" });
    const unit = { ...newItem([], "base-bas-3-tiroirs", 600), id: "u1" };
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [unit] } });
    if (typeof built === "string") throw new Error(built);
    const plan = kitchenPlanIn(built.doc, made.id)!;
    expect(kickOf(plan, "A")).toEqual({ on: true, back: KICK_BACK.default });
    expect(KICK_BACK.default).toBe(60);
    const cabinet = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.plinth > 0)!;
    // 60 mm back from the fronts, a 16 mm board, the fronts 19 mm in front of the cabinet: 57 mm into the sides.
    expect(kickNotch(built.doc, cabinet)).toEqual({ z0: -1, z1: cabinet.plinth, depth: 57 });
    const stamped = stampKickNotches(built.doc).features.find((f) => f.id === cabinet.id) as CabinetFeature;
    expect(stamped.notches).toEqual([{ z0: -1, z1: cabinet.plinth, depth: 57 }]);
    // Flush with the fronts, or no plinth: no notch.
    const flush = withKitchenBuilt(built.doc, made.id, { kickSetback: { A: 0 } });
    if (typeof flush === "string") throw new Error(flush);
    expect(kickNotch(flush.doc, flush.doc.features.find((f): f is CabinetFeature => f.id === cabinet.id)!)).toBeNull();
    const none = withKitchenBuilt(built.doc, made.id, { noKick: { A: true } });
    if (typeof none === "string") throw new Error(none);
    expect(kickNotch(none.doc, none.doc.features.find((f): f is CabinetFeature => f.id === cabinet.id)!)).toBeNull();
  });
});
