/** Les cotes d'un linéaire vu seul : la chaîne des largeurs en bas, celle des hauts, la longueur du mur, les hauteurs. */
import { describe, expect, it } from "vitest";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";
import { runDims } from "../../frontend/src/document/kitchen-run-dims";
import type { KitchenFloorPlan } from "../../frontend/src/document/types";

describe("cotes d'un linéaire de cuisine", () => {
  it("en bas, la chaîne couvre le mur d'un bout à l'autre, sans se chevaucher ; en haut, les hauts ; à gauche, les hauteurs", () => {
    const base: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "L-left", lengthA: 3600, corners: { left: "unit" }, wallCorners: { left: "unit" } };
    const p = { ...base, ...proposeKitchen(base) };
    const run = kitchenRuns(p).find((r) => r.id === "A")!;
    const g = runGeometry(p, run);
    const dims = runDims(p, run, g, kitchenFromPlan(p).fills.A!);
    const low = dims.filter((d) => d.axis === "u" && d.at === -150).sort((a, b) => a.a - b.a);
    expect(low[0]!.a).toBe(0);
    expect(low.at(-1)!.b).toBeCloseTo(3600, 3);
    for (let i = 1; i < low.length; i++) expect(low[i]!.a).toBeCloseTo(low[i - 1]!.b, 3);
    expect(dims.find((d) => d.at === -330)).toEqual({ axis: "u", a: 0, b: 3600, at: -330, edit: { kind: "plan", key: "lengthA" } });
    const s = kitchenSizes(p);
    expect(dims.filter((d) => d.axis === "u" && d.at === s.wallTop + 150).length).toBeGreaterThan(2);
    expect(dims.filter((d) => d.axis === "z").map((d) => [d.a, d.b])).toEqual([[0, p.worktopHeight], [s.wallBottom, s.wallTop], [0, p.height]]);
  });
});
