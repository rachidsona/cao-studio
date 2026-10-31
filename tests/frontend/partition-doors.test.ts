/** Les portes d'une répartition : une par case, à la mesure de ses côtés et séparations, tenues à jour avec l'étape. */
import { describe, expect, it } from "vitest";
import { doorSwing, doorWithHandle } from "../../frontend/src/app/drawer-toggle";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { poseOf } from "../../frontend/src/features/motion";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { emptySketchGeometry, type BackSettings, type DoorSettings, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { nicheGeometry, nicheHardware, nicheParts, partitionBacks, partitionDoors } from "../../frontend/src/features/niche-parts";
import { parseDocument } from "../../frontend/src/document/validate";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

// 4 cases of 1000 mm altogether (18 mm panels): simple · double · sans côté.
const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 4, dividers: ["single", "double", "none"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
const DOORS: DoorSettings = { gap: 4, thickness: 19, handles: true };

function sketch(doors: DoorSettings | null, depth: number | null = 400, back?: BackSettings): SketchFeature {
  const record = partitionRecord("of1", "Répartition 4 cases", INPUT, [0, 0], depth ?? undefined);
  const step = record.step!.kind === "partition" ? { ...record.step!, ...(doors ? { doors } : {}), ...(back ? { back } : {}) } : record.step!;
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}
const doc = (s: SketchFeature): CadDocument => ({ ...createReferencePlate(), features: [s] });
const doorsOf = (d: CadDocument) => d.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "doors");

describe("portes d'une répartition", () => {
  it("une porte par case ; elle couvre le côté extérieur et son côté double en entier, la moitié d'un côté simple ; des cases sans côté n'en ont qu'une", () => {
    const doors = partitionDoors(INPUT, [0, 0], 4);
    if (typeof doors === "string") throw new Error(doors);
    // Free length 1000 − 2×18 − 18 − 2×18 − 18 (the place of the missing side joins its niche) = 892 over 4 cases.
    expect(doors).toHaveLength(3);
    const [first, second, third] = doors as [[number, number, number, number], [number, number, number, number], [number, number, number, number]];
    expect(first[0]).toBe(2); // the outer side covered, 2 mm in
    expect(first[2] + 4 / 2).toBeCloseTo(18 + 223 + 9); // half the simple side
    expect(second[0] - 4 / 2).toBeCloseTo(18 + 223 + 9); // the other half
    expect(second[2] + 2).toBeCloseTo(18 + 223 + 18 + 223 + 18); // its own panel of the double side, whole
    expect(third[0] - 2).toBeCloseTo(18 + 223 + 18 + 223 + 18); // the other panel, whole
    expect(third[2]).toBe(998); // over the outer side, 2 mm in
    expect([first[1], first[3]]).toEqual([2, 1998]); // over the top and the bottom
  });

  it("cochées dans l'étape, les portes deviennent un équipement en avant des panneaux, avec leurs charnières", () => {
    const d = syncPartitionDoors(doc(sketch(DOORS)), "sk1");
    const [doors] = doorsOf(d);
    expect(doors).toMatchObject({ partition: "of1", fill: "doors", gap: 4, thickness: 19, handles: true });
    const n = nicheGeometry(doors!, d.features[0] as SketchFeature);
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(doors!, n);
    expect(parts.map((p) => p.name)).toEqual(["Porte 1", "Porte 2", "Porte 3", "Poignée porte 1", "Poignée porte 2", "Poignée porte 3"]);
    expect([parts[0]!.from[2], parts[0]!.to[2]]).toEqual([400, 419]);
    expect(parts.slice(0, 3).map((p) => p.handle)).toEqual(["right", "left", "right"]);
    // A handle stands on its door's front face, 40 mm in from the edge opposite the hinges, 128 mm long.
    expect(parts[3]).toMatchObject({ kind: "handle", role: "hardware", of: 0 });
    expect([parts[3]!.from[0], parts[3]!.from[2], parts[3]!.to[1] - parts[3]!.from[1]]).toEqual([parts[0]!.to[0] - 40, 419, 128]);
    // 1996 mm high: 4 hinges each.
    expect(nicheHardware(d.features, doors!)).toEqual([{ name: "Charnière à boîtier Ø35", quantity: 12 }, { name: "Poignée entraxe 128 mm", quantity: 3 }]);
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it("réglées, puis retirées quand on les décoche ou qu'on n'extrude plus ; une seule par répartition", () => {
    const made = syncPartitionDoors(doc(sketch(DOORS)), "sk1");
    expect(doorsOf(syncPartitionDoors(made, "sk1"))).toHaveLength(1);
    const changed = withSketchExtrusion(made, "sk1", sketch({ ...DOORS, gap: 2 }));
    expect(doorsOf(changed).map((f) => [f.id, f.gap])).toEqual([[doorsOf(made)[0]!.id, 2]]);
    expect(doorsOf(withSketchExtrusion(made, "sk1", sketch(null)))).toHaveLength(0);
    expect(doorsOf(withSketchExtrusion(made, "sk1", sketch(DOORS, null)))).toHaveLength(0);
  });

  it("le sens d'ouverture choisi pour chaque porte ; un clic la fait tourner vers l'avant autour de ses charnières", () => {
    const d = syncPartitionDoors(doc(sketch({ ...DOORS, hinges: ["right", "right"] })), "sk1");
    const [doors] = doorsOf(d);
    const n = nicheGeometry(doors!, d.features[0] as SketchFeature);
    if (typeof n === "string") throw new Error(n);
    // Doors 1 and 2 chosen hinged on the right (their handle on the left), door 3 in turn: on the left.
    expect(nicheParts(doors!, n).slice(0, 3).map((p) => p.handle)).toEqual(["left", "left", "right"]);
    // A click on the handle swings its door, the door and its handle together.
    expect(doorSwing(d, `${doors!.id}#3`)).toEqual(doorSwing(d, `${doors!.id}#0`));
    expect(doorWithHandle(d, `${doors!.id}#3`)).toEqual([`${doors!.id}#0`, `${doors!.id}#3`]);
    const swing = doorSwing(d, `${doors!.id}#0`)!;
    const part = nicheParts(doors!, n)[0]!;
    // The front plane: the sketch's x is x, its y is z, the depth goes along −Y; hinges on the right edge, at the front.
    expect(swing.axis).toBe(2);
    expect(swing.pivot).toEqual([part.to[0], -419, (part.from[1] + part.to[1]) / 2]);
    // The free (left) edge comes out to the front (towards −Y).
    const { rotation: r, translation: t } = poseOf({ kind: "hinge", ...swing });
    const free = [part.from[0], -419, 1000];
    const y = r[3]! * free[0]! + r[4]! * free[1]! + r[5]! * free[2]! + t[1];
    expect(y).toBeLessThan(-419 - 100);
    expect(doorSwing(d, "sk1")).toBeNull();
  });
});

describe("fond d'une répartition", () => {
  const backOf = (d: CadDocument) => d.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "back");

  it("un seul fond derrière tout le placard, posé sur le dessus, le dessous et les côtés ; en HDF s'il est mince", () => {
    const d = syncPartitionDoors(doc(sketch(null, 400, { thickness: 8, split: "whole" })), "sk1");
    const [back] = backOf(d);
    expect(back).toMatchObject({ partition: "of1", fill: "back", thickness: 8, split: "whole" });
    const n = nicheGeometry(back!, d.features[0] as SketchFeature);
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(back!, n);
    expect(parts.map((p) => [p.name, p.from, p.to])).toEqual([["Fond", [0, 0, -8], [1000, 2000, 0]]]);
    expect(nicheHardware(d.features, back!)).toEqual([]);
    expect(d.bodyInfo?.[`${back!.id}#0`]?.material).toBe("hdf");
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it("un fond par case suit les côtés comme les portes ; réglé puis retiré avec l'étape", () => {
    const backs = partitionBacks(INPUT, [0, 0], "cases");
    if (typeof backs === "string") throw new Error(backs);
    expect(backs[0]).toEqual([0, 18 + 223 + 9]);
    expect(backs[1]![0]).toBeCloseTo(18 + 223 + 9);
    expect(backs.at(-1)![1]).toBe(1000);
    const made = syncPartitionDoors(doc(sketch(DOORS, 400, { thickness: 18, split: "cases" })), "sk1");
    expect(backOf(made)).toHaveLength(1);
    expect(doorsOf(made)).toHaveLength(1);
    const thick = backOf(made)[0]!;
    expect(made.bodyInfo?.[`${thick.id}#0`]?.material).toBeUndefined();
    const changed = withSketchExtrusion(made, "sk1", sketch(DOORS, 400, { thickness: 18, split: "whole" }));
    expect(backOf(changed).map((f) => [f.id, f.split])).toEqual([[thick.id, "whole"]]);
    expect(backOf(withSketchExtrusion(made, "sk1", sketch(DOORS)))).toHaveLength(0);
    expect(doorsOf(withSketchExtrusion(made, "sk1", sketch(DOORS)))).toHaveLength(1);
  });
});
