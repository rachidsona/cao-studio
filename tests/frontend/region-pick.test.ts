/** Choosing a closed area of the sketch by clicking inside it. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { addRectangle } from "../../frontend/src/sketcher/edit";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { boundaryCurves, regionAt } from "../../frontend/src/sketcher/region-pick";

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

/** A big rectangle 0..400 × 0..300 and a small one inside it, 50..150 × 50..150. */
function nested() {
  const big = addRectangle(empty(), { at: [0, 0] }, { at: [400, 300] });
  const small = addRectangle(big.geometry, { at: [50, 50] }, { at: [150, 150] });
  return { g: small.geometry, big: big.created, small: small.created };
}

describe("zone sous le pointeur", () => {
  it("la plus petite zone qui contient le point : le petit rectangle dedans, le grand ailleurs", () => {
    const { g } = nested();
    const faces = sketchFaces(extractLoops(g));
    const inside = regionAt(faces, [100, 100])!;
    const outside = regionAt(faces, [300, 200])!;
    expect(Math.max(...inside.outer.map((p) => p[0]))).toBe(150);
    expect(Math.max(...outside.outer.map((p) => p[0]))).toBe(400);
    expect(outside.holes).toHaveLength(1);
    expect(regionAt(faces, [500, 500])).toBeNull();
  });

  it("un point dans le trou du grand rectangle n'est pas dans le grand rectangle", () => {
    const { g } = nested();
    const faces = sketchFaces(extractLoops(g));
    const big = faces.find((f) => f.holes.length === 1)!;
    expect(regionAt([big], [100, 100])).toBeNull();
    expect(regionAt([big], [300, 200])).toBe(big);
  });
});

describe("côtés d'une zone", () => {
  it("le petit rectangle : ses quatre côtés, pas ceux du grand", () => {
    const { g, small } = nested();
    const faces = sketchFaces(extractLoops(g));
    const ids = boundaryCurves(g, regionAt(faces, [100, 100])!);
    expect(new Set(ids)).toEqual(new Set(small));
  });

  it("la zone entre les deux rectangles : les côtés des deux (contour et trou)", () => {
    const { g, big, small } = nested();
    const faces = sketchFaces(extractLoops(g));
    const ids = boundaryCurves(g, regionAt(faces, [300, 200])!);
    expect(new Set(ids)).toEqual(new Set([...big, ...small]));
  });

  it("deux rectangles qui se touchent par un côté : chaque zone a ses côtés, et le côté commun compte ses deux traits superposés", () => {
    const left = addRectangle(empty(), { at: [0, 0] }, { at: [100, 100] });
    const right = addRectangle(left.geometry, { at: [100, 0] }, { at: [200, 100] });
    const g = right.geometry;
    const faces = sketchFaces(extractLoops(g));
    const a = boundaryCurves(g, regionAt(faces, [50, 50])!);
    const b = boundaryCurves(g, regionAt(faces, [150, 50])!);
    for (const id of left.created) expect(a).toContain(id);
    for (const id of right.created) expect(b).toContain(id);
    // The shared side is drawn twice, once by each rectangle: both lines are on both boundaries.
    expect(a.filter((id) => b.includes(id))).toHaveLength(2);
  });

  it("une ligne qui ne fait que traverser une zone n'en est pas un côté", () => {
    const { g } = nested();
    const crossing: SketchGeometry = structuredClone(g);
    crossing.points.push({ id: "x1", x: 100, y: -20 }, { id: "x2", x: 100, y: 100 });
    crossing.curves.push({ id: "cut", kind: "line", p1: "x1", p2: "x2" });
    const faces = sketchFaces(extractLoops(g));
    expect(boundaryCurves(crossing, regionAt(faces, [100, 100])!)).not.toContain("cut");
  });
});
