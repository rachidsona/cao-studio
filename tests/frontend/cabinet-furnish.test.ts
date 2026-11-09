/** Un caisson de cuisine aménagé à la main : une Répartition de mêmes cotes à sa place, le linéaire lui gardant sa place. */
import { describe, expect, it } from "vitest";
import { cabinetOfBody, withCabinetFurnished } from "../../frontend/src/document/cabinet-furnish";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type CabinetFeature, type CadDocument, type KitchenRunItem, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { frameOf } from "../../frontend/src/sketcher/frame";
import { isPartition, isShelves } from "../../frontend/src/sketcher/partition-history";

const items = (...list: [string, number][]): KitchenRunItem[] => list.reduce<KitchenRunItem[]>((all, [model, width]) => [...all, newItem(all, model, width)], []);

function kitchen(): { doc: CadDocument; plan: string } {
  const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
  const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items(["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600], ["wall-haut-1-porte", 600]) } });
  if (typeof built === "string") throw new Error(built);
  return { doc: built.doc, plan: made.id };
}

/** The world box of a caisson: its sketch's outline on its frame, out to its depth. */
function caissonBox(doc: CadDocument, sketchId: string): [number[], number[]] {
  const sketch = doc.features.find((f) => f.id === sketchId) as SketchFeature;
  const partition = sketch.offsets!.find(isPartition)!;
  const depth = partition.step.kind === "partition" ? partition.step.depth! : 0;
  const { origin, u, v, normal } = frameOf(sketch);
  const xs = sketch.points.map((p) => p.x);
  const ys = sketch.points.map((p) => p.y);
  const corners = [Math.min(...xs), Math.max(...xs)].flatMap((x) => [Math.min(...ys), Math.max(...ys)].flatMap((y) => [0, depth].map((d) => [0, 1, 2].map((i) => origin[i]! + u[i]! * x + v[i]! * y + normal[i]! * d))));
  return [[0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))), [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!)))];
}

describe("caisson de cuisine aménagé", () => {
  it("devient une Répartition à sa place, avec son fond, ses étagères et ses portes ; son linéaire lui garde sa place", () => {
    const { doc, plan } = kitchen();
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 2 portes"))!;
    const fronts = doc.features.find((f) => f.type === "fronts" && f.cabinet === cabinet.id)!;
    expect(cabinetOfBody(doc, `${fronts.id}${PART_SEPARATOR}0`)?.id).toBe(cabinet.id);
    const made = withCabinetFurnished(doc, cabinet.id);
    if (typeof made === "string") throw new Error(made);
    expect(() => parseDocument(made.doc)).not.toThrow();
    // The cabinet and its fronts gone; the run keeps its place, free; the other units still made by the plan.
    expect(made.doc.features.some((f) => f.type === "cabinet" && f.name === cabinet.name)).toBe(false);
    const runs = kitchenPlanIn(made.doc, plan)!.runs!.A!;
    expect(runs[0]).toMatchObject({ model: "space", width: 800 });
    expect(runs.slice(1).map((i) => i.model)).toEqual(["base-bas-3-tiroirs", "wall-haut-1-porte"]);
    expect(kitchenRunOf(made.doc, made.sketch)).toBeNull();
    // Its box: the cabinet's, to the tenth of a millimetre (the back included).
    const [lo, hi] = caissonBox(made.doc, made.sketch);
    const back = cabinet.backThickness;
    const [clo, chi] = cabinetBox(cabinet);
    for (const i of [0, 2]) {
      expect(lo[i]).toBeCloseTo(clo[i]!, 1);
      expect(hi[i]).toBeCloseTo(chi[i]!, 1);
    }
    expect(hi[1]! - lo[1]!).toBeCloseTo(cabinet.depth - back, 1);
    expect(lo[1]).toBeCloseTo(clo[1]!, 1);
    // Its shelf, its two doors and its back.
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    expect(sketch.offsets!.filter(isShelves)).toHaveLength(cabinet.shelves > 0 ? 1 : 0);
    const equipment = made.doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch).map((f) => f.fill).sort();
    expect(equipment).toEqual(["back", "doors"]);
    // The carcass in its material.
    const boards = made.doc.features.filter((f) => f.type === "extrude" && f.sketch === made.sketch);
    expect(boards.length).toBeGreaterThanOrEqual(4);
    for (const b of boards) expect(made.doc.bodyInfo?.[b.id]?.material).toBe("melamine-white");
  });

  it("garde ses tiroirs, un meuble haut tourné vers la pièce, et refuse ce qui n'est pas un caisson", () => {
    const { doc } = kitchen();
    const drawers = doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Bas 3 tiroirs"))!;
    const made = withCabinetFurnished(doc, drawers.id);
    if (typeof made === "string") throw new Error(made);
    const equipment = made.doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === made.sketch);
    expect(equipment.find((f) => f.fill === "drawers")?.drawers).toBe(3);
    const wall = made.doc.features.find((f): f is CabinetFeature => f.type === "cabinet" && f.name.startsWith("Haut"))!;
    const high = withCabinetFurnished(made.doc, wall.id);
    if (typeof high === "string") throw new Error(high);
    expect(kitchenPlanIn(high.doc, made.doc.features.find((f) => f.type === "sketch" && f.kitchenPlan)!.id)!.runs!.A!.map((i) => i.model)).toEqual(["base-bas-2-portes", "space", "space-wall"]);
    const [lo, hi] = caissonBox(high.doc, high.sketch);
    expect(lo[2]).toBeCloseTo(wall.origin[2], 1);
    expect(hi[2]! - lo[2]!).toBeCloseTo(wall.height, 1);
    expect(withCabinetFurnished(doc, "nothing")).toMatch(/n'existe plus/);
  });
});
