/** Le menu d'une porte : son sens, sa poignée, la retirer, la changer — pour un caisson, une Répartition, une porte d'angle. */
import { describe, expect, it } from "vitest";
import { doorOf, withDoorFlipped, withDoorHandles, withDoorRemoved, withDoorStyle } from "../../frontend/src/document/door-edit";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { frontsParts } from "../../frontend/src/features/fronts-parts";
import { nicheGeometry, nicheParts } from "../../frontend/src/features/niche-parts";
import { parseDocument } from "../../frontend/src/document/validate";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { proposeKitchen } from "../../frontend/src/document/kitchen-propose";

const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 8, shelves: 1, plinth: 150, construction: "sides-through" };
const fronts = (layout: FrontsFeature["layout"]): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "c1", layout, drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true });
const model = (f: FrontsFeature): CadDocument => ({ ...createReferencePlate(), features: [cabinet, f] });
const doc = (r: CadDocument | string) => {
  if (typeof r === "string") throw new Error(r);
  return r;
};

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 4, dividers: ["single", "single", "single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
function partition(doors: DoorSettings): CadDocument {
  const record = partitionRecord("of1", "Répartition 4 cases", INPUT, [0, 0], 400);
  const step = record.step!.kind === "partition" ? { ...record.step!, doors } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const s: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
  return syncPartitionDoors({ ...createReferencePlate(), features: [s] }, "sk1");
}
const doorsOf = (d: CadDocument) => d.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "doors")!;
const handles = (d: CadDocument) => {
  const f = doorsOf(d);
  const n = nicheGeometry(f, d.features[0] as SketchFeature);
  if (typeof n === "string") throw new Error(n);
  return nicheParts(f, n).filter((p) => p.name.startsWith("Porte")).map((p) => p.handle);
};

describe("le menu d'une porte", () => {
  it("la porte d'un caisson s'ouvre de l'autre côté, perd ses poignées, devient tiroirs, se supprime", () => {
    const d = model(fronts("door"));
    expect(doorOf(d, "fr1#0")).toMatchObject({ kind: "fronts", hinge: "left", handles: true });
    const flipped = doc(withDoorFlipped(d, "fr1#0"));
    expect(frontsParts(flipped.features[1] as FrontsFeature, cabinet)[0]!.role).toEqual({ kind: "door", hinge: "right" });
    expect(doorOf(doc(withDoorFlipped(flipped, "fr1#0")), "fr1#0")!.hinge).toBe("left");
    expect(() => parseDocument(JSON.parse(JSON.stringify(flipped)))).not.toThrow();
    expect((doc(withDoorHandles(d, "fr1#0")).features[1] as FrontsFeature).handles).toBe(false);
    expect((doc(withDoorStyle(d, "fr1#0")).features[1] as FrontsFeature).layout).toBe("drawers");
    expect(doc(withDoorRemoved(d, "fr1#0")).features.some((f) => f.type === "fronts")).toBe(false);
    // Two doors: they open from the middle already; one of them taken out alone.
    const two = model(fronts("doors"));
    expect(typeof withDoorFlipped(two, "fr1#1")).toBe("string");
    expect(doc(withDoorRemoved(two, "fr1#1")).removedBodies).toEqual(["fr1#1"]);
    // Drawers are no door.
    expect(doorOf(model(fronts("drawers")), "fr1#0")).toBeNull();
  });

  it("une porte de Répartition, prise par elle ou sa poignée : son sens seul change, sa case reste ouverte si on la supprime", () => {
    const d = partition({ gap: 4, thickness: 19, handles: true });
    const id = doorsOf(d).id;
    expect(handles(d)).toEqual(["right", "left", "right", "left"]);
    // Door 2, by its handle (parts: 4 doors, then 4 handles).
    expect(doorOf(d, `${id}#5`)).toMatchObject({ kind: "partition", index: 1, hinge: "right" });
    const flipped = doc(withDoorFlipped(d, `${id}#5`));
    expect(handles(flipped)).toEqual(["right", "right", "right", "left"]);
    const removed = doc(withDoorRemoved(d, `${id}#1`));
    expect(handles(removed)).toHaveLength(3);
    expect(doorsOf(doc(withDoorHandles(d, `${id}#0`))).handles).toBe(false);
    expect(doorsOf(doc(withDoorStyle(d, `${id}#0`))).style).toBe("frame");
  });

  it("la porte d'un meuble d'angle s'ouvre de l'autre côté, et se retire", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "U", lengthA: 3600, corners: { left: "unit" }, runs: {}, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, proposeKitchen(kitchenPlanIn(base.doc, base.id)!));
    if (typeof built === "string") throw new Error(built);
    const made = built.doc;
    const door = made.features.find((f) => f.type === "extrude" && f.name.startsWith("Porte d'angle"))!;
    expect(doorOf(made, door.id)).toMatchObject({ kind: "board" });
    const flipped = doc(withDoorFlipped(made, door.id)).features.find((f) => f.id === door.id)!;
    expect(flipped.type === "extrude" && door.type === "extrude" && flipped.door!.hinge.map((c) => -c + 0)).toEqual(door.type === "extrude" ? door.door!.hinge.map((c) => c + 0) : null);
    expect(doc(withDoorRemoved(made, door.id)).removedBodies).toEqual([door.id]);
    expect(doorOf(made, made.features.find((f) => f.name.startsWith("Panneau d'angle"))!.id)).toBeNull();
  });
});

describe("le sens d'une porte de cuisine", () => {
  it("tourné dans la 3D, le Plan de cuisine le garde : la cuisine refaite le remet", async () => {
    const { syncKitchenPlans } = await import("../../frontend/src/document/kitchen-sync");
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: { A: [{ id: "i1", model: "base-bas-1-porte", width: 600 }] }, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, {});
    if (typeof built === "string") throw new Error(built);
    const fr = built.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.layout === "door")!;
    const flipped = doc(withDoorFlipped(built.doc, `${fr.id}#0`));
    const synced = syncKitchenPlans(built.doc, flipped);
    expect(kitchenPlanIn(synced, base.id)!.runs!.A![0]!.side).toBe("right");
    // Made again (an OK in a run): still on the right.
    const again = withKitchenBuilt(synced, base.id, {});
    if (typeof again === "string") throw new Error(again);
    expect(again.doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.layout === "door")!.side).toBe("right");
  });
});
