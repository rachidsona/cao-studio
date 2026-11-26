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
    expect([cab.width, cab.height, cab.origin[2], cab.depth]).toEqual([968 - 38, 400, 1900, 580]);
    expect(doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cab.id)!.layout).toBe("doors");
    const fridge = doc.features.find((f) => f.type === "appliance" && f.model === "fridge-american")!;
    expect(fridge.type === "appliance" && [fridge.width, fridge.height, fridge.origin[2]]).toEqual([910, 1870, 0]);
    // No plinth under it: it stands on the floor; as deep as the other columns.
    expect(doc.features.filter((f) => f.type === "extrude" && /^Plinthe/.test(f.name))).toEqual([]);
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
    expect(Math.round(fridgeNow.origin[0]! - along(fridge as never))).toBe(300);
    const sideNow = (name: string) => moved.features.find((f) => f.name === name);
    expect(sideNow(side.name)).toBeDefined();
  });

  it("un seul meuble : son caisson changé dans la 3D, l'habillage le suit ; une de ses pièces supprimée, tout l'habillage part", async () => {
    const { syncKitchenPlans } = await import("../../frontend/src/document/kitchen-sync");
    const { withDeletedFreed } = await import("../../frontend/src/document/kitchen-delete-sync");
    const { deleteFeatures } = await import("../../frontend/src/document/operations");
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: [newItem([], "app-fridge-surround", 968)] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const cab = doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    // Its caisson 35 cm high (it was 40): the sides end where it ends; wider by 10 cm: the surround too.
    const synced = syncKitchenPlans(doc, { ...doc, features: doc.features.map((f) => (f.id === cab.id ? { ...cab, height: 350, width: cab.width + 100 } : f)) });
    const item = kitchenPlanIn(synced, base.id)!.runs!.A![0]!;
    expect([item.height, item.width]).toEqual([2250, 1068]);
    const side = synced.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté gauche habillage"))!;
    expect(side.type === "extrude" && side.distance).toBe(2250);
    // Moved whole (Déplacer, « Le corps entier »): a side takes the surround, by its caisson.
    const { wholeOwner } = await import("../../frontend/src/app/move-whole");
    const sideNow = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté droit habillage"))!;
    expect(wholeOwner(doc, sideNow.id)).toEqual({ kind: "cabinet", id: cab.id });
    // Clicked in the 3D: its unit, chosen in the plan (« Meuble choisi »).
    const { pieceItemOf } = await import("../../frontend/src/document/kitchen-plan-add");
    expect(pieceItemOf(doc, sideNow.id)).toEqual({ plan: base.id, run: "A", item: kitchenPlanIn(doc, base.id)!.runs!.A![0]!.id });
    // A side deleted: the surround goes whole, its room kept free.
    const left = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté gauche habillage"))!;
    const gone = withDeletedFreed(doc, deleteFeatures(doc, [left.id]).next);
    expect(kitchenPlanIn(gone, base.id)!.runs!.A!.map((i) => i.model)).toEqual(["space"]);
    expect(gone.features.some((f) => f.name.startsWith("Côté droit habillage") || (f.type === "appliance" && f.model === "fridge-american") || f.type === "cabinet")).toBe(false);
  });

  it("son caisson s'aménage (une Répartition) : l'habillage reste, ses côtés et son réfrigérateur, le caisson à sa place", async () => {
    const { withCabinetFurnished } = await import("../../frontend/src/document/cabinet-furnish");
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: [{ ...newItem([], "app-fridge-surround", 968), fridge: 1800 }] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const cab = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const made = withCabinetFurnished(built.doc, cab.id);
    if (typeof made === "string") throw new Error(made);
    const doc = made.doc;
    expect(doc.features.some((f) => f.type === "cabinet")).toBe(false);
    expect(doc.features.filter((f) => f.name.startsWith("Côté gauche habillage") || f.name.startsWith("Côté droit habillage")).length).toBe(2);
    const fridge = doc.features.find((f) => f.type === "appliance" && f.model === "fridge-american")!;
    expect(fridge.type === "appliance" && fridge.height).toBe(1800);
    // The Répartition where the caisson was: between the sides, over the fridge, as wide.
    const sketch = doc.features.find((f) => f.id === made.sketch)!;
    expect(sketch.type === "sketch" && sketch.frame?.origin.map(Math.round)).toEqual(cab.origin.map((v, i) => Math.round(i === 1 ? v + cab.depth - 3 : v)));
    expect(kitchenPlanIn(doc, base.id)!.runs!.A![0]).toMatchObject({ model: "space", width: 968, from: "app-fridge-surround", furnished: made.sketch });
    // The unit it was is the surround — not a base unit with two doors —, and « Remettre le meuble d'origine » puts it back, its fridge as high.
    const { heldModel, withCaissonUnfurnished } = await import("../../frontend/src/document/caisson-unit");
    expect(heldModel(doc, kitchenPlanIn(doc, base.id)!.runs!.A![0]!)).toBe("app-fridge-surround");
    const back = withCaissonUnfurnished(doc, made.sketch);
    if (typeof back === "string") throw new Error(back);
    expect(kitchenPlanIn(back.doc, base.id)!.runs!.A![0]).toMatchObject({ model: "app-fridge-surround", width: 968, fridge: 1800 });
    expect(back.doc.features.filter((f) => f.type === "cabinet").map((f) => f.name)).toEqual([cab.name]);
    const again = back.doc.features.find((f) => f.type === "appliance" && f.model === "fridge-american")!;
    expect(again.type === "appliance" && again.height).toBe(1800);
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
    // Made higher: the fridge stays as it is, the caisson on top grows.
    expect(surroundFridge(KITCHEN_PLAN, { ...newItem([], "app-fridge-surround", 968), height: 2700 })).toBe(1870);
  });
});
