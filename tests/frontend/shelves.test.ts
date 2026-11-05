/** « Étagères » : une niche divisée par des étagères, qui donnent des niches qu'on peut diviser à leur tour. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { defaultDividers, partitionGeometry, partitionLayout, type PartitionInput } from "../../frontend/src/sketcher/partition";
import { regionAt } from "../../frontend/src/sketcher/region-pick";
import { addShelves, nicheBox, shelfLayout, shelfLines, type ShelfInput } from "../../frontend/src/sketcher/shelves";

const BOX = { x0: 0, y0: 0, x1: 500, y1: 1000 };
const shelves = (patch: Partial<ShelfInput> = {}): ShelfInput => ({ count: 3, thickness: 18, mode: "equal", fixed: 300, ...patch });
const layoutOf = (patch: Partial<ShelfInput> = {}, box = BOX) => {
  const layout = shelfLayout(box, shelves(patch));
  if (typeof layout === "string") throw new Error(layout);
  return layout;
};

describe("répartition de la hauteur d'une niche", () => {
  it("3 étagères de 18 mm dans 1000 mm : 4 niches égales de 236,5 mm", () => {
    const { niches, shelves: s } = layoutOf();
    expect(niches).toHaveLength(4);
    for (const [a, b] of niches) expect(b - a).toBeCloseTo(236.5, 6);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual([236.5, 254.5]);
    // The last niche ends at the top of the box.
    expect(niches.at(-1)?.[1]).toBe(1000);
  });

  it("une niche fixée en bas : elle garde sa hauteur, les autres se partagent le reste", () => {
    const { niches } = layoutOf({ mode: "bottom", fixed: 300, count: 2 });
    expect(niches[0]).toEqual([0, 300]);
    // 1000 − 2 × 18 − 300 = 664 → 332 each.
    expect(niches[1]![1] - niches[1]![0]).toBeCloseTo(332, 6);
    expect(niches.at(-1)?.[1]).toBe(1000);
  });

  it("des niches réglées une à une : les autres se partagent le reste", () => {
    const { niches } = layoutOf({ mode: "set", count: 4, heights: [null, 200, null, 100, null] });
    const heights = niches.map(([a, b]) => b - a);
    expect(heights[1]).toBeCloseTo(200, 6);
    expect(heights[3]).toBeCloseTo(100, 6);
    // 1000 − 4 × 18 − 300 = 628 → 209,33 each.
    for (const i of [0, 2, 4]) expect(heights[i]).toBeCloseTo(628 / 3, 4);
    expect(niches.at(-1)?.[1]).toBe(1000);
  });

  it("garde une niche pour prendre le reste", () => {
    expect(shelfLayout(BOX, shelves({ mode: "set", count: 1, heights: [400, 400] }))).toBe("Toutes les niches sont fixées : laissez-en une prendre le reste.");
    expect(shelfLayout(BOX, shelves({ mode: "set", count: 1, heights: [1200, null] }))).toBe("La niche fixe ne laisse pas de place aux autres niches.");
  });

  it("une niche fixée en haut", () => {
    const { niches } = layoutOf({ mode: "top", fixed: 250, count: 3 });
    expect(niches.at(-1)).toEqual([750, 1000]);
    expect(niches).toHaveLength(4);
  });

  it("une seule étagère à une hauteur donnée du bas", () => {
    const { shelves: s } = layoutOf({ mode: "bottom", fixed: 400, count: 1 });
    expect(s).toEqual([[400, 418]]);
  });

  it("refuse ce qui est impossible, en le disant", () => {
    expect(shelfLayout(BOX, shelves({ count: 0 }))).toMatch(/1 à/);
    expect(shelfLayout(BOX, shelves({ thickness: 0 }))).toMatch(/épaisseur/);
    expect(shelfLayout({ ...BOX, y1: 50 }, shelves({ count: 3 }))).toMatch(/toute la hauteur/);
    expect(shelfLayout(BOX, shelves({ mode: "bottom", fixed: 980, count: 3 }))).toMatch(/ne laisse pas de place/);
    expect(shelfLayout(BOX, shelves({ mode: "top", fixed: 0 }))).toMatch(/fixe/);
  });

  it("deux lignes par étagère, d'un côté à l'autre de la niche", () => {
    const lines = shelfLines(BOX, layoutOf({ count: 1 }));
    // 1000 − 18 = 982 → 491 under and 491 over the shelf.
    expect(lines).toEqual([[[0, 491], [500, 491]], [[0, 509], [500, 509]]]);
  });
});

describe("niche d'une répartition", () => {
  const input: PartitionInput = { length: 1800, height: 2500, thickness: 18, cases: 3, dividers: defaultDividers(3), boards: true, plinth: 0, outer: "board", single: "board", double: "side" };
  const sketch = (): SketchGeometry => {
    const layout = partitionLayout(input);
    if (typeof layout === "string") throw new Error(layout);
    return partitionGeometry(input, layout);
  };
  const faces = (g: SketchGeometry) => sketchFaces(extractLoops(g));
  /** The first case: between the left side and the first divider. */
  const firstCase = (g: SketchGeometry) => {
    const region = regionAt(faces(g), [200, 1250]);
    if (!region) throw new Error("no niche");
    return region;
  };

  it("une case est un rectangle : la niche", () => {
    const box = nicheBox(firstCase(sketch()));
    expect(box).toEqual({ x0: 18, y0: 18, x1: 588, y1: 2482 });
  });

  it("3 étagères coupent la case en 4 niches : 7 zones à la place d'une", () => {
    const g = sketch();
    const before = faces(g).length;
    const box = nicheBox(firstCase(g))!;
    const next = addShelves(g, box, layoutOf({ count: 3 }, box));
    expect(faces(next).length).toBe(before + 6);
  });

  it("une niche obtenue se divise à son tour", () => {
    let g = sketch();
    const box = nicheBox(firstCase(g))!;
    g = addShelves(g, box, layoutOf({ count: 1 }, box));
    const upper = regionAt(faces(g), [200, 2000]);
    expect(upper).not.toBeNull();
    const sub = nicheBox(upper!);
    expect(sub).not.toBeNull();
    expect(sub!.y0).toBeGreaterThan(1200);
    const before = faces(g).length;
    g = addShelves(g, sub!, layoutOf({ count: 2 }, sub!));
    expect(faces(g).length).toBe(before + 4);
  });

  it("plusieurs niches reçoivent les mêmes étagères, l'une après l'autre", () => {
    let g = sketch();
    const before = faces(g).length;
    const boxes = [[200, 1250], [900, 1250]].map((p) => nicheBox(regionAt(faces(g), p as [number, number])!)!);
    expect(boxes[0]).not.toEqual(boxes[1]);
    for (const box of boxes) g = addShelves(g, box, layoutOf({ count: 2 }, box));
    // Each niche becomes 2 shelves and 3 niches: 5 zones instead of 1.
    expect(faces(g).length).toBe(before + 2 * 4);
  });

  it("une zone qui n'est pas un rectangle n'est pas une niche", () => {
    expect(nicheBox({ outer: [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]], holes: [] })).toBeNull();
    expect(nicheBox({ outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[10, 10], [20, 10], [20, 20]]] })).toBeNull();
    expect(nicheBox({ outer: [[0, 0], [100, 0], [50, 100]], holes: [] })).toBeNull();
  });
});
