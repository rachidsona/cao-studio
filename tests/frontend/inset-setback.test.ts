/** Portes encastrées : les étagères qu'elles ferment reculent de leur épaisseur, dans un caisson comme dans une Répartition ; les tiroirs d'un caisson réglés par le clic droit. */
import { describe, expect, it } from "vitest";
import { drawersOf, withDrawersAsDoor, withDrawersChanged, withDrawersRemoved } from "../../frontend/src/document/drawer-edit";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CabinetFeature, type CadDocument, type ExtrudeFeature, type FrontsFeature, type NicheFeature } from "../../frontend/src/document/types";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import { stampInsetSetbacks } from "../../frontend/src/features/inset-setback";
import { kernelDocument } from "../../frontend/src/geometry/client";
import { extrusionGroups, partitionRecord, rebuildChain, shelvesRecord } from "../../frontend/src/sketcher/partition-history";

const CABINET: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
const FRONTS: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "inset", gap: 3, thickness: 19, hinges: true, handles: true };
const doc = (...features: CadDocument["features"]): CadDocument => ({ ...createReferencePlate(), features });
const shelfDepth = (d: CadDocument) => {
  const cabinet = d.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
  const shelf = cabinetParts(cabinet).find((p) => p.name === "Étagère 1")!;
  return [shelf.from[1], shelf.to[1]];
};

describe("caisson aux façades encastrées", () => {
  it("ses étagères reculent de l'épaisseur des façades ; en applique, elles vont jusqu'au devant", () => {
    expect(shelfDepth(stampInsetSetbacks(doc(CABINET, FRONTS)))).toEqual([19, 557]);
    expect(shelfDepth(stampInsetSetbacks(doc(CABINET, { ...FRONTS, mount: "overlay" })))).toEqual([0, 557]);
    expect(shelfDepth(stampInsetSetbacks(doc(CABINET, { ...FRONTS, suppressed: true })))).toEqual([0, 557]);
    // For the kernel only: the document keeps its cabinet as it is.
    const kept = doc(CABINET, FRONTS);
    expect(kept.features[0]).not.toHaveProperty("shelfSetback");
    expect(shelfDepth(kernelDocument(kept))).toEqual([19, 557]);
  });
});

describe("Répartition, porte encastrée sur une case", () => {
  const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
  /** Two cases 400 deep, the first one divided by 3 shelves, extruded into boards; its door covers its 4 niches. */
  const partition = (): CadDocument => {
    const records = [partitionRecord("of1", "Répartition", INPUT, [0, 0], 400), shelvesRecord("of2", "Étagères 1", "of1", [0], { count: 3, thickness: 18, mode: "equal", fixed: 0 }, 400)];
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: records }, "of1");
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const base = doc({ id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...emptySketchGeometry() });
    return withSketchExtrusion(base, "sk1", rebuilt.geometry, { groups: extrusionGroups([], rebuilt) });
  };
  const door = (patch: Partial<NicheFeature> = {}): NicheFeature =>
    ({ id: "pn1", type: "niche", name: "Porte 1", sketch: "sk1", partition: "of1", niche: [0, 0], span: [[0, 1], [0, 2], [0, 3]], fill: "door", diameter: 25, drop: 60, drawers: 1, gap: 4, thickness: 19, handles: true, mount: "inset", ...patch }) as NicheFeature;
  const depths = (d: CadDocument) => Object.fromEntries(d.features.filter((f): f is ExtrudeFeature => f.type === "extrude").map((f) => [f.name, f.distance]));

  it("les étagères de la case raccourcissent de l'épaisseur de la porte, rien d'autre", () => {
    const made = partition();
    const before = depths(made);
    const after = depths(stampInsetSetbacks({ ...made, features: [...made.features, door()] }));
    const shelves = Object.keys(before).filter((name) => name.startsWith("Étagère"));
    expect(shelves.length).toBe(3);
    for (const name of shelves) expect(after[name]).toBe(381);
    for (const name of Object.keys(before).filter((n) => !n.startsWith("Étagère"))) expect(after[name]).toBe(400);
    // In applique, or on the other case: nothing changes.
    expect(depths(stampInsetSetbacks({ ...made, features: [...made.features, door({ mount: "overlay" })] }))).toEqual(before);
    expect(depths(stampInsetSetbacks({ ...made, features: [...made.features, door({ niche: [1], span: [] })] }))).toEqual(before);
  });
});

describe("tiroirs d'un caisson, par le clic droit", () => {
  const drawers: FrontsFeature = { ...FRONTS, layout: "drawers", mount: "overlay" };
  const made = doc(CABINET, drawers);

  it("se reconnaissent par n'importe laquelle de leurs pièces, pas les portes", () => {
    expect(drawersOf(made, "fr1#0")).toEqual({ kind: "fronts", feature: "fr1" });
    expect(drawersOf(made, "fr1#5")).toEqual({ kind: "fronts", feature: "fr1" });
    expect(drawersOf(doc(CABINET, FRONTS), "fr1#0")).toBeNull();
    expect(drawersOf(made, "cb1#0")).toBeNull();
  });

  it("se règlent, refusent l'impossible, deviennent une porte ou s'en vont", () => {
    const four = withDrawersChanged(made, "fr1", { drawers: 4, mount: "inset" });
    if (typeof four === "string") throw new Error(four);
    expect(four.features[1]).toMatchObject({ drawers: 4, mount: "inset" });
    expect(withDrawersChanged(made, "fr1", { gap: -2 })).toMatch(/jeu/i);
    const door = withDrawersAsDoor(made, "fr1");
    if (typeof door === "string") throw new Error(door);
    expect(door.features[1]).toMatchObject({ layout: "door" });
    expect(withDrawersRemoved(made, "fr1").features.map((f) => f.id)).toEqual(["cb1"]);
  });
});
