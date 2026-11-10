/** Dupliquer un meuble de cuisine dans la 3D : sur son linéaire quand le plan l'a fait, sinon à côté de lui. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenRunItem } from "../../frontend/src/document/types";
import { withCabinetDuplicated } from "../../frontend/src/document/unit-duplicate";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const cabinets = (doc: CadDocument) => doc.features.filter((f): f is CabinetFeature => f.type === "cabinet");

describe("dupliquer un meuble de cuisine", () => {
  it("sur son linéaire : le même juste après lui, avec ses cotes à lui ; refusé quand il n'y a plus la place", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600]] as const) items = [...items, newItem(items, model, width)];
    items = items.map((i, k) => (k === 0 ? { ...i, depth: 500 } : i));
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doors = cabinets(built.doc).find((c) => c.name.startsWith("Bas 2 portes"))!;
    const copy = withCabinetDuplicated(built.doc, doors.id);
    if (typeof copy === "string") throw new Error(copy);
    expect(() => parseDocument(copy.doc)).not.toThrow();
    const run = kitchenPlanIn(copy.doc, made.id)!.runs!.A!;
    expect(run.map((i) => [i.model, i.width, i.depth])).toEqual([["base-bas-2-portes", 800, 500], ["base-bas-2-portes", 800, 500], ["base-bas-3-tiroirs", 600, undefined]]);
    expect(new Set(run.map((i) => i.id)).size).toBe(3);
    const twin = cabinets(copy.doc).find((c) => c.id === copy.cabinet)!;
    expect([twin.width, twin.depth, twin.origin[0]]).toEqual([800, 500, 800]);
    expect(copy.note).toMatch(/dupliqué sur son linéaire/);
    // 800 + 800 + 600 = 2200 of 2400: no room for a third.
    expect(withCabinetDuplicated(copy.doc, twin.id)).toMatch(/Pas de place pour un autre « Bas 2 portes » de 80 cm sur ce linéaire : il reste 20 cm au plus/);
    expect(withCabinetDuplicated(built.doc, "nothing")).toMatch(/Sélectionnez d'abord un caisson/);
  });

  it("posé à part : sa copie à sa droite, avec ses façades et ses matières", () => {
    // A unit and its fronts as the catalogue makes them, on their own (no plan).
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [newItem([], "base-bas-2-portes", 800)] } });
    if (typeof built === "string") throw new Error(built);
    const cabinet: CabinetFeature = { ...cabinets(built.doc)[0]!, id: "cb1", name: "Bas 2 portes", origin: [100, 0, 0], rotation: 0 };
    const fronts: FrontsFeature = { ...built.doc.features.find((f): f is FrontsFeature => f.type === "fronts")!, id: "fr1", cabinet: "cb1" };
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts], bodyInfo: { [`cb1${PART_SEPARATOR}0`]: { material: "solid-oak" }, [`fr1${PART_SEPARATOR}1`]: { material: "walnut" } } };
    const copy = withCabinetDuplicated(doc, "cb1");
    if (typeof copy === "string") throw new Error(copy);
    expect(() => parseDocument(copy.doc)).not.toThrow();
    const twin = copy.doc.features.find((f) => f.id === copy.cabinet) as CabinetFeature;
    expect(twin).toMatchObject({ origin: [900, 0, 0], width: 800 });
    expect(twin.name).not.toBe("Bas 2 portes");
    const doors = copy.doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === twin.id);
    expect(doors).toHaveLength(1);
    expect(copy.doc.bodyInfo?.[`${twin.id}${PART_SEPARATOR}0`]?.material).toBe("solid-oak");
    expect(copy.doc.bodyInfo?.[`${doors[0]!.id}${PART_SEPARATOR}1`]?.material).toBe("walnut");
    // Turned a quarter: its right is along Y.
    const turned = withCabinetDuplicated({ ...doc, features: [{ ...cabinet, rotation: 90 }, fronts] }, "cb1");
    if (typeof turned === "string") throw new Error(turned);
    expect((turned.doc.features.find((f) => f.id === turned.cabinet) as CabinetFeature).origin).toEqual([100, 800, 0]);
  });
});
