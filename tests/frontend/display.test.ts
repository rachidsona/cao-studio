/** Sketches kept visible in the 3D view and hidden with the eye icon. */
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { Recomputer } from "../../frontend/src/history/recompute";
import { addCircle, addLine, addRectangle } from "../../frontend/src/sketcher/edit";
import { sketchPolylines } from "../../frontend/src/sketcher/polylines";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

describe("polylignes d'une esquisse", () => {
  it("une ligne par segment, le cercle fermé, l'arc entre ses angles", () => {
    const rect = addRectangle(empty(), { at: [0, 0] }, { at: [10, 5] }).geometry;
    const lines = sketchPolylines(rect);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.length === 2)).toBe(true);

    const circle = sketchPolylines(addCircle(empty(), { at: [2, 3] }, 4).geometry)[0]!;
    expect(circle[0]).toEqual([expect.closeTo(6, 9), expect.closeTo(3, 9)]);
    expect(circle.at(-1)).toEqual([expect.closeTo(6, 9), expect.closeTo(3, 9)]);
    expect(circle.every(([x, y]) => Math.abs(Math.hypot(x - 2, y - 3) - 4) < 1e-9)).toBe(true);

    const arc: SketchGeometry = {
      points: [{ id: "c", x: 0, y: 0 }, { id: "s", x: 5, y: 0 }, { id: "e", x: 0, y: 5 }],
      curves: [{ id: "a1", kind: "arc", center: "c", start: "s", end: "e", radius: 5, startAngle: 0, endAngle: Math.PI / 2 }],
      constraints: [],
    };
    const points = sketchPolylines(arc)[0]!;
    expect(points[0]).toEqual([expect.closeTo(5, 9), expect.closeTo(0, 9)]);
    expect(points.at(-1)).toEqual([expect.closeTo(0, 9), expect.closeTo(5, 9)]);
  });

  it("laisse de côté la construction et les arêtes projetées", () => {
    let g = addLine(empty(), { at: [0, 0] }, { at: [10, 0] }, { autoAlign: false }).geometry;
    g = addLine(g, { at: [0, 1] }, { at: [10, 1] }, { autoAlign: false, construction: true }).geometry;
    g.curves.push({ id: "r1", kind: "line", p1: g.points[0]!.id, p2: g.points[1]!.id, construction: true, projected: true });
    expect(sketchPolylines(g)).toHaveLength(1);
  });
});

describe("masquer une esquisse", () => {
  it("n'est qu'une présentation : rien n'est recalculé", () => {
    const sketch: Feature = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, ...addRectangle(empty(), { at: [0, 0] }, { at: [10, 5] }).geometry };
    const extrude: Feature = { id: "ex", type: "extrude", name: "X", sketch: "sk", distance: 5, operation: "new" };
    const doc = (hidden: boolean): CadDocument => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [{ ...sketch, ...(hidden ? { hidden: true } : {}) } as Feature, extrude] });
    const r = new Recomputer();
    r.recompute(doc(false));
    const again = r.recompute(doc(true));
    expect(again.statuses.map((s) => [s.id, s.state, s.reused])).toEqual([["sk", "ok", true], ["ex", "ok", true]]);
    r.dispose();
  });
});
