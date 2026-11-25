/** « Sélectionner … entier » : l'élément d'une pièce, quelle qu'elle soit — caisson et façades, habillage, appareil. */
import { describe, expect, it } from "vitest";
import { wholeSelection } from "../../frontend/src/app/whole-element";
import { withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type CadDocument } from "../../frontend/src/document/types";
import { cabinetPartNames } from "../../frontend/src/features/cabinet-parts";
import { frontsPartNames } from "../../frontend/src/features/fronts-parts";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const kitchen = () => {
  const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} });
  const items = [newItem([], "app-fridge-surround", 968)];
  items.push(newItem(items, "base-bas-2-portes", 800), newItem(items, "app-dishwasher", 600));
  const built = withKitchenBuilt(base.doc, base.id, { runs: { A: items } });
  if (typeof built === "string") throw new Error(built);
  return built.doc;
};
/** Every body the model shows: each piece of each feature. */
const bodies = (doc: CadDocument) => doc.features.flatMap((f) => (f.type === "cabinet" ? cabinetPartNames(f).map((_, i) => `${f.id}${PART_SEPARATOR}${i}`) : f.type === "fronts" ? frontsPartNames(f, doc.features.find((c) => c.id === f.cabinet) as never).map((_, i) => `${f.id}${PART_SEPARATOR}${i}`) : f.type === "extrude" || f.type === "appliance" ? [f.id] : []));

describe("sélectionner l'élément entier", () => {
  it("un côté ou une étagère d'un caisson : le caisson avec ses façades", () => {
    const doc = kitchen();
    const all = bodies(doc);
    const cab = doc.features.find((f) => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const fronts = doc.features.find((f) => f.type === "fronts" && f.cabinet === cab.id)!;
    const whole = wholeSelection(doc, all, `${cab.id}${PART_SEPARATOR}0`)!;
    expect(whole.name).toBe(cab.name);
    expect(whole.bodies).toContain(`${fronts.id}${PART_SEPARATOR}0`);
    expect(whole.bodies.every((b) => b.startsWith(`${cab.id}#`) || b.startsWith(`${fronts.id}#`))).toBe(true);
  });

  it("un côté de l'habillage de réfrigérateur : tout l'habillage, son caisson et son réfrigérateur", () => {
    const doc = kitchen();
    const all = bodies(doc);
    const side = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté droit habillage"))!;
    const fridge = doc.features.find((f) => f.type === "appliance" && f.name === "Réfrigérateur américain")!;
    const whole = wholeSelection(doc, all, side.id)!;
    expect(whole.name).toMatch(/^Habillage réfrigérateur/);
    expect(whole.bodies).toEqual(expect.arrayContaining([side.id, fridge.id]));
    expect(whole.bodies.some((b) => doc.features.find((f) => f.id === b.split("#")[0])?.type === "cabinet")).toBe(true);
  });

  it("une pièce seule (le plan de travail) : rien à prendre de plus", () => {
    const doc = kitchen();
    const top = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Plan de travail"))!;
    expect(wholeSelection(doc, bodies(doc), top.id)).toBeNull();
  });
});
