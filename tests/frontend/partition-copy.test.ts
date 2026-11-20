/** « Pipette de forme » d'une Répartition à une autre : son organisation, à ses propres cotes (document/partition-copy.ts). */
import { describe, expect, it } from "vitest";
import { withCaissonPlaced, type CaissonSpec } from "../../frontend/src/document/caisson-spec";
import { formOf, withFormCopied } from "../../frontend/src/document/form-copy";
import { readRecipe } from "../../frontend/src/document/niche-recipe";
import { createReferencePlate, type CadDocument, type PlaneFrame, type SketchFeature } from "../../frontend/src/document/types";
import { isPartition, isShelves } from "../../frontend/src/sketcher/partition-history";

const ok = <T,>(v: T | string): T => {
  if (typeof v === "string") throw new Error(v);
  return v;
};
const frame = (x: number): PlaneFrame => ({ origin: [x, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] });
const shelves = (count: number) => ({ steps: [{ at: [], input: { count, thickness: 22, mode: "equal" as const, fixed: 0 } }], equipment: [] });
const SMALL: CaissonSpec = {
  input: { length: 3900, height: 900, thickness: 40, cases: 3, dividers: ["single", "single"], boards: true, plinth: 40, outer: "board", single: "board", double: "side" },
  depth: 500,
  cases: [shelves(1), shelves(1), shelves(1)],
};
const TALL: CaissonSpec = {
  input: { length: 1900, height: 2638, thickness: 18, cases: 2, dividers: ["none"], boards: true, plinth: 0, outer: "side", single: "side", double: "side" },
  depth: 400,
  cases: [shelves(5)],
};
const sketchOf = (doc: CadDocument, id: string) => doc.features.find((f) => f.id === id) as SketchFeature;

describe("organisation d'une Répartition donnée à une autre", () => {
  it("la grande prend les cases, l'épaisseur, le socle et les étagères de la petite, et garde ses cotes", () => {
    const a = ok(withCaissonPlaced(createReferencePlate(), SMALL, { frame: frame(0), width: 3900, height: 900, name: "Petite" }));
    const b = ok(withCaissonPlaced(a.doc, TALL, { frame: frame(5000), width: 1900, height: 2638, name: "Grande" }));
    const doc = b.doc;
    // A side of each one stands for the whole of it.
    const sideOf = (sketch: string) => sketchOf(doc, sketch).offsets!.find(isPartition)!.bodies![0]!;
    const from = formOf(doc, sideOf(a.sketch))!;
    const to = formOf(doc, sideOf(b.sketch))!;
    expect(from).toMatchObject({ kind: "partition", sketch: a.sketch });
    const next = ok(withFormCopied(doc, from, to));
    const g = sketchOf(next, b.sketch);
    const step = g.offsets!.find(isPartition)!.step;
    expect(step.input).toMatchObject({ length: 1900, height: 2638, thickness: 40, cases: 3, dividers: ["single", "single"], plinth: 40, outer: "board" });
    // Its own depth and place stay.
    expect([step.depth, g.frame?.origin[0]]).toEqual([400, 5000]);
    // One shelf in each of its three cases, its five shelves gone.
    const partition = g.offsets!.find(isPartition)!.id;
    expect([0, 1, 2].map((k) => readRecipe(next, { sketch: b.sketch, partition, path: [k] }).steps.map((s) => s.input.count))).toEqual([[1], [1], [1]]);
    expect(g.offsets!.filter(isShelves)).toHaveLength(3);
    // The small one is as it was; itself, another one is asked for.
    expect(sketchOf(next, a.sketch).offsets).toEqual(sketchOf(doc, a.sketch).offsets);
    expect(withFormCopied(doc, from, from)).toMatch(/autre/);
  });
});
