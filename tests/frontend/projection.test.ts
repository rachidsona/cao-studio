/** Sketch on a face: plane choice, projected body edges, snapping onto them. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import type { CadDocument } from "../../frontend/src/document/types";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { sketchFrame } from "../../frontend/src/sketcher/frame";
import { snap } from "../../frontend/src/sketcher/hit";
import { extractLoops } from "../../frontend/src/sketcher/loops";
import { planeForFace, projectOutline } from "../../frontend/src/sketcher/projection";
import { DrawingTool } from "../../frontend/src/sketcher/tools";
import { setupKernel } from "./kernel-setup";

/** Top face (z = 10) of the 80 × 50 plate with a Ø10 hole at the centre. */
const topFace: FaceOutline = {
  surface: "PLANE",
  center: [0, 0, 10],
  normal: [0, 0, 1],
  edges: [
    { kind: "line", a: [-40, -25, 10], b: [40, -25, 10] },
    { kind: "line", a: [40, -25, 10], b: [40, 25, 10] },
    { kind: "line", a: [40, 25, 10], b: [-40, 25, 10] },
    { kind: "line", a: [-40, 25, 10], b: [-40, -25, 10] },
    { kind: "circle", center: [0, 0, 10], radius: 5 },
  ],
};

describe("esquisse sur une face", () => {
  beforeAll(setupKernel);
  beforeAll(() => initSolver());

  it("choisit le plan principal et le décalage de la face", () => {
    expect(planeForFace([0, 0, 1], [0, 0, 10])).toEqual({ plane: "XY", offset: 10 });
    expect(planeForFace([0, -1, 0], [0, -25, 5])).toEqual({ plane: "XZ", offset: 25 });
    expect(planeForFace([1, 0, 0], [40, 0, 5])).toEqual({ plane: "YZ", offset: 40 });
    expect(planeForFace([0.7071, 0, 0.7071], [0, 0, 0])).toBeNull();
  });

  it("projette le contour comme géométrie de référence fixe", () => {
    const g = projectOutline(topFace, sketchFrame("XY", 10));
    expect(g.points).toHaveLength(5); // 4 corners shared by the lines + the hole centre
    expect(g.points.every((p) => p.fixed)).toBe(true);
    expect(g.curves.every((c) => c.construction && c.projected)).toBe(true);
    expect(extractLoops(g)).toHaveLength(0); // reference only: never a profile by itself
    expect(solveSketch(g)).toMatchObject({ state: "ok", dof: 0 });
  });

  it("reproduit les mesures du corps en traçant sur les coins projetés", () => {
    let g = projectOutline(topFace, sketchFrame("XY", 10));
    const tool = new DrawingTool("rectangle");
    for (const p of [[-39.9, -24.9], [39.9, 24.95]] as [number, number][]) {
      const result = tool.click(g, snap(g, p, 0.5));
      if (result.kind === "commit") g = result.geometry;
    }
    const solved = solveSketch(g);
    expect(solved).toMatchObject({ state: "ok", dof: 0 }); // fully defined by the body
    const doc: CadDocument = {
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [
        { id: "sk", type: "sketch", name: "Sur face", plane: "XY", offset: 10, ...solved.geometry },
        { id: "ex", type: "extrude", name: "Rehausse", sketch: "sk", distance: 5, operation: "new" },
      ],
    };
    const r = new Recomputer();
    r.recompute(doc);
    const out = r.output("ex");
    if (out?.kind !== "solid") throw new Error("solid expected");
    const m = bodyMetrics(out.shape);
    expect(m.volume).toBeCloseTo(80 * 50 * 5, 6);
    expect(m.bbox).toEqual([[-40, -25, 10], [40, 25, 15]]);
    r.dispose();
  });

  it("oriente les arcs projetés dans le sens antihoraire de l'esquisse", () => {
    const outline: FaceOutline = {
      surface: "PLANE",
      center: [0, 0, 0],
      normal: [0, 0, 1],
      // Quarter arc from (0,10) to (10,0) going clockwise through (7.07, 7.07).
      edges: [{ kind: "arc", center: [0, 0, 0], radius: 10, a: [0, 10, 0], b: [10, 0, 0], mid: [7.0710678, 7.0710678, 0] }],
    };
    const g = projectOutline(outline, sketchFrame("XY", 0));
    const arc = g.curves[0];
    expect(arc?.kind === "arc" && arc.startAngle).toBeCloseTo(0, 6);
    expect(arc?.kind === "arc" && arc.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });
});
