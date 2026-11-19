/** Le squelette de « Panneaux » relu comme une Répartition (document/skeleton-partition.ts). */
import { describe, expect, it } from "vitest";
import { skeletonCaisson } from "../../frontend/src/document/skeleton-partition";
import { withCaissonPlaced } from "../../frontend/src/document/caisson-spec";
import { findFeature } from "../../frontend/src/document/operations";
import { createReferencePlate, type PanelsFeature, type SketchFeature } from "../../frontend/src/document/types";
import { leafNiches } from "../../frontend/src/sketcher/partition-history";

/** A sketch on the front plane (XZ) made of these strokes [x1, y1, x2, y2]. */
function skeleton(lines: [number, number, number, number][], extra: Partial<SketchFeature> = {}): SketchFeature {
  const points = lines.flatMap(([x1, y1, x2, y2], i) => [{ id: `p${2 * i}`, x: x1, y: y1 }, { id: `p${2 * i + 1}`, x: x2, y: y2 }]);
  const curves = lines.map((_, i) => ({ id: `l${i}`, kind: "line" as const, p1: `p${2 * i}`, p2: `p${2 * i + 1}` }));
  return { id: "sk9", type: "sketch", name: "Squelette", plane: "XZ", offset: 0, points, curves, constraints: [], ...extra };
}
const BOX: [number, number, number, number][] = [[0, 0, 1000, 0], [1000, 0, 1000, 2000], [1000, 2000, 0, 2000], [0, 2000, 0, 0]];
const P: Pick<PanelsFeature, "thickness" | "depth" | "align" | "through"> = { thickness: 18, depth: 500, align: "inside", through: "vertical" };

describe("squelette de Panneaux en Répartition", () => {
  it("le contour fait le caisson, un trait du bas au haut un côté entre deux cases, un trait dans une case une étagère", () => {
    const made = skeletonCaisson(skeleton([...BOX, [500, 0, 500, 2000], [0, 1000, 500, 1000]]), P);
    if (typeof made === "string") throw new Error(made);
    expect([made.width, made.height, made.spec.depth]).toEqual([1000, 2000, 500]);
    expect(made.spec.input).toMatchObject({ length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], widths: [473, 473], outer: "side", single: "side", boards: true, plinth: 0 });
    // The shelf at mid height in the left case: its lower niche up to the shelf's underside; the right case as it is.
    expect(made.spec.cases).toEqual([{ steps: [{ at: [], input: { count: 1, thickness: 18, mode: "set", fixed: 0, heights: [973, null] } }], equipment: [] }, { steps: [], equipment: [] }]);
    // On the front plane: its back on the plane, x along X, its front towards −Y.
    expect(made.frame).toEqual({ origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0] });
  });

  it("des traits centrés sur les panneaux : le caisson déborde du contour d'une demi-épaisseur ; dessus et dessous passent", () => {
    const made = skeletonCaisson(skeleton(BOX), { ...P, align: "center", through: "horizontal" });
    if (typeof made === "string") throw new Error(made);
    expect([made.width, made.height]).toEqual([1018, 2018]);
    expect(made.spec.input).toMatchObject({ cases: 2, dividers: ["none"], outer: "board", single: "board" });
    expect(made.frame.origin.map((v) => Math.round(v * 1000) / 1000)).toEqual([-9, 0, -9]);
  });

  it("sans côté du bas au haut : une seule case, divisée par l'étagère puis par une cloison dans sa niche du bas", () => {
    const made = skeletonCaisson(skeleton([...BOX, [0, 800, 1000, 800], [400, 0, 400, 800]]), P);
    if (typeof made === "string") throw new Error(made);
    expect(made.spec.input).toMatchObject({ cases: 2, dividers: ["none"] });
    expect(made.spec.cases[0]!.steps).toEqual([
      { at: [], input: { count: 1, thickness: 18, mode: "set", fixed: 0, heights: [773, null] } },
      { at: [0], input: { count: 1, thickness: 18, mode: "set", fixed: 0, heights: [373, null], vertical: true } },
    ]);
  });

  it("une profondeur négative : le caisson recule derrière le plan de l'esquisse", () => {
    const made = skeletonCaisson(skeleton(BOX), { ...P, depth: -400 });
    if (typeof made === "string") throw new Error(made);
    expect(made.spec.depth).toBe(400);
    expect(made.frame.origin.map((v) => Math.round(v) + 0)).toEqual([0, 400, 0]);
  });

  it("reste en planches : un trait en biais, un contour ouvert, un trait qui s'arrête au milieu d'une niche, une courbe", () => {
    expect(skeletonCaisson(skeleton([...BOX, [0, 0, 1000, 2000]]), P)).toMatch(/en biais/);
    expect(skeletonCaisson(skeleton(BOX.slice(0, 3)), P)).toMatch(/rectangle fermé/);
    expect(skeletonCaisson(skeleton([...BOX, [0, 1000, 600, 1000]]), P)).toMatch(/au milieu d'une niche/);
    expect(skeletonCaisson(skeleton([[0, 0, 1000, 0], [1000, 0, 1000, 500]]), P)).toMatch(/rectangle fermé/);
    const curved = skeleton(BOX);
    curved.curves.push({ id: "a1", kind: "circle", center: "p0", radius: 50 } as never);
    expect(skeletonCaisson(curved, P)).toMatch(/courbes/);
    // Drawn flat on the floor (walls to raise): boards.
    expect(skeletonCaisson(skeleton(BOX, { plane: "XY" }), P)).toMatch(/à plat/);
  });

  it("posé, c'est une Répartition extrudée dont on retrouve les niches", () => {
    const made = skeletonCaisson(skeleton([...BOX, [500, 0, 500, 2000], [0, 1000, 500, 1000]]), P);
    if (typeof made === "string") throw new Error(made);
    const placed = withCaissonPlaced(createReferencePlate(), made.spec, { frame: made.frame, width: made.width, height: made.height, name: "Panneaux 1" });
    if (typeof placed === "string") throw new Error(placed);
    const sketch = findFeature(placed.doc, placed.sketch) as SketchFeature;
    // The left case cut in two by its shelf, the right one whole.
    expect(leafNiches(sketch).map((n) => n.path)).toEqual([[1], [0, 0], [0, 1]]);
    expect(placed.doc.features.filter((f) => f.type === "extrude").length).toBeGreaterThan(4);
  });
});
