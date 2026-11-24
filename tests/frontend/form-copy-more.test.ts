/** « Pipette de forme » au-delà d'une même sorte : portes de tout genre, corps quelconques, étagères et cloisons. */
import { describe, expect, it } from "vitest";
import { formOf, withFormCopied } from "../../frontend/src/document/form-copy";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { findFeature } from "../../frontend/src/document/operations";
import { setBodyAppearance } from "../../frontend/src/appearance/assign";
import { bodyInfo } from "../../frontend/src/document/materials";
import { withRecipe, readRecipe } from "../../frontend/src/document/niche-recipe";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenFloorPlan, type NicheFeature, type SketchFeature, type Vec3 } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { isPartition, isShelves } from "../../frontend/src/sketcher/partition-history";

const empty = (features: unknown[] = []) => ({ ...createReferencePlate(), features }) as unknown as CadDocument;
const ok = (doc: CadDocument | string): CadDocument => {
  if (typeof doc === "string") throw new Error(doc);
  return doc;
};
const glazed = (id: string, extra: Partial<NicheFeature> = {}): NicheFeature => ({ id, type: "niche", name: id, sketch: "sk1", partition: "o1", niche: [0], fill: "door", diameter: 25, drop: 60, drawers: 1, gap: 3, thickness: 18, handles: false, hinges: ["top"], style: "glass", frameWidth: 20, glass: "black", profile: "black", ...extra });

describe("pipette de forme, portes de tout genre", () => {
  it("une porte de niche relevante, vitrée, sans poignée donne tout cela à un meuble de cuisine", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "I" });
    const unit = { ...newItem([], "base-bas-1-porte", 600), id: "u1" };
    const result = withKitchenBuilt(made.doc, made.id, { runs: { A: [unit] } });
    if (typeof result === "string") throw new Error(result);
    const built = result.doc;
    const doc = { ...built, features: [...built.features, glazed("n1")] };
    const cabinet = doc.features.find((f) => f.type === "cabinet")!.id;
    const next = ok(withFormCopied(doc, formOf(doc, "n1#0")!, formOf(doc, `${cabinet}#0`)!));
    expect(kitchenPlanIn(next, made.id)!.runs!.A![0]).toMatchObject({ id: "u1", side: "top", handles: false, facade: { style: "glass", glass: "black", frameWidth: 20 } });
    // Built so: its fronts open upwards, without handles, glazed.
    expect(next.features.find((f) => f.type === "fronts")).toMatchObject({ side: "top", handles: false, style: "glass" });
  });

  it("à des façades de caisson, et des façades à une porte de niche", () => {
    const cab: CabinetFeature = { id: "c1", type: "cabinet", name: "c1", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
    const front: FrontsFeature = { id: "f1", type: "fronts", name: "f1", cabinet: "c1", layout: "door", drawers: 0, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, style: "frame", frameWidth: 60 };
    const doc = empty([cab, front, glazed("n1"), glazed("n2", { hinges: ["left"], handles: true, style: undefined, glass: undefined, profile: undefined, frameWidth: undefined })]);
    const fronts = ok(withFormCopied(doc, formOf(doc, "n1#0")!, formOf(doc, "f1#0")!));
    expect(findFeature(fronts, "f1")).toMatchObject({ layout: "door", side: "top", handles: false, style: "glass", glass: "black" });
    expect((findFeature(fronts, "f1") as FrontsFeature).frameWidth).toBe(20);
    const right = { ...doc, features: doc.features.map((f) => (f.id === "f1" ? { ...front, side: "right" as const, handles: false } : f)) };
    const niche = ok(withFormCopied(right, formOf(right, "f1#0")!, formOf(right, "n2#0")!));
    expect(findFeature(niche, "n2")).toMatchObject({ hinges: ["right"], handles: false, style: "frame", frameWidth: 60 });
  });

  it("la porte haute d'une colonne four s'ouvre comme on l'a choisi : relevante, ou sur le côté", () => {
    const column = (side?: "top" | "right"): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: [{ ...newItem([], "app-oven-column", 600), ...(side ? { side } : {}) }] } });
    const unit = (p: KitchenFloorPlan) => kitchenFromPlan(p).units.find((u) => u.name.startsWith("Colonne four"))!;
    // Its fronts: the door over the oven as chosen (left by default, lift-up, right), the one under it on a side.
    expect(unit(column())).toMatchObject({ layout: "door", rise: [1498, expect.any(Number)], more: [{ side: "left", rise: [expect.any(Number), 897] }] });
    expect(unit(column()).side).toBeUndefined();
    expect(unit(column("top"))).toMatchObject({ side: "top", more: [{ side: "left" }] });
    expect(unit(column("right"))).toMatchObject({ side: "right", more: [{ side: "right" }] });
    expect(kitchenFromPlan(column()).boxes.some((b) => /^Porte/.test(b.name))).toBe(false);
  });
});

describe("pipette de forme, corps et divisions", () => {
  it("un corps prend les cotes, la matière et l'apparence d'un autre", () => {
    const board = (id: string, sketch: string, w: number, h: number) => [
      { id: sketch, type: "sketch", name: sketch, plane: "XY", offset: 0, constraints: [], points: [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y], i) => ({ id: `${sketch}p${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `${sketch}l${i}`, kind: "line", p1: `${sketch}p${i}`, p2: `${sketch}p${(i + 1) % 4}` })) },
      { id, type: "extrude", name: id, sketch, distance: 18, operation: "new" },
    ];
    const looked = setBodyAppearance(empty([...board("e1", "s1", 800, 400), ...board("e2", "s2", 500, 300)]), ["e1"], "wood-oak");
    const doc = { ...looked, bodyInfo: { ...looked.bodyInfo, e1: { ...looked.bodyInfo?.e1, material: "solid-oak" } } };
    const boxes: Record<string, [Vec3, Vec3]> = { e1: [[0, 0, 0], [800, 400, 18]], e2: [[0, 0, 0], [500, 300, 18]] };
    expect(formOf(doc, "e2")).toMatchObject({ kind: "body", id: "e2" });
    const next = ok(withFormCopied(doc, formOf(doc, "e1")!, formOf(doc, "e2")!, [], (id) => boxes[id] ?? null));
    const corner = (findFeature(next, "s2") as SketchFeature).points.map((p) => [p.x, p.y]);
    expect(Math.max(...corner.map(([x]) => x!))).toBe(800);
    expect(Math.max(...corner.map(([, y]) => y!))).toBe(400);
    expect(bodyInfo(next, "e2")).toMatchObject({ material: "solid-oak", appearance: "wood-oak" });
    // A body is no door.
    expect(withFormCopied(doc, formOf(doc, "e1")!, { kind: "niche", id: "x", fill: "door", label: "x" })).toMatch(/corps/);
  });

  it("une étagère donne la division de sa niche à une autre niche, qu'on clique la niche ou l'une de ses étagères", () => {
    const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.sketch;
    const partition = (made.doc.features.find((f) => f.id === sketch) as SketchFeature).offsets!.find(isPartition)!.id;
    const three = { steps: [{ at: [], input: { count: 3, thickness: 18, mode: "equal" as const, fixed: 0 } }], equipment: [] };
    const doc = ok(withRecipe(made.doc, { sketch, partition, path: [0] }, three));
    const record = (doc.features.find((f) => f.id === sketch) as SketchFeature).offsets!.find(isShelves)!;
    const shelf = record.bodies![0]!;
    const from = formOf(doc, shelf)!;
    expect(from).toMatchObject({ kind: "division", place: { sketch, partition, path: [0] } });
    const next = ok(withFormCopied(doc, from, { kind: "place", place: { sketch, partition, path: [1] }, label: "la niche" }));
    expect(readRecipe(next, { sketch, partition, path: [1] }).steps).toEqual(three.steps);
    // To another shelf: its thickness only (with its material and look) — the number of shelves there stays.
    const thick = ok(withRecipe(next, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 2, thickness: 30, mode: "equal" as const, fixed: 0 } }], equipment: [] }));
    const other = (thick.features.find((f) => f.id === sketch) as SketchFeature).offsets!.filter(isShelves).find((r) => r.step.niche[0] === 1)!;
    const shelved = ok(withFormCopied(thick, from, formOf(thick, other.bodies![0]!)!));
    expect(readRecipe(shelved, { sketch, partition, path: [1] }).steps[0]!.input).toMatchObject({ count: 2, thickness: 18 });
    expect(readRecipe(shelved, { sketch, partition, path: [0] }).steps).toEqual(three.steps);
    // Its own niche: another one is asked for.
    expect(withFormCopied(doc, from, { kind: "place", place: { sketch, partition, path: [0] }, label: "la niche" })).toMatch(/autre/);
  });
});
