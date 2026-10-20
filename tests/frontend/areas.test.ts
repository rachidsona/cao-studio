/** Choosing which areas of a sketch to extrude: the frame, the middle, an island… */
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { addRectangle } from "../../frontend/src/sketcher/edit";
import { extractLoops, interiorPoint, loopAt, pointInPolygon, sketchFaces } from "../../frontend/src/sketcher/loops";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
const rect = (g: SketchGeometry, x0: number, y0: number, x1: number, y1: number) => addRectangle(g, { at: [x0, y0] }, { at: [x1, y1] }).geometry;
/** Frame: 40 × 30 outside, 20 × 14 inside (areas 1200 and 280). */
const frame = () => rect(rect(empty(), 0, 0, 40, 30), 10, 8, 30, 22);

function volumeOf(geometry: SketchGeometry, regions?: [number, number][]) {
  const sketch: Feature = { id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...geometry };
  const extrude: Feature = { id: "ex", type: "extrude", name: "Extrusion", sketch: "sk", distance: 5, operation: "new", ...(regions ? { regions } : {}) };
  const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch, extrude] };
  const r = new Recomputer();
  const result = r.recompute(doc);
  const out = r.output("ex");
  const status = result.statuses.find((s) => s.id === "ex");
  const volume = out?.kind === "solid" ? bodyMetrics(out.shape).volume : null;
  r.dispose();
  return { volume, status };
}

describe("zones d'une esquisse", () => {
  it("le cadre et le milieu sont deux zones distinctes", () => {
    const loops = extractLoops(frame());
    const faces = sketchFaces(loops);
    expect(faces.map((f) => f.depth).sort()).toEqual([0, 1]);
    const outer = faces.find((f) => f.depth === 0)!;
    const inner = faces.find((f) => f.depth === 1)!;
    expect(outer.holes).toHaveLength(1);
    expect(outer.children).toEqual([inner.loop]);
    expect(inner.holes).toHaveLength(0);
  });

  it("un point intérieur désigne sa zone, jamais un trou", () => {
    const loops = extractLoops(frame());
    for (const face of sketchFaces(loops)) {
      const p = interiorPoint(face);
      expect(pointInPolygon(p, face.outer)).toBe(true);
      for (const hole of face.holes) expect(pointInPolygon(p, hole)).toBe(false);
      expect(loopAt(loops, p)).toBe(face.loop);
    }
    expect(loopAt(loops, [-5, -5])).toBe(-1);
  });
});

describe("extrusion de zones choisies", () => {
  it("sans choix : les zones pleines (règle pair-impair), comme avant", () => {
    expect(volumeOf(frame()).volume).toBeCloseTo((1200 - 280) * 5, 6);
  });

  it("le milieu seul", () => {
    expect(volumeOf(frame(), [[20, 15]]).volume).toBeCloseTo(280 * 5, 6);
  });

  it("le cadre seul", () => {
    expect(volumeOf(frame(), [[5, 15]]).volume).toBeCloseTo((1200 - 280) * 5, 6);
  });

  it("le cadre et le milieu ensemble : le rectangle plein", () => {
    expect(volumeOf(frame(), [[5, 15], [20, 15]]).volume).toBeCloseTo(1200 * 5, 6);
  });

  it("un îlot dans le trou : sa zone seule, ou le milieu sans l'îlot", () => {
    const nested = rect(frame(), 15, 12, 25, 18); // island 10 × 6 = 60
    expect(volumeOf(nested, [[20, 15]]).volume).toBeCloseTo(60 * 5, 6);
    expect(volumeOf(nested, [[12, 15]]).volume).toBeCloseTo((280 - 60) * 5, 6);
  });

  it("une zone qui n'existe plus donne une erreur claire, sans géométrie fausse", () => {
    const { volume, status } = volumeOf(frame(), [[100, 100]]);
    expect(volume).toBeNull();
    expect(status?.state).toBe("error");
    expect(status?.message).toMatch(/n'existe plus/);
  });

  it("le document refuse des zones mal formées", () => {
    const doc = (regions: unknown) => ({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [{ id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, points: [], curves: [], constraints: [] }, { id: "ex", type: "extrude", name: "X", sketch: "sk", distance: 5, operation: "new", regions }] });
    expect(() => parseDocument(doc([[1, 2]]))).not.toThrow();
    expect(() => parseDocument(doc([[1]]))).toThrow(/zones/);
    expect(() => parseDocument(doc([]))).toThrow(/zones/);
  });
});
