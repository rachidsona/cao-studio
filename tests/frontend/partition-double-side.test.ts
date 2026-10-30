/** Répartition en 3 cases : trois niches égales, le côté double à droite ou à gauche (2 portes + 1, ou 1 + 2). */
import { describe, expect, it } from "vitest";
import { defaultDividers, partitionLayout, type PartitionInput } from "../../frontend/src/sketcher/partition";

const input = (dividers: PartitionInput["dividers"]): PartitionInput => ({ length: 1800, height: 2500, thickness: 18, cases: 3, dividers, boards: true, plinth: 0, outer: "board", single: "board", double: "side" });

describe("3 cases : où va le côté double", () => {
  it("à droite par défaut (simple puis double), à gauche sur demande (double puis simple)", () => {
    expect(defaultDividers(3)).toEqual(["single", "double"]);
    expect(defaultDividers(3, "right")).toEqual(["single", "double"]);
    expect(defaultDividers(3, "left")).toEqual(["double", "single"]);
  });

  it("dans les deux cas, les trois niches ont la même largeur", () => {
    for (const side of ["left", "right"] as const) {
      const layout = partitionLayout(input(defaultDividers(3, side)));
      if (typeof layout === "string") throw new Error(layout);
      const widths = layout.caseSpans.map(([a, b]) => b - a);
      expect(widths[1]).toBeCloseTo(widths[0]!, 6);
      expect(widths[2]).toBeCloseTo(widths[0]!, 6);
      // 1800 − 2 outer − 1 simple − 2 double = 1800 − 5 × 18 = 1710 → 570 each.
      expect(widths[0]).toBeCloseTo(570, 6);
    }
  });

  it("le côté double est entre les cases 1 et 2 à gauche, entre les cases 2 et 3 à droite", () => {
    const sides = (dividers: PartitionInput["dividers"]) => {
      const layout = partitionLayout(input(dividers));
      if (typeof layout === "string") throw new Error(layout);
      // The side panels between the cases, left to right, as runs of adjacent panels (a double = two panels back to back).
      const inner = layout.panels.filter((_, i) => layout.kinds[i] === "side").map((r) => r[0]).sort((a, b) => a - b).slice(1, -1);
      return inner;
    };
    const left = sides(defaultDividers(3, "left"));
    const right = sides(defaultDividers(3, "right"));
    // Left: two panels right after case 1 (x = 588 and 606), one after case 2; right: the reverse.
    expect(left).toEqual([588, 606, 1194]);
    expect(right).toEqual([588, 1176, 1194]);
  });
});
