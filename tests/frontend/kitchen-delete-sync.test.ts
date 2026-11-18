/** Supprimer dans la 3D un meuble du Plan de cuisine, ou un caisson aménagé : sa place est libre, rien ne revient. */
import { describe, expect, it } from "vitest";
import { withCabinetFurnished } from "../../frontend/src/document/cabinet-furnish";
import { withDeletedFreed } from "../../frontend/src/document/kitchen-delete-sync";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { deleteFeatures } from "../../frontend/src/document/operations";
import { createReferencePlate, type CabinetFeature, type CadDocument, type KitchenRunItem } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { inKeptRoom, newItem } from "../../frontend/src/features/kitchen-run-items";

function kitchen(): { doc: CadDocument; plan: string } {
  const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
  let items: KitchenRunItem[] = [];
  for (const [model, width] of [["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600]] as const) items = [...items, newItem(items, model, width)];
  const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
  if (typeof built === "string") throw new Error(built);
  return { doc: built.doc, plan: made.id };
}
const cabinet = (doc: CadDocument, start: string) => doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith(start));

describe("supprimer un meuble de cuisine dans la 3D", () => {
  it("laisse sa place libre sur le linéaire : il ne revient pas, ses voisins ne bougent pas, un autre la prend", () => {
    const { doc, plan } = kitchen();
    const doors = cabinet(doc, "Bas 2 portes")!;
    const drawers = cabinet(doc, "Bas 3 tiroirs")!;
    const deleted = deleteFeatures(doc, [doors.id]).next;
    const freed = withDeletedFreed(doc, deleted);
    expect(() => parseDocument(freed)).not.toThrow();
    const items = kitchenPlanIn(freed, plan)!.runs!.A!;
    expect(items.map((i) => [i.model, i.width])).toEqual([["space", 800], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600]]);
    expect(items[0]!.furnished).toBeUndefined();
    expect(cabinet(freed, "Bas 2 portes")).toBeUndefined();
    expect(freed.features.filter((f) => f.type === "fronts").length).toBe(doc.features.filter((f) => f.type === "fronts").length - 1);
    expect(cabinet(freed, "Bas 3 tiroirs")!.origin).toEqual(drawers.origin);
    // The kitchen made again: still gone.
    const again = withKitchenBuilt(freed, plan);
    if (typeof again === "string") throw new Error(again);
    expect(cabinet(again.doc, "Bas 2 portes")).toBeUndefined();
    // Another unit of that width added: it goes in that place (not after the others, where there is room too).
    const unit = newItem(items, "base-bas-1-porte", 800);
    const put = withKitchenBuilt(freed, plan, { runs: { A: inKeptRoom(items, unit)! } });
    if (typeof put === "string") throw new Error(put);
    expect(cabinet(put.doc, "Bas 1 porte")!.origin).toEqual(doors.origin);
    expect(kitchenPlanIn(put.doc, plan)!.runs!.A!.map((i) => i.model)).toEqual(["base-bas-1-porte", "base-bas-3-tiroirs", "wall-haut-1-porte"]);
    // A narrower one: the place keeps what is left; too wide for it, or a place a caisson holds: none.
    expect(inKeptRoom(items, { ...unit, width: 500 })!.map((i) => [i.model, i.width]).slice(0, 2)).toEqual([["base-bas-1-porte", 500], ["space", 300]]);
    expect(inKeptRoom(items, { ...unit, width: 900 })).toBeNull();
    expect(inKeptRoom(items.map((i) => (i.model === "space" ? { ...i, furnished: "sk9" } : i)), unit)).toBeNull();
    // Nothing deleted: the same document.
    expect(withDeletedFreed(doc, doc)).toBe(doc);
  });

  it("un fileur supprimé, celui du reste ou un posé à la main : sa place reste libre, il ne revient pas", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-2-portes", 800], ["filler", 50], ["base-bas-3-tiroirs", 600], ["base-bas-2-portes", 900]] as const) items = [...items, newItem(items, model, width)];
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doc = built.doc;
    const named = (d: CadDocument, name: string) => d.features.find((f) => f.type === "extrude" && f.name === name);
    // 2400 − 2350: 50 mm of rest, closed by the plan's filler; the one put by hand between the units.
    expect([named(doc, "Fileur A"), named(doc, "Fileur posé A1")].every(Boolean)).toBe(true);
    const rest = withDeletedFreed(doc, deleteFeatures(doc, [named(doc, "Fileur A")!.id]).next);
    expect(kitchenPlanIn(rest, made.id)!.runs!.A!.map((i) => [i.model, i.width])).toEqual([["base-bas-2-portes", 800], ["filler", 50], ["base-bas-3-tiroirs", 600], ["base-bas-2-portes", 900], ["space", 50]]);
    expect(named(rest, "Fileur A")).toBeUndefined();
    const hand = withDeletedFreed(rest, deleteFeatures(rest, [named(rest, "Fileur posé A1")!.id]).next);
    expect(kitchenPlanIn(hand, made.id)!.runs!.A!.map((i) => i.model)).toEqual(["base-bas-2-portes", "space", "base-bas-3-tiroirs", "base-bas-2-portes", "space"]);
    expect(hand.features.some((f) => f.type === "extrude" && f.name.startsWith("Fileur"))).toBe(false);
    // The units stay where they were.
    expect(cabinet(hand, "Bas 3 tiroirs")!.origin).toEqual(cabinet(doc, "Bas 3 tiroirs")!.origin);
  });

  it("ne refait pas la cuisine quand on l'enlève : un plan de travail supprimé avec ses meubles", () => {
    const { doc } = kitchen();
    const worktop = doc.features.find((f) => f.name.startsWith("Plan de travail"))!;
    const gone = deleteFeatures(doc, [cabinet(doc, "Bas 2 portes")!.id, worktop.id]).next;
    expect(withDeletedFreed(doc, gone)).toBe(gone);
  });

  it("un caisson aménagé dont on supprime les panneaux disparaît en entier, sa place libre à nouveau", () => {
    const { doc, plan } = kitchen();
    const made = withCabinetFurnished(doc, cabinet(doc, "Bas 2 portes")!.id);
    if (typeof made === "string") throw new Error(made);
    expect(kitchenPlanIn(made.doc, plan)!.runs!.A![0]).toMatchObject({ model: "space", furnished: made.sketch });
    // Its panels deleted (the navigator's group): the sketch and its doors are left.
    const panels = made.doc.features.filter((f) => f.type === "extrude" && f.sketch === made.sketch).map((f) => f.id);
    const emptied = deleteFeatures(made.doc, panels).next;
    expect(emptied.features.some((f) => f.id === made.sketch)).toBe(true);
    const freed = withDeletedFreed(made.doc, emptied);
    expect(freed.features.some((f) => f.id === made.sketch || ((f.type === "extrude" || f.type === "niche") && f.sketch === made.sketch))).toBe(false);
    const room = kitchenPlanIn(freed, plan)!.runs!.A![0]!;
    expect(room).toMatchObject({ model: "space", width: 800 });
    expect(room.furnished).toBeUndefined();
    expect(() => parseDocument(freed)).not.toThrow();
  });
});
