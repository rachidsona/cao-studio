/** « Meubles de cuisine » lié au Plan de cuisine : un meuble du catalogue se range dans un linéaire du plan, la cuisine refaite. */
import { describe, expect, it } from "vitest";
import { CATALOG, customEntry, type CatalogEntry } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { addToKitchenPlan, planItemOf, planSpace, runCabinets, type PlanAdd } from "../../frontend/src/document/kitchen-plan-add";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { findFeature } from "../../frontend/src/document/operations";
import { createReferencePlate, type CadDocument, type KitchenFloorPlan } from "../../frontend/src/document/types";
import { newItem, spaceLeft } from "../../frontend/src/features/kitchen-run-items";

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const entry = (id: string): CatalogEntry => CATALOG.find((e) => e.id === id)!;
const planned = (patch: Partial<KitchenFloorPlan> = {}) => withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "L-left", lengthA: 3000, lengthB: 2400, runs: {}, made: {}, ...patch });
const ok = (r: PlanAdd | string | null): PlanAdd => {
  if (!r || typeof r === "string") throw new Error(String(r));
  return r;
};
const models = (doc: CadDocument, plan: string, run: string) => (kitchenPlanIn(doc, plan)!.runs?.[run] ?? []).map((i) => `${i.model}-${i.width}`);

describe("meubles de cuisine rangés dans le plan", () => {
  it("sans plan, rien ne change : le meuble se pose à part", () => {
    expect(addToKitchenPlan(empty(), entry("base-bas-1-porte-600"))).toBeNull();
  });

  it("va au bout du premier linéaire, et la cuisine 3D est faite avec son caisson relié", () => {
    const { doc, id } = planned();
    const added = ok(addToKitchenPlan(doc, entry("base-bas-2-portes-1000")));
    expect(added.run.id).toBe("A");
    expect(models(added.doc, id, "A")).toEqual(["base-bas-2-portes-1000"]);
    const cabinet = findFeature(added.doc, added.cabinet!);
    expect(cabinet?.type === "cabinet" && cabinet.width).toBe(1000);
    expect(kitchenRunOf(added.doc, added.cabinet!)).toEqual({ plan: id, run: "A" });
    expect(planItemOf(added.doc, added.cabinet!)).toEqual({ plan: id, run: "A", item: added.item });
    // Worktop and plinth come with it.
    expect(added.doc.features.some((f) => f.name === "Plan de travail A")).toBe(true);
  });

  it("se met après le meuble donné, et les suivants après lui", () => {
    const { doc, id } = planned();
    const first = ok(addToKitchenPlan(doc, entry("base-bas-1-porte-600")));
    const second = ok(addToKitchenPlan(first.doc, entry("base-bas-3-tiroirs-600")));
    const between = ok(addToKitchenPlan(second.doc, entry("base-bas-1-porte-400"), planItemOf(second.doc, first.cabinet!)));
    expect(models(between.doc, id, "A")).toEqual(["base-bas-1-porte-600", "base-bas-1-porte-400", "base-bas-3-tiroirs-600"]);
    const next = ok(addToKitchenPlan(between.doc, entry("base-bas-1-porte-300"), { plan: id, run: "A", item: between.item }));
    expect(models(next.doc, id, "A")).toEqual(["base-bas-1-porte-600", "base-bas-1-porte-400", "base-bas-1-porte-300", "base-bas-3-tiroirs-600"]);
    // Each cabinet of the run knows its unit.
    expect(runCabinets(next.doc, id, "A").map((c) => c.item)).toEqual(kitchenPlanIn(next.doc, id)!.runs!.A!.map((i) => i.id));
  });

  it("un mur plein passe au linéaire suivant, sans chasser un meuble déjà posé", () => {
    const { doc, id } = planned({ lengthA: 2000 });
    const full = withKitchenBuilt(doc, id, { runs: { A: [newItem([], "base-bas-2-portes", 1200)] } });
    if (typeof full === "string") throw new Error(full);
    const added = ok(addToKitchenPlan(full.doc, entry("base-bas-2-portes-1000"), planItemOf(full.doc, runCabinets(full.doc, id, "A")[0]!.cabinet)));
    expect(added.run.id).toBe("B");
    expect(models(added.doc, id, "A")).toEqual(["base-bas-2-portes-1200"]);
    expect(models(added.doc, id, "B")).toEqual(["base-bas-2-portes-1000"]);
  });

  it("un meuble haut va en haut, un des siens garde ses cotes, et ce qui ne tient nulle part est dit", () => {
    const { doc, id } = planned({ model: "I", lengthA: 1200 });
    const wall = ok(addToKitchenPlan(doc, entry("wall-haut-1-porte-600")));
    const cabinet = findFeature(wall.doc, wall.cabinet!);
    expect(cabinet?.type === "cabinet" && cabinet.origin[2]).toBeGreaterThan(1000);
    const own = customEntry({ kind: "base", name: "Bas maison", width: 500, height: 870, depth: 500, shelves: 1, layout: "door" });
    if (typeof own === "string") throw new Error(own);
    const mine = ok(addToKitchenPlan(wall.doc, own));
    expect(kitchenPlanIn(mine.doc, id)!.runs!.A!.at(-1)!.own?.name).toBe("Bas maison");
    expect(addToKitchenPlan(mine.doc, entry("base-bas-2-portes-1200"))).toBe("Bas 2 portes ne tient sur aucun linéaire du plan de cuisine.");
  });

  it("la place restante reste ouverte, sans grand fileur, et chaque pose dit combien il en reste", () => {
    const { doc, id } = planned({ model: "I", lengthA: 3000 });
    const added = ok(addToKitchenPlan(doc, entry("base-bas-2-portes-1000")));
    // 3000 − 1000: open room, not a 2 m filler that looks like a door.
    expect(added.fill.fillers).toEqual([]);
    expect(added.fill.free).toEqual([[1000, 3000]]);
    expect(added.doc.features.some((f) => f.name.startsWith("Fileur A"))).toBe(false);
    const cm = (mm: number) => `${mm / 10} cm`;
    expect(spaceLeft(added.fill, cm)).toBe("200 cm libres en bas, 300 cm en haut");
    // The plinth stops with the units; the worktop goes on.
    const plinth = added.doc.features.find((f) => f.name === "Plinthe A");
    expect(plinth?.type === "extrude" && plinth.distance).toBeGreaterThan(0);
    const sketch = added.doc.features.find((f) => f.type === "sketch" && added.doc.features.some((g) => g.type === "extrude" && g.name === "Plinthe A" && g.sketch === f.id));
    const xs = sketch?.type === "sketch" ? sketch.points.map((pt) => pt.x) : [];
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1000, 0);
    // 20 cm left stays open; 15 cm at most is closed by a filler.
    const tight = ok(addToKitchenPlan(added.doc, entry("base-bas-2-portes-1200")));
    const last = ok(addToKitchenPlan(tight.doc, entry("base-bas-1-porte-600")));
    expect([last.fill.free, last.fill.fillers]).toEqual([[[2800, 3000]], []]);
    const near = planned({ model: "I", lengthA: 2950 });
    let fullDoc = near.doc;
    let full!: PlanAdd;
    for (const id of ["base-bas-2-portes-1000", "base-bas-2-portes-1200", "base-bas-1-porte-600"]) ({ doc: fullDoc } = full = ok(addToKitchenPlan(fullDoc, entry(id))));
    expect([full.fill.free, full.fill.fillers]).toEqual([[], [[2800, 2950]]]);
    expect(full.doc.features.some((f) => f.name === "Fileur A")).toBe(true);
    expect(spaceLeft(full.fill, cm, false)).toBe("le bas est plein");
    expect(planSpace(full.doc, near.id).map(({ run, fill }) => [run.id, fill.free])).toEqual([["A", []]]);
  });
});
