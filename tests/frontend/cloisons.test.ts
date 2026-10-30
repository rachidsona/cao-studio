/** « Cloisons » : une niche divisée de gauche à droite par des panneaux debout, comme Étagères l'est de bas en haut. */
import { describe, expect, it } from "vitest";
import type { OffsetRecord, SketchGeometry } from "../../frontend/src/document/sketch";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { defaultDividers, type PartitionInput } from "../../frontend/src/sketcher/partition";
import { partitionRecord, rebuildChain, shelvesRecord, type Rebuilt } from "../../frontend/src/sketcher/partition-history";
import { partBox, shelfLayout, shelfLines, type ShelfInput } from "../../frontend/src/sketcher/shelves";

const BOX = { x0: 0, y0: 0, x1: 1000, y1: 500 };
const cloisons = (patch: Partial<ShelfInput> = {}): ShelfInput => ({ count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true, ...patch });
const layoutOf = (patch: Partial<ShelfInput> = {}) => {
  const layout = shelfLayout(BOX, cloisons(patch));
  if (typeof layout === "string") throw new Error(layout);
  return layout;
};

describe("répartition de la largeur d'une niche", () => {
  it("2 cloisons de 18 mm dans 1000 mm : 3 niches égales, de gauche à droite", () => {
    const { niches, shelves, vertical } = layoutOf({ count: 2 });
    expect(vertical).toBe(true);
    expect(niches).toHaveLength(3);
    for (const [a, b] of niches) expect(b - a).toBeCloseTo(321.333333, 5);
    expect(shelves).toHaveLength(2);
    expect(niches.at(-1)?.[1]).toBe(1000);
  });

  it("la niche de gauche fixe (mode « bottom »), ou celle de droite (« top »)", () => {
    expect(layoutOf({ mode: "bottom", fixed: 400 }).niches[0]).toEqual([0, 400]);
    expect(layoutOf({ mode: "top", fixed: 250 }).niches.at(-1)).toEqual([750, 1000]);
  });

  it("deux traits debout par cloison, du bas au haut de la niche", () => {
    // 1000 − 18 = 982 → 491 on each side of the cloison.
    expect(shelfLines(BOX, layoutOf())).toEqual([[[491, 0], [491, 500]], [[509, 0], [509, 500]]]);
  });

  it("les boîtes des niches et des cloisons", () => {
    const layout = layoutOf();
    expect(partBox(BOX, layout.shelves[0]!, layout)).toEqual({ x0: 491, x1: 509, y0: 0, y1: 500 });
    expect(partBox(BOX, layout.niches[1]!, layout)).toEqual({ x0: 509, x1: 1000, y0: 0, y1: 500 });
  });

  it("refuse ce qui est impossible, avec les mots des cloisons", () => {
    expect(shelfLayout(BOX, cloisons({ count: 0 }))).toMatch(/cloisons va de 1/);
    expect(shelfLayout({ ...BOX, x1: 30 }, cloisons({ count: 2 }))).toMatch(/toute la largeur/);
  });
});

describe("cloisons dans l'historique de la répartition", () => {
  const input: PartitionInput = { length: 1800, height: 2500, thickness: 18, cases: 3, dividers: defaultDividers(3), boards: true, plinth: 0, outer: "board", single: "board", double: "side" };
  const rebuilt = (records: OffsetRecord[]): Rebuilt => {
    const r = rebuildChain({ points: [], curves: [], constraints: [], offsets: records } as SketchGeometry, "of1");
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  const faces = (g: SketchGeometry) => sketchFaces(extractLoops(g)).length;
  const base = () => partitionRecord("of1", "Répartition", input, [0, 0]);

  it("une cloison coupe une case en 2 niches côte à côte : 2 zones de plus", () => {
    const r = rebuilt([base(), shelvesRecord("of2", "Cloisons 1", "of1", [0], cloisons())]);
    expect(faces(r.geometry)).toBe(12 + 2);
    const left = r.niches.get("0.0")!.box;
    const right = r.niches.get("0.1")!.box;
    expect(left.y0).toBe(right.y0);
    expect(left.x1).toBeLessThan(right.x0);
    expect(r.elements.get("of2")).toEqual([expect.objectContaining({ name: "Cloison", numbered: true })]);
  });

  it("une niche née d'une cloison se divise ensuite par des étagères", () => {
    const shelves: ShelfInput = { count: 1, thickness: 18, mode: "equal", fixed: 300 };
    const r = rebuilt([base(), shelvesRecord("of2", "Cloisons 1", "of1", [0], cloisons()), shelvesRecord("of3", "Étagères 1", "of1", [0, 1], shelves)]);
    expect(faces(r.geometry)).toBe(12 + 2 + 2);
    expect(r.niches.has("0.1.0") && r.niches.has("0.1.1")).toBe(true);
    // The shelf spans the right niche only.
    const lower = r.niches.get("0.1.0")!.box;
    expect(lower.x0).toBe(r.niches.get("0.1")!.box.x0);
  });
});
