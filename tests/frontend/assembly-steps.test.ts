/** Notice de montage : étapes dans l'ordre du montage, quincaillerie de chaque étape, direction de l'éclaté. */
import { describe, expect, it } from "vitest";
import { assemblySteps, explodeDirection, stepOf, unionBox, type Box } from "../../frontend/src/document/assembly-steps";
import { syncPartitionDoors } from "../../frontend/src/document/partition-doors";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function furniture(): CadDocument {
  const record = partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400);
  const step = { ...record.step!, doors: { gap: 3, thickness: 18, handles: true }, back: { thickness: 8, split: "whole" as const } };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
  return syncPartitionDoors({ ...createReferencePlate(), features: [sketch] }, "sk1");
}

describe("notice de montage", () => {
  it("range les pièces dans l'ordre du montage, avec la quincaillerie de chaque étape", () => {
    const doc = furniture();
    const doors = doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "doors")!;
    const back = doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "back")!;
    expect(stepOf(doc, `${doors.id}#0`)).toBe("doors");
    expect(stepOf(doc, `${back.id}#0`)).toBe("back");
    const steps = assemblySteps(doc, [`${doors.id}#1`, `${doors.id}#0`, `${back.id}#0`, "inconnu"]);
    expect(steps.map((s) => s.kind)).toEqual(["back", "doors", "other"]);
    expect(steps[1]!.bodies).toEqual([`${doors.id}#1`, `${doors.id}#0`]);
    // Two doors 1997 mm high: hinges and handles go with the doors.
    expect(steps[1]!.hardware.map((h) => h.name)).toEqual(["Charnière à boîtier Ø35", "Poignée entraxe 128 mm"]);
    expect(steps[0]!.hardware).toEqual([]);
  });

  it("écarte chaque pièce le long de l'axe où elle dépasse le plus, et une pièce du milieu vers l'œil", () => {
    const model: Box = [[0, -400, 0], [1000, 0, 2000]];
    const left: Box = [[0, -400, 0], [18, 0, 2000]];
    const top: Box = [[0, -400, 1982], [1000, 0, 2000]];
    const door: Box = [[0, -418, 0], [500, -400, 2000]];
    const shelf: Box = [[18, -400, 900], [982, 0, 918]];
    const eye: [number, number, number] = [0.5, -2, 1];
    expect(explodeDirection(left, model, eye)).toEqual([-1, 0, 0]);
    expect(explodeDirection(top, model, eye)).toEqual([0, 0, 1]);
    expect(explodeDirection(door, model, eye)).toEqual([0, -1, 0]);
    const d = explodeDirection(shelf, model, eye);
    expect(Math.hypot(...d)).toBeCloseTo(1, 9);
    expect(d[1]).toBeLessThan(0);
    expect(unionBox([left, door, top])).toEqual([[0, -418, 0], [1000, 0, 2000]]);
  });
});
