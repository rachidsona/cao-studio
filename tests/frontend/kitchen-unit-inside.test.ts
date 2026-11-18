/** « Façades et intérieur » d'un meuble du linéaire : ses choix par-dessus ceux de son modèle, et les cloisons d'un caisson. */
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { syncKitchenPlans } from "../../frontend/src/document/kitchen-sync";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenRunItem } from "../../frontend/src/document/types";
import { cabinetParts, cabinetProblem } from "../../frontend/src/features/cabinet-parts";
import { frontsProblem } from "../../frontend/src/features/fronts-parts";
import { hasInside, itemEntry, modelOf, newItem } from "../../frontend/src/features/kitchen-run-items";

const entry = (id: string) => CATALOG.find((e) => e.id === id)!;
const item = (id: string, more: Partial<KitchenRunItem> = {}): KitchenRunItem => ({ ...newItem([], modelOf(entry(id)), entry(id).width), ...more });
const cabinet = (more: Partial<CabinetFeature> = {}): CabinetFeature => ({ id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 800, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through", ...more });

describe("façades et intérieur d'un meuble de cuisine", () => {
  it("un caisson à cloisons : des montants également espacés, les étagères recoupées case par case, les autres pièces à leur numéro", () => {
    const plain = cabinetParts(cabinet()).map((p) => p.name);
    const parts = cabinetParts(cabinet({ dividers: 2 }));
    expect(parts.map((p) => p.name)).toEqual([...plain.filter((n) => !n.startsWith("Étagère")), "Étagère 1", "Étagère 2", "Étagère 3", "Cloison 1", "Cloison 2"]);
    // Three bays of the same width between the sides: (800 − 2 × 18 − 2 × 18) / 3.
    const shelves = parts.filter((p) => p.name.startsWith("Étagère"));
    expect(shelves.map((p) => Math.round((p.to[0] - p.from[0]) * 10) / 10)).toEqual([242.7, 242.7, 242.7]);
    const upright = parts.find((p) => p.name === "Cloison 1")!;
    expect([upright.from[2], upright.to[2]]).toEqual([168, 852]);
    expect(Math.round(upright.from[0] * 10) / 10).toBe(260.7);
    expect(cabinetProblem(cabinet({ width: 300, dividers: 3 }))).toMatch(/trop étroit pour 3 cloisons/);
    expect(cabinetProblem(cabinet({ dividers: 9 }))).toMatch(/0 à 6 cloisons/);
  });

  it("les choix du meuble passent avant ceux de son modèle ; des tiroirs ne gardent ni étagère ni cloison", () => {
    const door = item("base-bas-1-porte-600");
    expect(itemEntry(door)).toBe(entry("base-bas-1-porte-600"));
    expect(itemEntry({ ...door, shelves: 3, dividers: 1 })).toMatchObject({ layout: "door", shelves: 3, dividers: 1 });
    expect(itemEntry({ ...door, layout: "drawers", drawers: 4, shelves: 3, dividers: 1 })).toMatchObject({ layout: "drawers", drawers: 4, shelves: 0 });
    expect(itemEntry({ ...door, layout: "drawers", dividers: 1 }).dividers).toBeUndefined();
    expect(itemEntry({ ...door, layout: "none" })).toMatchObject({ layout: "none", shelves: 1 });
    // A drawer over the doors, or none where the model has one; English drawers; none of them with upright boards.
    expect(itemEntry({ ...door, topDrawer: 150, innerDrawers: 2 })).toMatchObject({ topDrawer: 150, innerDrawers: 2 });
    expect(itemEntry(item("base-bas-tiroir-et-porte-600", { topDrawer: 0 })).topDrawer).toBeUndefined();
    expect(itemEntry({ ...door, topDrawer: 150, dividers: 1 }).topDrawer).toBeUndefined();
    // A lift-up unit given a drawer over its door: no longer hinged along its top.
    expect(itemEntry(item("wall-haut-relevant-800")).side).toBe("top");
    expect(itemEntry(item("wall-haut-relevant-800", { layout: "doors" })).side).toBeUndefined();
    // Nothing to set on a filler, a dishwasher, a rounded end.
    expect([item("base-bas-1-porte-600"), { ...door, model: "filler" }, { ...door, model: "app-dishwasher" }, item("base-bas-terminal-arrondi-400"), { ...door, model: "app-sink" }].map(hasInside)).toEqual([true, false, false, false, true]);
  });

  it("le plan bâtit le meuble avec ses choix, et la 3D ne les réécrit pas", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 3000 });
    let items: KitchenRunItem[] = [];
    items = [...items, { ...newItem(items, "base-bas-2-portes", 800), shelves: 2, dividers: 1 }];
    items = [...items, { ...newItem(items, "base-bas-1-porte", 600), layout: "drawers", drawers: 4 }];
    items = [...items, { ...newItem(items, "base-bas-2-portes", 900), topDrawer: 150, innerDrawers: 2 }];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doc: CadDocument = built.doc;
    const cab = (start: string) => doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith(start))!;
    const fronts = (c: CabinetFeature) => doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === c.id)!;
    expect(cab("Bas 2 portes 800")).toMatchObject({ shelves: 2, dividers: 1 });
    expect(fronts(cab("Bas 1 porte 600"))).toMatchObject({ layout: "drawers", drawers: 4 });
    expect(cab("Bas 1 porte 600").shelves).toBe(0);
    expect(fronts(cab("Bas 2 portes 900"))).toMatchObject({ layout: "doors", topDrawer: 150, innerDrawers: 2 });
    for (const c of [cab("Bas 2 portes 800"), cab("Bas 1 porte 600"), cab("Bas 2 portes 900")]) expect(frontsProblem(fronts(c), c)).toBeNull();
    expect(syncKitchenPlans(doc, doc)).toBe(doc);
    expect(kitchenPlanIn(doc, made.id)!.runs!.A![0]).toMatchObject({ shelves: 2, dividers: 1 });
    // Drawers asked in a caisson with upright boards: refused, with the way out.
    expect(frontsProblem({ ...fronts(cab("Bas 2 portes 800")), layout: "drawers" }, cab("Bas 2 portes 800"))).toMatch(/à travers les cloisons/);
  });
});
