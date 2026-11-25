/** La profondeur tapée sur une carte d'« Ajouter des meubles » : pour tout ce modèle, ou pour le prochain ajouté. */
import { describe, expect, it } from "vitest";
import { cardDepth, withNextDepth } from "../../frontend/src/app/kitchen/kitchen-model-depth";
import { CATALOG } from "../../frontend/src/document/kitchen-catalog";

const entry = (id: string) => CATALOG.find((e) => e.id === id);
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan } from "../../frontend/src/document/types";
import { itemSize, newItem } from "../../frontend/src/features/kitchen-run-items";

describe("profondeur d'un modèle", () => {
  it("pour tout ce modèle : ses meubles posés la prennent, un meuble réglé à part garde la sienne, les autres modèles non", () => {
    const items = [newItem([], "base-bas-1-porte", 600)];
    items.push(newItem(items, "base-bas-1-porte", 400), { ...newItem(items, "base-bas-1-porte", 500), depth: 450 }, newItem(items, "base-bas-3-tiroirs", 600));
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "I", lengthA: 3600, modelDepths: { "base-bas-1-porte": 500 }, runs: { A: items } };
    expect(items.map((i) => itemSize(p, i).depth)).toEqual([500, 500, 450, 580]);
    const built = kitchenFromPlan(p).units.filter((u) => u.run === "A" && !u.corner);
    expect(built.map((u) => u.depth)).toEqual([500, 500, 450, 580]);
  });

  it("la carte montre la profondeur du modèle ; tapée pour le prochain seulement, elle va au meuble ajouté puis s'oublie", () => {
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "I", lengthA: 3600, modelDepths: { "tall-colonne-rangement": 600 } };
    let given: [string, number] | null = null;
    const card = cardDepth(p, (model, mm) => (given = [model, mm]), () => undefined);
    const column = entry("tall-colonne-rangement-600")!;
    expect(card.value(column)).toBe(600);
    expect(card.value(entry("base-bas-1-porte-600")!)).toBe(580);
    // For all of the model (the usual choice): handed to the plan.
    card.set(column, 620);
    expect(given).toEqual(["tall-colonne-rangement", 620]);
    // An item added with no depth typed for it alone keeps none of its own.
    expect(withNextDepth(newItem([], "tall-colonne-rangement", 600)).depth).toBeUndefined();
  });
});
