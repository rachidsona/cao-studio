/** « Caissons en Répartition » : chaque meuble posé par le plan devient un caisson du dressing, à sa place. */
import { describe, expect, it } from "vitest";
import { withCaissonsPlaced } from "../../frontend/src/document/cabinet-furnish";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CadDocument, type KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const kitchen = (asCaissons: boolean) => {
  const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, asCaissons, runs: {}, made: {} });
  let items: KitchenRunItem[] = [];
  for (const [m, w] of [["base-bas-2-portes", 800], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600], ["app-fridge-surround", 968]] as const) items = [...items, newItem(items, m, w)];
  const built = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
  if (typeof built === "string") throw new Error(built);
  return { doc: withCaissonsPlaced(built.doc, base.id).doc, id: base.id };
};

describe("caissons en Répartition", () => {
  it("cochée : chaque meuble devient un caisson du dressing, sa place gardée — l'habillage aussi, ses côtés et son réfrigérateur restant ; le plan de travail suit", () => {
    const { doc, id } = kitchen(true);
    const runs = kitchenPlanIn(doc, id)!.runs!.A!;
    expect(runs.filter((i) => i.furnished).map((i) => i.from)).toEqual(["base-bas-2-portes", "base-bas-1-porte", "wall-haut-1-porte", "app-fridge-surround"]);
    // No cabinet left; four Répartitions stand in their places, the surround's sides and fridge round the last.
    expect(doc.features.filter((f) => f.type === "cabinet").length).toBe(0);
    expect(doc.features.filter((f) => f.type === "sketch" && f.name.startsWith("Caisson —")).length).toBe(4);
    expect(doc.features.filter((f) => f.name.startsWith("Côté gauche habillage") || (f.type === "appliance" && f.model === "fridge-american")).length).toBe(2);
    expect(doc.features.some((f) => f.type === "extrude" && f.name.startsWith("Plan de travail"))).toBe(true);
  });

  it("décochée : les meubles restent des caissons simples", () => {
    const { doc } = kitchen(false);
    expect(doc.features.filter((f) => f.type === "cabinet").length).toBe(4);
  });
});
