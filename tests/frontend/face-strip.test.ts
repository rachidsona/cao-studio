/** "Tracé sur face" (Curic DIO): a band of a face, parallel to one of its edges, ready to be extruded in or out. */
import { beforeAll, describe, expect, it } from "vitest";
import { rectangleAt } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, SketchFeature } from "../../frontend/src/document/types";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { bandPolygon, bandRange, bandSketch, cornerReference, facePolygon, inwardDistance, polygonEdges, referenceDistance, sideDistances, stripPolygon } from "../../frontend/src/sketcher/face-strip";
import { sketchFrame } from "../../frontend/src/sketcher/frame";
import { sketchRegions } from "../../frontend/src/sketcher/polylines";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

type P3 = [number, number, number];
/** Top face (z = 10) of a 100 × 50 plate, its edges in no particular order. */
const top = (): FaceOutline => {
  const c: P3[] = [[0, 0, 10], [100, 0, 10], [100, 50, 10], [0, 50, 10]];
  return {
    surface: "PLANE",
    center: [50, 25, 10],
    normal: [0, 0, 1],
    edges: [
      { kind: "line", a: c[2]!, b: c[3]! },
      { kind: "line", a: c[0]!, b: c[1]! },
      { kind: "line", a: c[3]!, b: c[0]! },
      { kind: "line", a: c[1]!, b: c[2]! },
    ],
  };
};
const frame = sketchFrame("XY", 10);
const box = (poly: [number, number][]) => {
  const xs = poly.map((p) => Number(p[0].toFixed(6)));
  const ys = poly.map((p) => Number(p[1].toFixed(6)));
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
};

describe("bande d'une face", () => {
  it("le contour se reforme, la bande suit l'arête choisie vers l'intérieur", () => {
    const poly = facePolygon(top(), frame)!;
    expect(poly).toHaveLength(4);
    const bottom = polygonEdges(poly).find((e) => e.a[1] === 0 && e.b[1] === 0)!;
    expect(box(bandPolygon(poly, bottom, 0, 18)!)).toEqual([0, 100, 0, 18]); // one line: a rabbet along the edge
    expect(box(bandPolygon(poly, bottom, 10, 20)!)).toEqual([0, 100, 10, 20]); // two lines: a groove
    expect(inwardDistance(poly, bottom, [30, 12])).toBeCloseTo(12, 9);
    expect(bandPolygon(poly, bottom, 60, 70)).toBeNull(); // beyond the face
  });

  it("départ d'un coin : le trait traverse la face, à la distance comptée le long du côté suivi par le pointeur", () => {
    const poly = facePolygon(top(), frame)!;
    const corner = poly.findIndex((p) => p[0] === 0 && p[1] === 0);
    const alongX = cornerReference(poly, corner, [30, 2])!;
    expect(referenceDistance(alongX, [30, 2])).toBeCloseTo(30, 9);
    expect(box(stripPolygon(poly, alongX, 0, 30)!)).toEqual([0, 30, 0, 50]); // one line: the end of the board
    expect(box(stripPolygon(poly, alongX, 20, 38)!)).toEqual([20, 38, 0, 50]); // two lines: a dado across the board
    const alongY = cornerReference(poly, corner, [2, 30])!;
    expect(box(stripPolygon(poly, alongY, 10, 20)!)).toEqual([0, 100, 10, 20]);
    expect(cornerReference(poly, corner, [0, 0])).toBeNull(); // on the corner itself
    // Double line with retrait 0: the groove starts on the edge of the body.
    const bottom = polygonEdges(poly).find((e) => e.a[1] === 0 && e.b[1] === 0)!;
    expect(box(bandPolygon(poly, bottom, 0, 8)!)).toEqual([0, 100, 0, 8]);
    expect(box(stripPolygon(poly, alongX, 0, 8)!)).toEqual([0, 8, 0, 50]);
  });

  it("une face en L est découpée selon sa forme", () => {
    const pts: P3[] = [[0, 0, 0], [100, 0, 0], [100, 30, 0], [40, 30, 0], [40, 80, 0], [0, 80, 0]];
    const outline: FaceOutline = { surface: "PLANE", center: [40, 30, 0], normal: [0, 0, 1], edges: pts.map((a, i) => ({ kind: "line" as const, a, b: pts[(i + 1) % pts.length]! })) };
    const f = sketchFrame("XY", 0);
    const poly = facePolygon(outline, f)!;
    const left = polygonEdges(poly).find((e) => e.a[0] === 0 && e.b[0] === 0)!;
    expect(box(bandPolygon(poly, left, 20, 60)!)).toEqual([20, 60, 0, 80]);
  });

  it("l'esquisse créée a la bande comme zone fermée (le contour projeté ne compte pas)", () => {
    const poly = facePolygon(top(), frame)!;
    const band = bandPolygon(poly, polygonEdges(poly)[0]!, 0, 18)!;
    const g = bandSketch(top(), frame, band);
    expect(g.curves.filter((c) => c.projected)).toHaveLength(4);
    expect(sketchRegions(g)).toHaveLength(1);
  });

  it("un trou de la face (deux arcs projetés) ne rend pas l'esquisse redondante", () => {
    const outline = top();
    outline.edges.push(
      { kind: "arc", center: [70, 25, 10], radius: 8, a: [78, 25, 10], mid: [70, 33, 10], b: [62, 25, 10] },
      { kind: "arc", center: [70, 25, 10], radius: 8, a: [62, 25, 10], mid: [70, 17, 10], b: [78, 25, 10] },
    );
    const poly = facePolygon(outline, frame)!;
    const sketch: SketchFeature = { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 10, ...bandSketch(outline, frame, bandPolygon(poly, polygonEdges(poly)[0]!, 0, 18)!) };
    const r = new Recomputer();
    r.recompute({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch] });
    const out = r.output("sk2");
    if (out?.kind !== "profile") throw new Error("profile expected");
    expect(out.redundant).toEqual([]);
    r.dispose();
  });
});

describe("feuillure par extrusion de la bande", () => {
  it("creuser la bande de 6 mm enlève exactement 100 × 18 × 6", () => {
    const poly = facePolygon(top(), frame)!;
    const bottom = polygonEdges(poly).find((e) => e.a[1] === 0 && e.b[1] === 0)!;
    const sketch: SketchFeature = { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 10, ...bandSketch(top(), frame, bandPolygon(poly, bottom, 0, 18)!) };
    const doc: CadDocument = {
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [
        { id: "sk", type: "sketch", name: "Plaque", plane: "XY", offset: 0, ...rectangleAt(50, 25, 100, 50) },
        { id: "ex", type: "extrude", name: "Plaque", sketch: "sk", distance: 10, operation: "new" },
        sketch,
        { id: "cut", type: "extrude", name: "Feuillure", sketch: "sk2", distance: -6, operation: "cut", target: "ex" } as Feature,
      ],
    };
    const r = new Recomputer();
    const result = r.recompute(doc);
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const out = r.output("cut");
    if (out?.kind !== "solid") throw new Error("solid expected");
    expect(bodyMetrics(out.shape).volume).toBeCloseTo(100 * 50 * 10 - 100 * 18 * 6, 3);
    r.dispose();
  });
});

describe("Truelle (comme Curic DIO 2)", () => {
  it("cotes vers les deux bords depuis le trait, et place du double trait par rapport au pointeur", () => {
    const poly = facePolygon(top(), frame)!;
    expect(sideDistances(poly, [30, 20], [1, 0])).toEqual({ back: 30, ahead: 70 });
    expect(sideDistances(poly, [30, 20], [0, 1])).toEqual({ back: 20, ahead: 30 });
    expect(bandRange("line", "start", 30, 18)).toEqual([0, 30]);
    expect(bandRange("groove", "start", 30, 18)).toEqual([30, 48]);
    expect(bandRange("groove", "end", 30, 18)).toEqual([12, 30]);
    expect(bandRange("groove", "center", 30, 18)).toEqual([21, 39]);
  });

  const plate = (...more: Feature[]): CadDocument => ({
    format: "cao-studio",
    schemaVersion: 2,
    units: "mm",
    parameters: {},
    features: [{ id: "sk", type: "sketch", name: "Plaque", plane: "XY", offset: 0, ...rectangleAt(50, 25, 100, 50) }, { id: "ex", type: "extrude", name: "Plaque", sketch: "sk", distance: 10, operation: "new" }, ...more],
  });

  it("tirer la bande ajoute une cloison ; la pousser creuse", () => {
    const poly = facePolygon(top(), frame)!;
    const band = stripPolygon(poly, cornerReference(poly, poly.findIndex((p) => p[0] === 0 && p[1] === 0), [30, 2])!, 40, 58)!;
    const sketch: SketchFeature = { id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 10, ...bandSketch(top(), frame, band) };
    for (const [distance, operation, volume] of [[30, "join", 100 * 50 * 10 + 18 * 50 * 30], [-4, "cut", 100 * 50 * 10 - 18 * 50 * 4]] as const) {
      const r = new Recomputer();
      const result = r.recompute(plate(sketch, { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk2", distance, operation, target: "ex" } as Feature));
      expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
      const out = r.output("ex2");
      if (out?.kind !== "solid") throw new Error("solid expected");
      expect(bodyMetrics(out.shape).volume).toBeCloseTo(volume, 3);
      r.dispose();
    }
  });

  it("depuis la face du dessous (normale opposée à l'esquisse), tirer ajoute vers le bas", () => {
    const bottom: FaceOutline = { ...top(), center: [50, 25, 0], normal: [0, 0, -1], edges: top().edges.map((e) => (e.kind === "line" ? { ...e, a: [e.a[0], e.a[1], 0] as P3, b: [e.b[0], e.b[1], 0] as P3 } : e)) };
    const f = sketchFrame("XY", 0);
    const poly = facePolygon(bottom, f)!;
    const band = bandPolygon(poly, polygonEdges(poly).find((e) => e.a[1] === 0 && e.b[1] === 0)!, 0, 18)!;
    const sign = bottom.normal[2] * f.normal[2] >= 0 ? 1 : -1; // as the tool does
    const r = new Recomputer();
    const result = r.recompute(plate({ id: "sk2", type: "sketch", name: "Tracé 1", plane: "XY", offset: 0, ...bandSketch(bottom, f, band) }, { id: "ex2", type: "extrude", name: "Extrusion 2", sketch: "sk2", distance: 20 * sign, operation: "join", target: "ex" } as Feature));
    expect(result.statuses.every((st) => st.state === "ok")).toBe(true);
    const out = r.output("ex2");
    if (out?.kind !== "solid") throw new Error("solid expected");
    expect(bodyMetrics(out.shape).bbox[0][2]).toBeCloseTo(-20, 6);
    r.dispose();
  });
});
