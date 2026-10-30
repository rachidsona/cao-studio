/** Répartition « sans côté » : deux cases voisines ne font qu'une niche, large des deux cases plus le côté absent. */
import { describe, expect, it } from "vitest";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { partitionElements, partitionGeometry, partitionLayout, type PartitionInput, type PartitionLayout } from "../../frontend/src/sketcher/partition";

const input = (dividers: PartitionInput["dividers"]): PartitionInput => ({ length: 1800, height: 2500, thickness: 18, cases: 3, dividers, boards: true, plinth: 0, outer: "board", single: "board", double: "side" });
const layoutOf = (i: PartitionInput): PartitionLayout => {
  const l = partitionLayout(i);
  if (typeof l === "string") throw new Error(l);
  return l;
};

describe("un côté laissé de côté", () => {
  it("double puis sans côté : une case étroite, puis une niche de 2 cases + l'épaisseur du côté absent", () => {
    const l = layoutOf(input(["double", "none"]));
    // The cases keep the widths they have with a simple side: 1800 − 2 × 18 − 2 × 18 − 18 = 1710 → 570 each.
    expect(l.caseWidths).toEqual([570, 570, 570]);
    expect(l.caseSpans).toHaveLength(2);
    const [first, wide] = l.caseSpans.map(([a, b]) => b - a);
    expect(first).toBeCloseTo(570, 6);
    expect(wide).toBeCloseTo(2 * 570 + 18, 6);
    // The wide niche reaches the right side.
    expect(l.caseSpans[1]![1]).toBe(1782);
  });

  it("pas de panneau là où le côté manque : 2 extérieurs + le double", () => {
    const l = layoutOf(input(["double", "none"]));
    expect(l.kinds.filter((k) => k === "side")).toHaveLength(4);
    const names = partitionElements(l).map((e) => e.name);
    expect(names.filter((n) => n === "Côté")).toHaveLength(4);
  });

  it("chaque panneau et chaque niche restent des zones fermées", () => {
    const i = input(["double", "none"]);
    const faces = sketchFaces(extractLoops(partitionGeometry(i, layoutOf(i))));
    // Bottom and top cut by the double (2 pieces each), 4 sides, 2 niches.
    expect(faces).toHaveLength(4 + 4 + 2);
  });

  it("4 cases : simple, sans côté, simple → 3 niches, celle du milieu de 2 cases + le côté absent", () => {
    const i: PartitionInput = { ...input(["single", "none", "single"]), cases: 4 };
    const l = layoutOf(i);
    // 1800 − 2 × 18 − 3 × 18 = 1710 → 427,5 each.
    expect(l.caseSpans).toHaveLength(3);
    expect(l.caseSpans.map(([a, b]) => b - a)).toEqual([427.5, 2 * 427.5 + 18, 427.5]);
    expect(sketchFaces(extractLoops(partitionGeometry(i, l)))).toHaveLength(2 + 4 + 3);
  });

  it("5 cases : simple, double, sans côté, simple → 4 niches, n'importe quel côté peut manquer", () => {
    const i: PartitionInput = { ...input(["single", "double", "none", "single"]), cases: 5 };
    const l = layoutOf(i);
    expect(l.caseSpans).toHaveLength(4);
    const widths = l.caseSpans.map(([a, b]) => b - a);
    expect(widths[2]).toBeCloseTo(2 * widths[0]! + 18, 6);
    // 2 outer + 1 simple + 2 (double) + 1 simple: 6 side panels.
    expect(l.kinds.filter((k) => k === "side")).toHaveLength(6);
  });

  it("sans aucun côté entre les cases : une seule grande niche", () => {
    const l = layoutOf(input(["none", "none"]));
    expect(l.caseSpans).toEqual([[18, 1782]]);
  });
});
