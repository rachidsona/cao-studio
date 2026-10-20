/** Sketches kept visible in the 3D view (eye icon) and drawing snapped to the grid. */
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { Recomputer } from "../../frontend/src/history/recompute";
import { gridPoint, snapToGrid } from "../../frontend/src/sketcher/hit";
import { addCircle, addLine, addRectangle } from "../../frontend/src/sketcher/edit";
import { sketchPolylines, sketchRegions } from "../../frontend/src/sketcher/polylines";
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

describe("accrochage à la grille", () => {
  it("arrondit au point de grille le plus proche, sans -0", () => {
    expect(gridPoint([12.4, 7.6], 5)).toEqual([10, 10]);
    expect(gridPoint([-0.4, 0.4], 1)).toEqual([0, 0]);
    expect(Object.is(gridPoint([-0.4, 0.4], 1)[0], 0)).toBe(true);
    expect(gridPoint([0.26, 0.74], 0.5)).toEqual([0.5, 0.5]);
    expect(gridPoint([3.3, 4.4], 0)).toEqual([3.3, 4.4]); // no valid step: unchanged
  });

  it("garde l'accroche sur un point ou une courbe existants, sinon va à la grille", () => {
    expect(snapToGrid({ pos: [12.4, 7.6] }, 5).pos).toEqual([10, 10]);
    expect(snapToGrid({ pos: [12.4, 7.6], pointId: "p1" }, 5)).toEqual({ pos: [12.4, 7.6], pointId: "p1" });
    expect(snapToGrid({ pos: [12.4, 7.6], curveId: "l1" }, 5)).toEqual({ pos: [12.4, 7.6], curveId: "l1" });
  });

  it("un rectangle tracé sur des points de grille a des cotes rondes", () => {
    const [a, b] = [gridPoint([0.3, 0.2], 5), gridPoint([39.8, 24.6], 5)];
    expect(a).toEqual([0, 0]);
    expect(b).toEqual([40, 25]);
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

describe("zones cliquables d'une esquisse", () => {
  it("un rectangle donne une zone, un rectangle dans un autre une zone avec un trou", () => {
    const one = addRectangle(empty(), { at: [0, 0] }, { at: [10, 5] }).geometry;
    expect(sketchRegions(one)).toHaveLength(1);
    expect(sketchRegions(one)[0]!.holes).toHaveLength(0);
    const nested = addRectangle(one, { at: [2, 1] }, { at: [6, 4] }).geometry;
    const regions = sketchRegions(nested);
    expect(regions).toHaveLength(1); // the inner one is a hole of the outer one
    expect(regions[0]!.holes).toHaveLength(1);
  });

  it("une esquisse ouverte, ou sans courbe, n'a pas de zone (et ne lève rien)", () => {
    const open = addLine(empty(), { at: [0, 0] }, { at: [10, 0] }, { autoAlign: false }).geometry;
    expect(sketchRegions(open)).toEqual([]);
    expect(sketchRegions(empty())).toEqual([]);
  });

  it("un segment qui dépasse n'empêche pas de choisir le rectangle", () => {
    const g = addRectangle(empty(), { at: [0, 0] }, { at: [10, 5] }).geometry;
    const withSpur = addLine(g, { at: [3, 3] }, { at: [30, 30] }, { autoAlign: false }).geometry;
    expect(sketchRegions(withSpur)).toHaveLength(1);
  });
});
