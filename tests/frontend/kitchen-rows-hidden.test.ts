/** « Cacher » une rangée de la cuisine dans la 3D : ce que le plan fait, rangé en hauts, casquette et plan de travail. */
import { describe, expect, it } from "vitest";
import { planRows } from "../../frontend/src/app/kitchen/kitchen-rows-hidden";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const empty = () => ({ ...createReferencePlate(), features: [] }) as unknown as CadDocument;

describe("rangées de la cuisine à cacher", () => {
  it("un haut, son caisson de casquette et le plan de travail ont chacun leur rangée ; le bas aucune", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I" });
    const built = withKitchenBuilt(made.doc, made.id, { cap: "units", runs: { A: [{ ...newItem([], "base-bas-1-porte", 600), id: "u1" }, { ...newItem([], "wall-haut-1-porte", 600), id: "u2" }] } });
    if (typeof built === "string") throw new Error(built);
    const rows = planRows(built.doc, made.id);
    const named = (row: string) => [...rows].filter(([, r]) => r === row).map(([n]) => n);
    expect(named("wall").some((n) => /^Haut/.test(n))).toBe(true);
    expect(named("cap").some((n) => /^Casquette/.test(n))).toBe(true);
    expect(named("worktop").length).toBeGreaterThan(0);
    expect([...rows.keys()].some((n) => /^Bas/.test(n))).toBe(false);
  });
});
