/** Toutes les portes des caissons de cuisine sont leurs façades (outil Façades) : colonne four, porte d'angle de l'Implantation. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenPlan } from "../../frontend/src/document/kitchen-plan";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { frontsParts } from "../../frontend/src/features/fronts-parts";
import { KITCHEN } from "../../frontend/src/features/kitchen-layout";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
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
