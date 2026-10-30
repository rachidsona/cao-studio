/** Répartition « d'onglet » : le dessus (et le dessous sans socle) rejoint chaque côté extérieur sur la diagonale à 45°. */
import { describe, expect, it } from "vitest";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { defaultDividers, partitionElements, partitionGeometry, partitionLayout, type PartitionInput, type PartitionLayout } from "../../frontend/src/sketcher/partition";
import { regionAt } from "../../frontend/src/sketcher/region-pick";

const input = (patch: Partial<PartitionInput> = {}): PartitionInput => ({ length: 2000, height: 500, thickness: 50, cases: 3, dividers: defaultDividers(3), boards: true, plinth: 0, outer: "miter", single: "board", double: "side", ...patch });
const layoutOf = (i: PartitionInput): PartitionLayout => {
  const l = partitionLayout(i);
  if (typeof l === "string") throw new Error(l);
  return l;
};
const area = (poly: [number, number][]) => Math.abs(poly.reduce((s, [x, y], k) => {
  const [x2, y2] = poly[(k + 1) % poly.length]!;
  return s + x * y2 - x2 * y;
}, 0)) / 2;

describe("assemblage d'onglet aux angles extérieurs", () => {
  it("sans socle : quatre angles coupés, en haut et en bas, de chaque côté", () => {
    const l = layoutOf(input());
    expect(l.miters).toEqual([
      [[0, 500], [50, 450]],
      [[0, 0], [50, 50]],
      [[2000, 500], [1950, 450]],
      [[2000, 0], [1950, 50]],
    ]);
  });

  it("avec un socle : seulement en haut (le côté descend jusqu'au sol)", () => {
    expect(layoutOf(input({ plinth: 40 })).miters).toHaveLength(2);
  });

  it("les autres choix ne coupent aucun angle", () => {
    expect(layoutOf(input({ outer: "board" })).miters).toEqual([]);
    expect(layoutOf(input({ outer: "side" })).miters).toEqual([]);
  });

  it("le dessus prend le triangle du haut de l'angle, le côté celui du bas, à 45°", () => {
    const l = layoutOf(input());
    const faces = sketchFaces(extractLoops(partitionGeometry(input(), l)));
    const elements = partitionElements(l);
    const top = regionAt(faces, elements.find((e) => e.name.startsWith("Dessus"))!.probe)!;
    const side = regionAt(faces, elements.find((e) => e.name === "Côté")!.probe)!;
    // The top reaches the outer corner; the side stops at the diagonal.
    expect(top.outer.some(([x, y]) => x === 0 && y === 500)).toBe(true);
    expect(side.outer.some(([x, y]) => x === 50 && y === 450)).toBe(true);
    expect(side.outer.some(([x, y]) => x === 50 && y === 500)).toBe(false);
    // A side of 50 × 500 loses two triangles of 50 × 50 / 2.
    expect(area(side.outer)).toBeCloseTo(50 * 500 - 2 * 1250, 6);
  });

  it("chaque panneau reste une zone fermée à part, et le tout couvre le rectangle", () => {
    const i = input();
    const l = layoutOf(i);
    const faces = sketchFaces(extractLoops(partitionGeometry(i, l)));
    const regions = partitionElements(l).map((e) => regionAt(faces, e.probe));
    expect(regions.every((r) => r !== null)).toBe(true);
    expect(new Set(regions).size).toBe(regions.length);
    const niches = l.caseSpans.reduce((s, [a, b]) => s + (b - a) * (l.inner[1] - l.inner[0]), 0);
    const panels = regions.reduce((s, r) => s + area(r!.outer), 0);
    expect(panels + niches).toBeCloseTo(2000 * 500, 4);
  });
});
