/** Toutes les portes des caissons de cuisine sont leurs façades (outil Façades) : colonne four, porte d'angle de l'Implantation. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { frontsParts } from "../../frontend/src/features/fronts-parts";
import { KITCHEN } from "../../frontend/src/features/kitchen-layout";
import { newItem, surroundFridge } from "../../frontend/src/features/kitchen-run-items";
import { turnedBox } from "../../frontend/src/features/turn-clear";

/** A cabinet's door, as it stands in the model. */
const doorOf = (fr: FrontsFeature, cab: CabinetFeature) => {
  const part = frontsParts(fr, cab)[0]!;
  return turnedBox([part.from, part.to], cab.rotation ?? 0, cab.origin);
};

describe("portes de cuisine en façades", () => {
  it("la colonne four a deux portes, ses façades : sous le four et au-dessus, sans le couvrir", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: [newItem([], "app-oven-column", 600)] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const cab = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Colonne four"))!;
    const fronts = doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cab.id);
    expect(fronts.map((f) => f.name)).toEqual([`Façades ${cab.name}`, `Façades ${cab.name} (2)`]);
    const [over, under] = fronts.map((f) => doorOf(f, cab));
    const oven = doc.features.find((f) => f.type === "appliance" && f.name === "Four (colonne)")!;
    const [ovenLow, ovenHigh] = oven.type === "appliance" ? [oven.origin[2], oven.origin[2] + oven.height] : [0, 0];
    expect(over![0][2]).toBeGreaterThanOrEqual(ovenHigh);
    expect(under![1][2]).toBeLessThanOrEqual(ovenLow);
    expect(over![1][2]).toBeCloseTo(cab.height - 1.5, 3);
    expect(doc.features.some((f) => f.type === "extrude" && /^Porte/.test(f.name))).toBe(false);
  });

  it("le meuble d'angle de l'Implantation a sa porte en façade, contre son panneau, ses charnières loin de l'angle", () => {
    const plan = kitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN, layout: "L", corner: "unit" }, "melamine-white", "laminate");
    const cab = plan.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name === "Meuble d'angle B")!;
    const fr = plan.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cab.id)!;
    expect(fr).toMatchObject({ layout: "door", side: "right" });
    const door = doorOf(fr, cab);
    const panel = plan.layout.boxes.find((b) => b.name === "Panneau d'angle B")!;
    // Wall A along x: the door just right of the panel.
    expect(door[0][0] - panel.to[0]).toBeCloseTo(1.5, 3);
    expect(plan.layout.boxes.some((b) => /^Porte/.test(b.name))).toBe(false);
  });
});

describe("habillage de réfrigérateur dans le Plan de cuisine", () => {
  it("dans les Colonnes : deux côtés toute hauteur, un caisson à portes en haut, le réfrigérateur américain entre eux", async () => {
    const { familyModels } = await import("../../frontend/src/app/kitchen/kitchen-catalog-view");
    expect(familyModels("tall").find((g) => g[0]!.id.startsWith("app-fridge-surround-"))!.map((e) => e.width)).toEqual([700, 800, 900, 968, 1000, 1100, 1200]);
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: [newItem([], "app-fridge-surround", 968)] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const sides = doc.features.filter((f) => f.type === "extrude" && /^Côté (gauche|droit) habillage/.test(f.name));
    expect(sides.map((f) => (f.type === "extrude" ? f.distance : 0))).toEqual([2300, 2300]);
    const cab = doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    expect([cab.width, cab.height, cab.origin[2], cab.depth]).toEqual([968 - 38, 400, 1900, 720]);
    expect(doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cab.id)!.layout).toBe("doors");
    const fridge = doc.features.find((f) => f.type === "appliance" && f.model === "fridge-american")!;
    expect(fridge.type === "appliance" && [fridge.width, fridge.height, fridge.origin[2]]).toEqual([910, 1870, 0]);
  });

  it("ses côtés et son réfrigérateur sont de lui : collé par une de ses faces, il bouge en entier, le plan le refait autour de son caisson", async () => {
    const { planUnitCabinet } = await import("../../frontend/src/document/kitchen-plan-add");
    const { syncKitchenPlans } = await import("../../frontend/src/document/kitchen-sync");
    const { glueKey } = await import("../../frontend/src/app/face-glue-tool");
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: [newItem([], "app-fridge-surround", 968), { ...newItem([{ id: "k1" } as never], "space", 600) }] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const cab = doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const side = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté gauche habillage"))!;
    const fridge = doc.features.find((f) => f.type === "appliance" && f.model === "fridge-american")!;
    expect([planUnitCabinet(doc, side.id), planUnitCabinet(doc, fridge.id), planUnitCabinet(doc, cab.id)]).toEqual([cab.id, cab.id, null]);
    // The body of its side and its caisson: one element to glue.
    expect(glueKey(doc, side.id)).toBe(glueKey(doc, `${cab.id}#0`));
    // Its caisson moved 300 mm along the wall: its sides and its fridge come with it.
    const along = (f: { origin?: number[] } | undefined) => f?.origin?.[0] ?? 0;
    const moved = syncKitchenPlans(doc, { ...doc, features: doc.features.map((f) => (f.id === cab.id ? { ...cab, origin: [cab.origin[0] + 300, cab.origin[1], cab.origin[2]] as typeof cab.origin } : f)) });
    const fridgeNow = moved.features.find((f) => f.type === "appliance" && f.model === "fridge-american") as { origin: number[] };
    expect(Math.round(fridgeNow.origin[0] - along(fridge as never))).toBe(300);
    const sideNow = (name: string) => moved.features.find((f) => f.name === name);
    expect(sideNow(side.name)).toBeDefined();
  });

  it("la hauteur du réfrigérateur se règle : le caisson du dessus prend le reste, jamais moins de 20 cm", () => {
    const build = (fridge: number) => {
      const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: [{ ...newItem([], "app-fridge-surround", 968), fridge }] }, made: {} });
      const built = withKitchenBuilt(base.doc, base.id, {});
      if (typeof built === "string") throw new Error(built);
      const cab = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
      const f = built.doc.features.find((x) => x.type === "appliance" && x.model === "fridge-american")!;
      return [cab.height, cab.origin[2], f.type === "appliance" ? f.height : 0];
    };
    expect(build(1780)).toEqual([490, 1810, 1780]);
    expect(build(2200)).toEqual([200, 2100, 2070]);
    expect(surroundFridge(KITCHEN_PLAN, newItem([], "app-fridge-surround", 968))).toBe(1870);
  });
});
