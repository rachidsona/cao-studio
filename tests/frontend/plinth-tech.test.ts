/** Plinthe technique : grilles devant le réfrigérateur et les fours, tiroirs de plinthe sous les meubles bas, la plinthe entaillée. */
import { beforeAll, describe, expect, it } from "vitest";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { KITCHEN } from "../../frontend/src/features/kitchen-layout";
import { PLINTH_SLIDES, PLINTH_VENT, plinthTech, withPlinthTech } from "../../frontend/src/features/plinth-tech";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

function kitchen(): CadDocument {
  const base: CadDocument = { ...createReferencePlate(), features: [] };
  const plan = kitchenPlan(base, { ...KITCHEN, layout: "L", lengthA: 4000, lengthB: 3000, appliances: true, fridge: true, splashback: false, kick: true, corner: "unit" }, "lacquer-white", "solid-oak");
  return { ...base, features: plan.features, bodyInfo: plan.info };
}

describe("plinthe technique", () => {
  it("met une grille devant le réfrigérateur et le four, et des tiroirs sous les meubles bas libres", () => {
    const doc = kitchen();
    const { parts, replaced, notes } = plinthTech(doc, { vents: true, drawers: true });
    const vents = parts.filter((p) => p.item === PLINTH_VENT);
    expect(vents.length).toBeGreaterThanOrEqual(1);
    const fronts = parts.filter((p) => / — façade$/.test(p.name));
    expect(fronts.length).toBeGreaterThanOrEqual(1);
    expect(parts.filter((p) => p.item === PLINTH_SLIDES)).toHaveLength(fronts.length);
    // The plinths with drawers made again in pieces between them.
    expect(replaced.length).toBeGreaterThanOrEqual(1);
    expect(parts.filter((p) => / — morceau \d+$/.test(p.name)).length).toBe(replaced.reduce((n, r) => n + r.pieces, 0));
    expect(notes.join(" ")).toMatch(/tiroirs? de plinthe/);
    // Nothing asked: nothing made.
    expect(plinthTech(doc, { vents: false, drawers: false }).parts).toEqual([]);
  });

  it("se refait en une fois, construite par le noyau ; grilles et coulisses au devis", () => {
    const once = withPlinthTech(kitchen(), { vents: true, drawers: true }).doc;
    const twice = withPlinthTech(once, { vents: true, drawers: true }).doc;
    // Made again, not added twice; the plinths with drawers put aside.
    expect(twice.features.filter((f) => f.type === "trim" && f.plinthTech)).toHaveLength(1);
    expect(twice.features.filter((f) => /^Plinthe/.test(f.name) && f.suppressed).length).toBe(once.features.filter((f) => /^Plinthe/.test(f.name) && f.suppressed).length);
    expect(() => parseDocument(JSON.parse(JSON.stringify(twice)))).not.toThrow();
    const { statuses } = new Recomputer().recompute(twice);
    const failed = statuses.filter((s) => s.state !== "ok" && s.state !== "suppressed").map((s) => `${s.id} ${s.message ?? ""}`);
    expect(failed).toEqual([]);
    const hw = modelHardware(twice);
    expect(hw.find((h) => h.name === PLINTH_VENT)?.quantity).toBeGreaterThanOrEqual(1);
    expect(hw.find((h) => h.name === PLINTH_SLIDES)?.quantity).toBeGreaterThanOrEqual(1);
    // Taken away again: back to the plinths as they were.
    const none = withPlinthTech(twice, { vents: false, drawers: false }).doc;
    expect(none.features.some((f) => f.type === "trim" && f.plinthTech)).toBe(false);
    expect(none.features.filter((f) => /^Plinthe/.test(f.name) && f.suppressed)).toEqual([]);
  });
});
