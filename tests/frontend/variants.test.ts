/** Les variantes d'un projet : gardées, comparées, rouvertes, et la barre contextuelle. */
import { describe, expect, it } from "vitest";
import { contextTools } from "../../frontend/src/document/context-tools";
import { openedVariant, withoutVariant, withVariant } from "../../frontend/src/document/variants";
import { validateDocument } from "../../frontend/src/document/validate";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { upgradedOrder } from "../../frontend/src/ui/ribbon-layout";

const kept = (name: string) => ({ name, total: 1200, parts: 4 });
const done = (made: CadDocument | string) => {
  if (typeof made === "string") throw new Error(made);
  return made;
};

describe("variantes", () => {
  it("garde le projet sans ses variantes, avec un document valide", () => {
    const one = done(withVariant(createReferencePlate(), kept("A")));
    const two = done(withVariant(one, kept("B")));
    expect(two.variants?.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(two.variants?.[1]?.doc).not.toHaveProperty("variants");
    expect(validateDocument(two)).toEqual([]);
  });

  it("rouvre une variante sans perdre la liste", () => {
    const start = createReferencePlate();
    const saved = done(withVariant(start, kept("A")));
    const changed = { ...saved, features: [] };
    const back = done(openedVariant(changed, "v1"));
    expect(back.features).toHaveLength(start.features.length);
    expect(back.variants).toHaveLength(1);
    expect(withoutVariant(back, "v1").variants).toEqual([]);
    expect(openedVariant(changed, "v9")).toBeTypeOf("string");
  });

  it("refuse un nom vide, un doublon et une septième variante", () => {
    let doc = createReferencePlate();
    expect(withVariant(doc, kept("  "))).toBeTypeOf("string");
    for (const n of [1, 2, 3, 4, 5, 6]) doc = done(withVariant(doc, kept(`V${n}`)));
    expect(withVariant(doc, kept("V1"))).toContain("déjà");
    expect(withVariant(doc, kept("V7"))).toContain("6");
  });

  it("refuse une liste abîmée", () => {
    expect(validateDocument({ ...createReferencePlate(), variants: [{ id: "v1" }] }).join()).toContain("variants");
  });
});

describe("barre contextuelle", () => {
  it("propose les outils selon l'élément", () => {
    const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    expect(contextTools(made.doc, [placed.id], [])?.title).toBe("Plan de dressing");
    expect(contextTools(made.doc, [made.sketch], [])?.title).toBe("Répartition");
    expect(contextTools(made.doc, [], [])).toBeNull();
    const plate = createReferencePlate();
    const body = plate.features.find((f) => f.type === "extrude")!.id;
    expect(contextTools(plate, [], [body])?.title).toBe("Pièce");
  });
});

describe("ruban", () => {
  it("garde l'ordre choisi et met les meubles après Modifier", () => {
    expect(upgradedOrder(["Modifier", "Créer", "Curic", "Atelier", "Menuiserie"])).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Dressing", "Créer", "Curic", "Atelier", "Fabrication", "Client"]);
    expect(upgradedOrder(["Modifier", "Pièce", "Meuble", "Dressing", "Créer", "Curic", "Atelier", "Fabrication", "Client"])).toEqual(["Modifier", "Pièce", "Cuisine", "Meuble", "Dressing", "Créer", "Curic", "Atelier", "Fabrication", "Client"]);
  });
});
