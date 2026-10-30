/** Répartition : des cases de largeurs différentes, en proportions (1 porte + 2 portes : la seconde deux fois plus large). */
import { describe, expect, it } from "vitest";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { partitionGeometry, partitionLayout, type PartitionInput, type PartitionLayout } from "../../frontend/src/sketcher/partition";

const input = (patch: Partial<PartitionInput> = {}): PartitionInput => ({ length: 1500, height: 2400, thickness: 18, cases: 2, dividers: ["double"], boards: true, plinth: 0, outer: "board", single: "board", double: "side", ...patch });
const layoutOf = (i: PartitionInput): PartitionLayout => {
  const l = partitionLayout(i);
  if (typeof l === "string") throw new Error(l);
  return l;
};

describe("largeur des cases en proportions", () => {
  it("sans proportions, les cases sont égales", () => {
    const l = layoutOf(input());
    // 1500 − 2 × 18 (outer) − 2 × 18 (double) = 1428 → 714 each.
    expect(l.caseWidths).toEqual([714, 714]);
    expect(l.caseWidth).toBe(714);
  });

  it("1 et 2 : la seconde case est deux fois plus large, la longueur totale ne change pas", () => {
    const l = layoutOf(input({ widths: [1, 2] }));
    expect(l.caseWidths).toEqual([476, 952]);
    expect(l.caseSpans).toEqual([[18, 494], [530, 1482]]);
    expect(l.caseSpans.at(-1)![1] + 18).toBe(1500);
  });

  it("des proportions sur trois cases (1, 2, 1)", () => {
    const l = layoutOf(input({ cases: 3, dividers: ["single", "single"], widths: [1, 2, 1] }));
    // 1500 − 4 × 18 = 1428 → 357, 714, 357.
    expect(l.caseWidths).toEqual([357, 714, 357]);
  });

  it("chaque case et chaque panneau restent des zones fermées", () => {
    const i = input({ widths: [1, 2] });
    const faces = sketchFaces(extractLoops(partitionGeometry(i, layoutOf(i))));
    // Bottom and top (2 pieces each, cut by the double), 4 sides, 2 cases.
    expect(faces).toHaveLength(4 + 4 + 2);
  });

  it("refuse des proportions fausses, en le disant", () => {
    expect(partitionLayout(input({ widths: [1] }))).toMatch(/une proportion par case/);
    expect(partitionLayout(input({ widths: [1, 0] }))).toMatch(/positives/);
    expect(partitionLayout(input({ widths: [1, -2] }))).toMatch(/positives/);
  });
});
