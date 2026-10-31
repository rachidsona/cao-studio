/** Les accrochages du dessin (comme dans Aspire) : à la géométrie, intelligent (alignements, guides en tirets), à la grille. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { alignmentPoints, pointerSnap, type SnapOptions } from "../../frontend/src/sketcher/smart-snap";

// A line from (100, 100) to (300, 100).
const G: SketchGeometry = {
  points: [
    { id: "p1", x: 100, y: 100 },
    { id: "p2", x: 300, y: 100 },
  ],
  curves: [{ id: "l1", kind: "line", p1: "p1", p2: "p2" }],
  constraints: [],
};
const ALL: SnapOptions = { tolerance: 5, geometry: true, smart: true, grid: 10 };

describe("accrochages du dessin", () => {
  it("à la géométrie : un point de l'esquisse est repris, un trait est suivi ; désactivé, le pointeur reste libre", () => {
    expect(pointerSnap(G, [102, 98], ALL)).toMatchObject({ pos: [100, 100], pointId: "p1", guides: [] });
    expect(pointerSnap(G, [173, 103], ALL)).toMatchObject({ pos: [173, 100], curveId: "l1" });
    const off = pointerSnap(G, [173, 103], { ...ALL, geometry: false, smart: false, grid: null });
    expect(off).toEqual({ pos: [173, 103], guides: [] });
  });

  it("intelligent : même X ou même Y qu'un point (ou le milieu d'un trait), avec un guide en tirets depuis ce point", () => {
    // Above p2: the same x, the y on the grid.
    const above = pointerSnap(G, [302, 247], ALL);
    expect(above.pos).toEqual([300, 250]);
    expect(above.pointId).toBeUndefined();
    expect(above.guides).toEqual([[[300, 100], [300, 250]]]);
    // In line with the middle of the line.
    expect(pointerSnap(G, [198, 403], { ...ALL, grid: null }).pos).toEqual([200, 403]);
    // In line with both: the corner they make.
    const corner = pointerSnap({ ...G, points: [...G.points, { id: "p3", x: 500, y: 400 }] }, [302, 398], ALL);
    expect(corner.pos).toEqual([300, 400]);
    expect(corner.guides).toHaveLength(2);
    // Off: the grid alone.
    expect(pointerSnap(G, [302, 247], { ...ALL, smart: false }).pos).toEqual([300, 250]);
    expect(pointerSnap(G, [302, 247], { ...ALL, smart: false, grid: null }).pos).toEqual([302, 247]);
  });

  it("le point juste cliqué compte aussi : une ligne part droite à l'horizontale ou à la verticale", () => {
    const s = pointerSnap(G, [703, 812], { ...ALL, grid: null, anchors: [[700, 600]] });
    expect(s.pos).toEqual([700, 812]);
    expect(s.guides).toEqual([[[700, 600], [700, 812]]]);
    expect(alignmentPoints(G, [[1, 2]])).toEqual([[0, 0], [100, 100], [300, 100], [200, 100], [1, 2]]);
  });
});
