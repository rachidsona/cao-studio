/** Le tracé d'une étagère tournée d'un corps aménagé : tourné comme son volume, jusqu'aux parois ou à la cloison. */
import { describe, expect, it } from "vitest";
import { nicheOutline, type WallLine } from "../../frontend/src/sketcher/niche-outline";
import { leanedOutline, leanedShelves, leanTurn, onShelfEdge, shelfSides } from "../../frontend/src/sketcher/shelf-lean-outline";
import { withBodyFurnished } from "../../frontend/src/document/body-opening";
import { withRecipe } from "../../frontend/src/document/niche-recipe";
import type { CadDocument, SketchFeature } from "../../frontend/src/document/types";
import { frameOf } from "../../frontend/src/sketcher/frame";
import { isPartition } from "../../frontend/src/sketcher/partition-history";

const opening: [number, number, number, number] = [18, 18, 582, 382];
const walls: WallLine[] = [
  { p: [18, 0], n: [1, 0] },
  { p: [582, 0], n: [-1, 0] },
  { p: [0, 18], n: [0, 1] },
  { p: [0, 382], n: [0, -1] },
];
const frame = { origin: [0, 0, 0] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 1, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };

describe("le tracé d'une étagère tournée", () => {
  it("l'angle dans le plan, à un quart de tour près ; à plat : aucun", () => {
    expect(leanTurn([1, 1, 0], frame)).toBeCloseTo(Math.PI / 4, 9);
    expect(leanTurn([-1, -1, 0], frame)).toBeCloseTo(Math.PI / 4, 9);
    expect(leanTurn([1, 0, 0], frame)).toBeNull();
    expect(leanTurn([0, 0, 1], frame)).toBeNull();
  });

  it("d'une paroi à l'autre, tournée autour de son milieu", () => {
    const outline = leanedOutline({ x0: 18, x1: 582, y0: 191, y1: 209 }, Math.atan2(100, 564), opening, walls)!;
    const us = outline.map(([u]) => u);
    const vs = outline.map(([, v]) => v);
    expect([Math.min(...us), Math.max(...us)].map(Math.round)).toEqual([18, 582]);
    // Climbing 100 over its length, plus its thickness across.
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(110);
  });

  it("dans une niche bordée d'une cloison : son bout revient sur elle", () => {
    const outline = leanedOutline({ x0: 18, x1: 291, y0: 191, y1: 209 }, 0.3, opening, walls)!;
    expect(Math.round(Math.max(...outline.map(([u]) => u)))).toBe(291);
  });

  it("les niches dessous et dessus suivent ses faces ; une niche plus loin, non", () => {
    const shelf = { box: { x0: 18, x1: 582, y0: 191, y1: 209 }, turn: Math.atan2(100, 564) };
    const below = { x0: 18, x1: 582, y0: 18, y1: 191 };
    const above = { x0: 18, x1: 582, y0: 209, y1: 382 };
    const sides = shelfSides(below, [shelf]);
    expect(sides.y1).toBeDefined();
    expect(sides.y0).toBeUndefined();
    expect(shelfSides(above, [shelf]).y0).toBeDefined();
    expect(shelfSides({ x0: 18, x1: 582, y0: 18, y1: 100 }, [shelf])).toEqual({});
    // Under it: its top climbs 100 from one wall to the other, around 191 at the middle.
    const top = (polygon: [number, number][], u: number) => Math.max(...polygon.filter(([x]) => Math.abs(x - u) < 1e-6).map(([, v]) => v));
    const outline = nicheOutline(below, opening, walls, sides)!;
    expect(top(outline, 18)).toBeCloseTo(141, 0);
    expect(top(outline, 582)).toBeCloseTo(241, 0);
    // In a niche bordered by cloisons (no side on the opening): its top still follows the shelf.
    const inner = nicheOutline({ x0: 100, x1: 500, y0: 100, y1: 191 }, opening, walls, shelfSides({ x0: 100, x1: 500, y0: 100, y1: 191 }, [shelf]))!;
    expect(inner.length).toBe(4);
    expect(top(inner, 500) - top(inner, 100)).toBeCloseTo(400 * (100 / 564), 0);
  });

  it("les traits droits sur ses grands bords sont ceux qu'il remplace, pas les autres", () => {
    const shelves = [{ box: { x0: 18, x1: 582, y0: 191, y1: 209 } }];
    expect(onShelfEdge([[18, 191], [582, 191]], shelves)).toBe(true);
    expect(onShelfEdge([[18, 209], [300, 209]], shelves)).toBe(true);
    expect(onShelfEdge([[18, 100], [582, 100]], shelves)).toBe(false);
    expect(onShelfEdge([[300, 209], [300, 382]], shelves)).toBe(false);
  });

  it("dans une vraie Répartition : l'étape tournée donne ses étagères, une étape à plat aucune", () => {
    const opening3 = { frame: { origin: [-300, -200, 0] as [number, number, number], xDir: [1, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] }, width: 564, height: 364, depth: 720, wall: 18 };
    const made = withBodyFurnished({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [] } as CadDocument, opening3, "Cadre", ["w"]);
    if (typeof made === "string") throw new Error(made);
    const sketchOf = (doc: CadDocument) => doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch")!;
    const partition = sketchOf(made.doc).offsets!.find(isPartition)!.id;
    const shelves = (lean?: [number, number, number]) => {
      const doc = withRecipe(made.doc, { sketch: made.sketch, partition, path: [0] }, { steps: [{ at: [], input: { count: 2, thickness: 18, mode: "equal", fixed: 0, ...(lean ? { lean } : {}) } }], equipment: [] });
      if (typeof doc === "string") throw new Error(doc);
      const sketch = sketchOf(doc);
      return leanedShelves(sketch, frameOf(sketch));
    };
    expect(shelves()).toEqual([]);
    const turned = shelves([1, 0.3, 0]);
    expect(turned).toHaveLength(2);
    expect(turned[0]!.turn).toBeCloseTo(Math.atan2(0.3, 1), 9);
  });
});
