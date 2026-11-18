/** Un caisson aménagé à la main réglé comme un meuble du linéaire : ses cotes, ou remis en meuble d'origine. */
import { describe, expect, it } from "vitest";
import { withCabinetFurnished } from "../../frontend/src/document/cabinet-furnish";
import { caissonSizes, heldModel, withCaissonSized, withCaissonUnfurnished } from "../../frontend/src/document/caisson-unit";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type KitchenRunItem } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

function furnished(model: string, width: number): { doc: CadDocument; plan: string; sketch: string } {
  const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
  const items: KitchenRunItem[] = [newItem([], model, width)];
  const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
  if (typeof built === "string") throw new Error(built);
  const cabinet = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
  const done = withCabinetFurnished(built.doc, cabinet.id);
  if (typeof done === "string") throw new Error(done);
  return { doc: done.doc, plan: made.id, sketch: done.sketch };
}
const itemOf = (doc: CadDocument, plan: string) => kitchenPlanIn(doc, plan)!.runs!.A![0]!;

describe("caisson aménagé réglé comme un meuble", () => {
  it("garde le modèle qu'il était, et le retrouve à son nom pour un caisson aménagé avant", () => {
    const { doc, plan } = furnished("wall-haut-1-porte", 600);
    const item = itemOf(doc, plan);
    expect(item).toMatchObject({ model: "space-wall", from: "wall-haut-1-porte" });
    expect(heldModel(doc, { ...item, from: undefined })).toBe("wall-haut-1-porte");
    expect(() => parseDocument(doc)).not.toThrow();
  });

  it("sa hauteur et sa profondeur : sa Répartition refaite à ces cotes, sa place aussi", () => {
    const { doc, plan, sketch } = furnished("wall-haut-1-porte", 600);
    const was = caissonSizes(doc, sketch)!;
    const deeper = withCaissonSized(doc, sketch, { depth: was.depth + 50, height: was.height - 100 });
    if (typeof deeper === "string") throw new Error(deeper);
    expect(caissonSizes(deeper.doc, sketch)).toEqual({ depth: was.depth + 50, height: was.height - 100 });
    expect(itemOf(deeper.doc, plan)).toMatchObject({ depth: was.depth + 50, height: was.height - 100, furnished: sketch });
    expect(deeper.doc.features.some((f) => f.type === "extrude" && f.sketch === sketch)).toBe(true);
    expect(() => parseDocument(deeper.doc)).not.toThrow();
  });

  it("remis en meuble d'origine : l'aménagement ôté, le meuble du catalogue à sa place, à sa largeur", () => {
    const { doc, plan, sketch } = furnished("base-bas-2-portes", 800);
    const back = withCaissonUnfurnished(doc, sketch);
    if (typeof back === "string") throw new Error(back);
    expect(itemOf(back.doc, plan)).toMatchObject({ model: "base-bas-2-portes", width: 800 });
    expect(itemOf(back.doc, plan).furnished).toBeUndefined();
    // (Its id may be another's now: the kitchen made again takes the free ones.)
    expect(back.doc.features.some((f) => f.name.startsWith("Caisson — "))).toBe(false);
    expect(back.doc.features.filter((f) => f.type === "cabinet").map((f) => f.name)).toEqual([expect.stringMatching(/^Bas 2 portes 800/)]);
  });
});
