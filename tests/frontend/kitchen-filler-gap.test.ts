/** Le fileur que le plan met dans un reste, cliqué sur la bande : un fileur posé, à sa place, qui se règle comme un meuble. */
import { describe, expect, it } from "vitest";
import { fillerFromGap } from "../../frontend/src/app/kitchen/kitchen-run-fillers";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { FILLER, newItem } from "../../frontend/src/features/kitchen-run-items";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
const plan = (B: KitchenRunItem[]): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "U", lengthA: 3000, lengthB: 2500, lengthC: 2500, rest: { B: "start" }, runs: { B } });
const where = (p: KitchenFloorPlan) => (kitchenFromPlan(p).fills.B?.placed ?? []).filter((pl) => pl.row === "base").map((pl) => [pl.item.model, Math.round(pl.at), Math.round(pl.item.width)]);

describe("fileur d'un reste choisi sur la bande", () => {
  it("devient un fileur posé à sa place : rien ne bouge, et il se déplace ou s'ôte comme un meuble", () => {
    // Two columns from the start, a base unit pushed to the corner: the 71 mm left between them closed by a filler.
    const items = units([["tall-colonne-rangement", 600], ["tall-colonne-rangement", 600], ["base-bas-3-tiroirs", 600]]);
    const fill = kitchenFromPlan(plan(items)).fills.B!;
    expect(fill.fillers.map(([a, b]) => Math.round(b - a))).toEqual([71]);
    const made = fillerFromGap(items, fill, fill.fillers[0]!);
    expect(made.items.map((i) => i.model)).toEqual(["tall-colonne-rangement", "tall-colonne-rangement", FILLER, "base-bas-3-tiroirs"]);
    expect(made.items.find((i) => i.id === made.id)?.width).toBe(71);
    // In its place: the units where they were, no filler left to the plan.
    const after = kitchenFromPlan(plan(made.items)).fills.B!;
    expect(after.fillers).toEqual([]);
    expect(where(plan(made.items))).toEqual([["tall-colonne-rangement", 0, 600], ["tall-colonne-rangement", 600, 600], [FILLER, 1200, 71], ["base-bas-3-tiroirs", 1271, 600]]);
  });
});
