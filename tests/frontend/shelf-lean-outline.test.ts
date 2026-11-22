/** Le tracé d'une étagère tournée d'un corps aménagé : tourné comme son volume, jusqu'aux parois ou à la cloison. */
import { describe, expect, it } from "vitest";
import { nicheOutline, type WallLine } from "../../frontend/src/sketcher/niche-outline";
import { leanedOutline, leanedShelves, leanTurn, onShelfEdge, outlinedParts, reachAcross, sharedWidth, shelfSides } from "../../frontend/src/sketcher/shelf-lean-outline";
import { shelfLayout } from "../../frontend/src/sketcher/shelves";
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
    const outline = leanedOutline({ box: { x0: 18, x1: 582, y0: 191, y1: 209 }, turn: Math.atan2(100, 564) }, opening, walls)!;
    const us = outline.map(([u]) => u);
    const vs = outline.map(([, v]) => v);
    expect([Math.min(...us), Math.max(...us)].map(Math.round)).toEqual([18, 582]);
    // Climbing 100 over its length, plus its thickness across.
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(110);
  });

  it("dans une niche bordée d'une cloison : son bout revient sur elle", () => {
    const outline = leanedOutline({ box: { x0: 18, x1: 291, y0: 191, y1: 209 }, turn: 0.3 }, opening, walls)!;
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

describe("les cloisons comme les étagères", () => {
  const shelf = { box: { x0: 18, x1: 582, y0: 191, y1: 209 }, turn: Math.atan2(100, 564) };

  it("une cloison tournée va du dessous au dessus, penchée ; son angle part de la verticale", () => {
    expect(leanTurn([0, 1, 0], frame, Math.PI / 2)).toBeNull();
    expect(leanTurn([0.2, 1, 0], frame, Math.PI / 2)).toBeCloseTo(-Math.atan2(0.2, 1), 9);
    const outline = leanedOutline({ box: { x0: 291, x1: 309, y0: 18, y1: 382 }, turn: 0.2, vertical: true }, opening, walls)!;
    const vs = outline.map(([, v]) => v);
    expect([Math.min(...vs), Math.max(...vs)].map(Math.round)).toEqual([18, 382]);
    const us = outline.map(([u]) => u);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(18 + 364 * Math.tan(0.2) - 1);
  });

  it("une cloison droite sous une étagère tournée monte jusqu'à sa face ; ses grands bords droits partent", () => {
    const cloison = { box: { x0: 118, x1: 136, y0: 18, y1: 191 }, turn: 0, vertical: true };
    const drawn = outlinedParts([shelf, cloison, { box: { x0: 400, x1: 418, y0: 209, y1: 382 }, turn: 0, vertical: true }]);
    // The turned shelf, and the cloison under it; not the one above (it butts on the top face, here too: both).
    const mine = drawn.find((d) => d.part === cloison)!;
    expect(mine.sides.y1).toBeDefined();
    const outline = leanedOutline(cloison, opening, walls, mine.sides)!;
    const top = Math.max(...outline.map(([, v]) => v));
    // Under the shelf's face at u 136: 191 at its middle, less 164 × 100 / 564.
    expect(top).toBeCloseTo(200 - 9 / Math.cos(shelf.turn) - 164 * (100 / 564), 0);
    expect(Math.min(...outline.map(([, v]) => v))).toBeCloseTo(18, 6);
    expect(onShelfEdge([[118, 18], [118, 191]], [cloison])).toBe(true);
    expect(onShelfEdge([[100, 18], [100, 191]], [cloison])).toBe(false);
  });

  it("les niches de part et d'autre d'une cloison tournée suivent ses faces", () => {
    const cloison = { box: { x0: 291, x1: 309, y0: 18, y1: 382 }, turn: 0.2, vertical: true };
    expect(shelfSides({ x0: 18, x1: 291, y0: 18, y1: 382 }, [cloison]).x1).toBeDefined();
    expect(shelfSides({ x0: 309, x1: 582, y0: 18, y1: 382 }, [cloison]).x0).toBeDefined();
    expect(shelfSides({ x0: 18, x1: 200, y0: 18, y1: 382 }, [cloison])).toEqual({});
  });

  it("les cloisons d'une niche se partagent sa vraie largeur, ses niches coupées à sa boîte", () => {
    // A trapezoid 0 → 400 wide at the bottom, 100 → 300 at the top: 50 → 350 through its middle.
    expect(reachAcross([[0, 0], [400, 0], [300, 200], [100, 200]], true)).toEqual([50, 350]);
    expect(reachAcross(null, true)).toBeNull();
    const input = { count: 1, thickness: 18, mode: "equal" as const, fixed: 0, vertical: true };
    expect(sharedWidth({ x0: 100, x1: 300, y0: 0, y1: 200 }, input, [[0, 0], [400, 0], [300, 200], [100, 200]]).within).toEqual([50, 350]);
    // Its box's width already, or shelves: nothing kept (an old one dropped).
    expect(sharedWidth({ x0: 50, x1: 350, y0: 0, y1: 200 }, { ...input, within: [0, 1] }, [[0, 0], [400, 0], [300, 200], [100, 200]]).within).toBeUndefined();
    expect(sharedWidth({ x0: 100, x1: 300, y0: 0, y1: 200 }, { ...input, vertical: false }, [[0, 0], [400, 0], [300, 200], [100, 200]]).within).toBeUndefined();
    const layout = shelfLayout({ x0: 100, x1: 400, y0: 0, y1: 200 }, { count: 1, thickness: 18, mode: "equal", fixed: 0, vertical: true, within: [0, 418] });
    if (typeof layout === "string") throw new Error(layout);
    expect(layout.shelves).toEqual([[200, 218]]);
    expect(layout.niches).toEqual([[100, 200], [218, 400]]);
    expect(layout.real).toEqual([[0, 200], [218, 418]]);
    expect(typeof shelfLayout({ x0: 100, x1: 400, y0: 0, y1: 200 }, { count: 1, thickness: 18, mode: "bottom", fixed: 50, vertical: true, within: [0, 418] })).toBe("string");
  });
});
