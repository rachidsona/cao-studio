/** « Prolonger élément » : une Répartition entière en profondeur, et un élément prolongé de la mesure tapée. */
import { beforeAll, describe, expect, it } from "vitest";
import { extendElement } from "../../frontend/src/document/extend-element";
import { extendBy, type FacePlane } from "../../frontend/src/document/extend-reach";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type ExtrudeFeature, type FaceRef, type SketchFeature, type Vec3 } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { Recomputer } from "../../frontend/src/history/recompute";
import { frameOf } from "../../frontend/src/sketcher/frame";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** How far the bodies of a sketch's features reach along `n` (mm): their nearest and farthest. */
function reach(doc: CadDocument, sketchId: string, n: Vec3): [number, number] {
  const r = new Recomputer();
  r.recompute(doc);
  const values: number[] = [];
  for (const f of doc.features) {
    if (!("sketch" in f) || f.sketch !== sketchId) continue;
    const out = r.output(f.id);
    const shapes = out?.kind === "solid" ? [out.shape] : out?.kind === "solids" ? out.shapes : [];
    for (const shape of shapes) {
      const [lo, hi] = shape.boundingBox.bounds;
      for (let k = 0; k < 8; k++) values.push([0, 1, 2].reduce((sum, i) => sum + ((k >> i) & 1 ? hi : lo)[i]! * n[i]!, 0));
    }
  }
  r.dispose();
  return [Math.min(...values), Math.max(...values)];
}

const done = <T,>(r: T | string): T => {
  if (typeof r === "string") throw new Error(r);
  return r;
};

/** A dressing of 2,70 m made by the Plan de dressing: its sketch and one of its boards. */
function dressing() {
  const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
  const made = done(withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!));
  const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
  const board = made.doc.features.find((f) => (f.type === "extrude" || f.type === "panels" || f.type === "niche") && f.sketch === made.sketch)!.id;
  return { doc: made.doc, sketchId: made.sketch, board, frame: frameOf(sketch) };
}
const depths = (doc: CadDocument, id: string) => ((doc.features.find((f) => f.id === id) as SketchFeature).offsets ?? []).flatMap((r) => (r.step?.depth !== undefined ? [r.step.depth] : []));
const along = (p: Vec3, n: Vec3, by: number): Vec3 => [p[0] + n[0] * by, p[1] + n[1] * by, p[2] + n[2] * by];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

describe("prolonger une Répartition en profondeur", () => {
  it("par son devant : toutes ses étapes plus profondes d'autant, son esquisse en place", () => {
    const { doc, sketchId, board, frame } = dressing();
    const was = depths(doc, sketchId);
    expect(was.length).toBeGreaterThan(0);
    const front = along(frame.origin, frame.normal, was[0]!);
    const r = done(extendElement(doc, board, { point: front, normal: frame.normal }, { point: along(front, frame.normal, 100), normal: neg(frame.normal) }));
    expect(r.by).toBe(100);
    expect(depths(r.doc, sketchId)).toEqual(was.map((d) => d + 100));
    expect(frameOf(r.doc.features.find((f) => f.id === sketchId) as SketchFeature).origin).toEqual(frame.origin);
    expect(() => parseDocument(r.doc)).not.toThrow();
    // Made by the kernel: its back where it was, its front 100 mm farther out.
    const [back, out] = reach(doc, sketchId, frame.normal);
    const [back2, out2] = reach(r.doc, sketchId, frame.normal);
    expect(back2).toBeCloseTo(back, 1);
    expect(out2 - out).toBeCloseTo(100, 1);
  }, 60_000);

  it("par son fond : plus profonde, son esquisse reculée d'autant ; trop mince, refusée", () => {
    const { doc, sketchId, board, frame } = dressing();
    const was = depths(doc, sketchId);
    const r = done(extendElement(doc, board, { point: frame.origin, normal: neg(frame.normal) }, { point: along(frame.origin, frame.normal, -50), normal: frame.normal }));
    expect(depths(r.doc, sketchId)).toEqual(was.map((d) => d + 50));
    const moved = frameOf(r.doc.features.find((f) => f.id === sketchId) as SketchFeature).origin;
    expect(moved.map((c, i) => Math.round((c - frame.origin[i]!) * 10) / 10)).toEqual(frame.normal.map((c) => Math.round(-c * 50 * 10) / 10 || 0));
    expect(extendElement(doc, board, { point: frame.origin, normal: neg(frame.normal) }, { point: along(frame.origin, frame.normal, Math.min(...was) - 20), normal: frame.normal })).toMatch(/ne serait plus profonde que de 2 cm/);
  });
});

describe("prolonger de la mesure tapée", () => {
  const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
  const doc: CadDocument = { ...createReferencePlate(), features: [cabinet] };
  const right: FacePlane = { point: [600, 280, 400], normal: [1, 0, 0], points: [[600, 0, 0], [600, 560, 720]] };

  it("un caisson s'allonge ou se raccourcit d'autant, sans autre élément", () => {
    const r = done(extendBy(doc, "c1#0", right, 150, undefined));
    expect(r).toMatchObject({ by: 150, id: "c1", message: "« Bas » prolongé de 15 cm." });
    expect((r.doc.features[0] as CabinetFeature).width).toBe(750);
    const left = done(extendBy(doc, "c1#0", { ...right, point: [0, 280, 400], normal: [-1, 0, 0] }, -100, undefined));
    expect((left.doc.features[0] as CabinetFeature)).toMatchObject({ width: 500, origin: [100, 0, 0] });
    expect(left.message).toBe("« Bas » raccourci de 10 cm.");
    expect(extendBy(doc, "c1#0", right, 0, undefined)).toMatch(/Tapez de combien/);
  });

  it("une Répartition entière, en profondeur aussi ; une pièce seule a sa face tirée", () => {
    const { doc: d, sketchId, board, frame } = dressing();
    const was = depths(d, sketchId);
    const r = done(extendBy(d, board, { point: along(frame.origin, frame.normal, was[0]!), normal: frame.normal, points: [] }, 80, undefined));
    expect(depths(r.doc, sketchId)).toEqual(was.map((x) => x + 80));
    const face: FaceRef = { type: "PLANE", center: [600, 280, 720], rel: [0.5, 0.5, 1], normal: [0, 0, 1], area: 600 * 560 };
    const piece = done(extendBy(doc, "c1#0", { point: [300, 280, 720], normal: [0, 0, 1], points: [] }, 40, face, true));
    expect(piece.doc.features.at(-1)).toMatchObject({ type: "extrude", distance: 40, operation: "join", faces: [face] } satisfies Partial<ExtrudeFeature>);
  });
});
