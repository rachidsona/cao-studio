/** Plinthe reculée de 6 cm : les côtés des caissons entaillés au socle pour la laisser passer. */
import { beforeAll, describe, expect, it } from "vitest";
import { withCabinetFurnished } from "../../frontend/src/document/cabinet-furnish";
import { caissonKickNotches, kickNotch, stampKickNotches } from "../../frontend/src/document/kick-notches";
import { KICK_BACK, kickOf } from "../../frontend/src/document/kitchen-corners";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

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

  it("un caisson aménagé (Répartition) garde ses côtés jusqu'au sol, entaillés de même pour la plinthe de son linéaire", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I", noWalls: true });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [{ ...newItem([], "base-bas-2-portes", 800), id: "u1" }] } });
    if (typeof built === "string") throw new Error(built);
    const cabinet = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const turned = withCabinetFurnished(built.doc, cabinet.id);
    if (typeof turned === "string") throw new Error(turned);
    // Across the caisson (0 to 800 along the wall), from its front (58 cm from the wall) 57 mm back, up to the plinth's top.
    const notch = caissonKickNotches(turned.doc).get(turned.sketch)!;
    expect(notch.map((v) => v.map(Math.round))).toEqual([[-1, -581, -1], [801, -523, cabinet.plinth]]);
    const stamped = stampKickNotches(turned.doc);
    const sides = stamped.features.filter((f) => f.type === "extrude" && f.sketch === turned.sketch && /^Côté/.test(f.name));
    expect(sides).toHaveLength(2);
    expect(sides.every((f) => f.type === "extrude" && !!f.notch)).toBe(true);
    // Nothing else is cut, and nothing is written in the document itself.
    expect(stamped.features.filter((f) => f.type === "extrude" && f.notch)).toHaveLength(2);
    expect(turned.doc.features.some((f) => f.type === "extrude" && f.notch)).toBe(false);
    // In the kernel: each side down to the floor, less its notch (18 × 57 × 150 mm).
    const volume = (doc: CadDocument) => {
      const r = new Recomputer();
      r.recompute(doc);
      const out = r.output(sides[0]!.id);
      if (out?.kind !== "solid") throw new Error("no side");
      const m = bodyMetrics(out.shape);
      expect(m.bbox[0][2]).toBeCloseTo(0, 3);
      return m.volume;
    };
    expect(volume(turned.doc) - volume(stamped)).toBeCloseTo(18 * 57 * cabinet.plinth, 0);
    // No plinth on the run: no notch.
    const none = withKitchenBuilt(turned.doc, made.id, { noKick: { A: true } });
    if (typeof none === "string") throw new Error(none);
    expect(caissonKickNotches(none.doc).size).toBe(0);
  });
});
