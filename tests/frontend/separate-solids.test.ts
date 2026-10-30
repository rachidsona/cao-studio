/** Extrusions that fall apart in separate solids: one body per solid, instead of an error. */
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { addRectangle } from "../../frontend/src/sketcher/edit";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Rectangles [x0, y0, x1, y1] in one sketch. */
function rectangles(...boxes: [number, number, number, number][]): SketchGeometry {
  let g: SketchGeometry = { points: [], curves: [], constraints: [] };
  for (const [x0, y0, x1, y1] of boxes) g = addRectangle(g, { at: [x0, y0] }, { at: [x1, y1] }).geometry;
  return g;
}

const doc = (features: Feature[]): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features });

describe("extrusion en plusieurs solides séparés", () => {
  it("deux profils écartés extrudés ensemble donnent deux corps", () => {
    const r = new Recomputer();
    const result = r.recompute(
      doc([
        { id: "sk", type: "sketch", name: "Deux pieds", plane: "XY", offset: 0, ...rectangles([0, 0, 20, 20], [100, 0, 120, 20]) },
        { id: "ex", type: "extrude", name: "Pieds", sketch: "sk", distance: 50, operation: "new" },
      ]),
    );
    expect(result.statuses.find((s) => s.id === "ex")?.state).toBe("ok");
    expect(result.bodies).toEqual(["ex#0", "ex#1"]);
    const out = r.output("ex");
    if (out?.kind !== "solids") throw new Error("solids expected");
    // Numbered by position: the left one first.
    expect(out.shapes.map((s) => bodyMetrics(s).bbox[0][0])).toEqual([0, 100]);
    for (const s of out.shapes) expect(bodyMetrics(s).volume).toBeCloseTo(20 * 20 * 50, 6);
    r.dispose();
  });

  it("une coupe à travers tout un panneau le sépare en deux corps", () => {
    const r = new Recomputer();
    const result = r.recompute(
      doc([
        { id: "sk", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...rectangles([0, 0, 200, 100]) },
        { id: "ex", type: "extrude", name: "Panneau", sketch: "sk", distance: 18, operation: "new" },
        { id: "sk2", type: "sketch", name: "Rainure", plane: "XY", offset: 0, ...rectangles([90, -10, 110, 110]) },
        { id: "cut", type: "extrude", name: "Coupe", sketch: "sk2", distance: 18, operation: "cut", target: "ex" },
      ]),
    );
    expect(result.statuses.find((s) => s.id === "cut")?.state).toBe("ok");
    expect(result.bodies).toEqual(["cut#0", "cut#1"]);
    r.dispose();
  });

  it("un seul solide reste un seul corps", () => {
    const r = new Recomputer();
    const result = r.recompute(
      doc([
        { id: "sk", type: "sketch", name: "Plaque", plane: "XY", offset: 0, ...rectangles([0, 0, 50, 50]) },
        { id: "ex", type: "extrude", name: "Plaque", sketch: "sk", distance: 10, operation: "new" },
      ]),
    );
    expect(result.bodies).toEqual(["ex"]);
    expect(r.output("ex")?.kind).toBe("solid");
    r.dispose();
  });
});
