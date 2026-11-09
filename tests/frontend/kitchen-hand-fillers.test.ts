/** Des fileurs posés à la main sur un linéaire, en bas et en haut : des panneaux à leur largeur, sans caisson. */
import { describe, expect, it } from "vitest";
import { withRunDim } from "../../frontend/src/document/kitchen-dim-edit";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CadDocument, type KitchenFloorPlan, type KitchenRunItem } from "../../frontend/src/document/types";
import { FILLER, FILLER_WALL, newItem } from "../../frontend/src/features/kitchen-run-items";

const list = (...models: [string, number][]): KitchenRunItem[] => models.reduce<KitchenRunItem[]>((all, [m, w]) => [...all, newItem(all, m, w)], []);
const plan = (items: KitchenRunItem[]): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA: 2000, runs: { A: items } });

describe("fileurs posés à la main", () => {
  it("prennent leur place sur la rangée comme un meuble, et se bâtissent en panneaux, en bas et en haut", () => {
    const items = list([FILLER, 50], ["base-bas-1-porte", 600], [FILLER_WALL, 40], ["wall-haut-1-porte", 600]);
    const p = plan(items);
    const layout = kitchenFromPlan(p);
    const fill = layout.fills.A!;
    expect(fill.placed.map((pl) => [pl.item.model, pl.row, pl.at])).toEqual([[FILLER, "base", 0], ["base-bas-1-porte", "base", 50], [FILLER_WALL, "wall", 0], ["wall-haut-1-porte", "wall", 40]]);
    const s = kitchenSizes(p);
    const low = layout.boxes.find((b) => b.name === "Fileur posé A1")!;
    const high = layout.boxes.find((b) => b.name === "Fileur posé haut A2")!;
    expect([low.kind, low.from[2], low.to[2]]).toEqual(["filler", s.plinth, s.base]);
    expect([high.kind, high.from[2], high.to[2]]).toEqual(["filler", s.wallBottom, s.wallTop]);
    // No cabinet for them; the units keep their own.
    expect(layout.units.map((u) => u.name)).toEqual(["Bas 1 porte 600 (A1)", "Haut 1 porte 600 (A2)"]);
  });

  it("leur largeur se tape sur la cote, de 1 à 30 cm", () => {
    const items = list([FILLER, 50], ["base-bas-1-porte", 600]);
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...plan(items), made: {} });
    const made = withKitchenBuilt(base.doc, base.id);
    if (typeof made === "string") throw new Error(made);
    const wider = withRunDim(made.doc, base.id, "A", { kind: "item", item: items[0]!.id }, 80);
    if (typeof wider === "string") throw new Error(wider);
    expect(kitchenPlanIn(wider, base.id)!.runs!.A![0]!.width).toBe(80);
    expect(withRunDim(made.doc, base.id, "A", { kind: "item", item: items[0]!.id }, 500)).toBe("Une largeur va de 1 cm à 30 cm.");
  });
});
