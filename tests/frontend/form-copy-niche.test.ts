/** « Pipette de forme » sur une Répartition : une porte de niche donnée à une autre lui donne aussi la hauteur de sa case. */
import { describe, expect, it } from "vitest";
import { formOf, withFormCopied } from "../../frontend/src/document/form-copy";
import { moduleSizes, withModules } from "../../frontend/src/document/dressing-modules";
import { withRecipe } from "../../frontend/src/document/niche-recipe";
import { withNicheSize } from "../../frontend/src/document/niche-size";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { isPartition, leafNiches, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const sketchOf = (doc: CadDocument, id: string) => doc.features.find((f) => f.id === id) as SketchFeature;
const ok = (doc: CadDocument | string): CadDocument => {
  if (typeof doc === "string") throw new Error(doc);
  return doc;
};

describe("pipette de forme sur des niches", () => {
  it("une porte donne la hauteur de sa case, sa voisine libre prend le reste ; chacune garde son nom", () => {
    const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.sketch;
    const partition = sketchOf(made.doc, sketch).offsets!.find(isPartition)!.id;
    const leaf = leafNiches(sketchOf(made.doc, sketch)).find((n) => n.path[0] === 0)!;
    let doc = ok(withModules(made.doc, sketch, [leaf], "drawers", 18, moduleSizes("drawers")));
    doc = ok(withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 3, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] }));
    const box = (d: CadDocument, key: string) => {
      const chain = rebuildChain(sketchOf(d, sketch), partition);
      if (typeof chain === "string") throw new Error(chain);
      return chain.niches.get(key)!.box;
    };
    const first = box(doc, "1.1");
    doc = ok(withNicheSize(doc, sketch, "y", [first.y0, first.y1], 400));
    const door = (id: string, path: number[]): NicheFeature => ({ id, type: "niche", name: id, sketch, partition, niche: path, fill: "door", diameter: 25, drop: 60, drawers: 1, gap: 3, thickness: 18, handles: true });
    doc = { ...doc, features: [...doc.features, { ...door("pa", [1, 1]), style: "glass", frameWidth: 20 }, door("pb", [1, 2])] };
    const height = (d: CadDocument, key: string) => box(d, key).y1 - box(d, key).y0;
    expect(height(doc, "1.2")).not.toBeCloseTo(400, 0);

    const next = ok(withFormCopied(doc, formOf(doc, "pa#0")!, formOf(doc, "pb#0")!));
    expect(height(next, "1.2")).toBeCloseTo(400, 3);
    expect(height(next, "1.1")).toBeCloseTo(400, 3);
    expect(next.features.find((f) => f.id === "pb")).toMatchObject({ name: "pb", niche: [1, 2], style: "glass", frameWidth: 20 });
  });
});
