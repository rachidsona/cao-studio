/** « Aménager ce corps » aux parois en biais : les étagères vont jusqu'aux parois, en prennent la pente et les suivent. */
import { beforeAll, describe, expect, it } from "vitest";
import { withBodyFurnished, type Opening } from "../../frontend/src/document/body-opening";
import { withRecipe } from "../../frontend/src/document/niche-recipe";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, NicheFeature, SketchFeature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { isPartition } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

type Vec = [number, number];

/** A wall seen from the top (x, y), 720 high: its sketch and its extrusion, its body named `id`. */
function wall(id: string, ...v: Vec[]): Feature[] {
  const g: SketchGeometry = { points: v.map((p, i) => ({ id: `${id}p${i}`, x: p[0], y: p[1] })), curves: v.map((_, i) => ({ id: `${id}l${i}`, kind: "line" as const, p1: `${id}p${i}`, p2: `${id}p${(i + 1) % v.length}` })), constraints: [] };
  return [{ id: `s${id}`, type: "sketch", name: `Esquisse ${id}`, plane: "XY", offset: 0, ...g }, { id, type: "extrude", name: id, sketch: `s${id}`, distance: 720, operation: "new" }];
}

/** A frame 600 × 400 open at the top, its left wall leaning in: its inside goes from x −282 (back) to −232 (front). */
const walls = (lean: number): Feature[] => [
  ...wall("wl", [-300, -182], [-282, -182], [-282 + lean, 182], [-300 + lean, 182]),
  ...wall("wr", [282, -182], [300, -182], [300, 182], [282, 182]),
  ...wall("wb", [-300, -200], [300, -200], [300, -182], [-300, -182]),
  ...wall("wf", [-300, 182], [300, 182], [300, 200], [-300, 200]),
];
const opening: Opening = { frame: { origin: [-300, -200, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, width: 564, height: 364, depth: 720, wall: 18 };

function furnished(lean: number, tilt?: [number, number, number]): CadDocument {
  const base = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: walls(lean) } as CadDocument;
  const made = withBodyFurnished(base, opening, "Cadre", ["wl", "wr", "wb", "wf"]);
  if (typeof made === "string") throw new Error(made);
  const sketch = made.doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch")!;
  const partition = sketch.offsets!.find(isPartition)!.id;
  const filled = withRecipe(made.doc, { sketch: made.sketch, partition, path: [0] }, { steps: [{ at: [], input: { count: 2, thickness: 18, mode: "equal", fixed: 0, ...(tilt ? { lean: tilt } : {}) } }], equipment: [] });
  if (typeof filled === "string") throw new Error(filled);
  return filled;
}

/** The shelves' boxes, by their place from the back. */
function shelves(doc: CadDocument): number[][][] {
  const r = new Recomputer();
  try {
    const result = r.recompute(doc);
    expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
    return doc.features
      .filter((f) => f.type === "extrude" && f.host)
      .flatMap((f) => {
        const out = r.output(f.id);
        return out?.kind === "solid" ? [out.shape.boundingBox.bounds.map((p) => p.map((x) => Math.round(x)))] : [];
      })
      .sort((a, b) => a[0]![1]! - b[0]![1]!);
  } finally {
    r.dispose();
  }
}

describe("un corps aux parois en biais, aménagé", () => {
  it("ses étagères gardent la mesure de l'ouverture quand les parois sont droites", () => {
    const boxes = shelves(furnished(0));
    expect(boxes).toHaveLength(2);
    for (const [lo, hi] of boxes) expect([lo![0], hi![0]]).toEqual([-282, 282]);
  }, 120_000);

  it("chaque étagère va jusqu'à la paroi penchée et en prend la pente, l'autre bout contre la paroi droite", () => {
    const boxes = shelves(furnished(50));
    expect(boxes).toHaveLength(2);
    // The inside of the leaning wall at y: −282 + 50 (y + 182) / 364; the shelf's end runs from its back to its front.
    const inside = (y: number) => Math.round(-282 + (50 * (y + 182)) / 364);
    for (const [lo, hi] of boxes) {
      expect(lo![0]).toBe(inside(lo![1]!));
      expect(hi![0]).toBe(282);
    }
    // The one at the front reaches farther in than the one at the back.
    expect(boxes[1]![0]![0]!).toBeGreaterThan(boxes[0]![0]![0]!);
  }, 120_000);

  it("d'équerre à la paroi penchée : chaque étagère tourne dans son plan, et va toujours d'une paroi à l'autre", () => {
    const boxes = shelves(furnished(50, [364, -50, 0]));
    expect(boxes).toHaveLength(2);
    for (const [lo, hi] of boxes) {
      // Turned by about 7.8°: across 564 mm, it climbs some 77 mm more than its 18 of thickness.
      expect(hi![1]! - lo![1]!).toBeGreaterThan(80);
      expect(hi![0]).toBe(282);
      expect(lo![0]!).toBeGreaterThan(-283);
    }
  }, 120_000);

  it("parallèles à la paroi penchée : chaque étagère est tournée le long d'elle, et va du dessous au dessus", () => {
    // Along the wall's line in the plane: the sketch's normal × the wall's normal.
    const boxes = shelves(furnished(50, [50, 364, 0]));
    expect(boxes.length).toBeGreaterThan(0);
    for (const [lo, hi] of boxes) {
      expect(hi![1]! - lo![1]!).toBeGreaterThan(300);
      expect(hi![0]! - lo![0]!).toBeLessThan(100);
    }
  }, 120_000);

  it("tournée dans une niche bordée d'une cloison : elle va de la paroi penchée jusqu'à la cloison", () => {
    const base = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: walls(50) } as CadDocument;
    const made = withBodyFurnished(base, opening, "Cadre", ["wl", "wr", "wb", "wf"]);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch")!;
    const partition = sketch.offsets!.find(isPartition)!.id;
    const input = { count: 1, thickness: 18, mode: "equal" as const, fixed: 0 };
    const filled = withRecipe(made.doc, { sketch: made.sketch, partition, path: [0] }, { steps: [{ at: [], input: { ...input, vertical: true } }, { at: [0], input: { ...input, lean: [364, -200, 0] } }], equipment: [] });
    if (typeof filled === "string") throw new Error(filled);
    const boxes = shelves(filled);
    // The cloison (upright, in the middle) and the shelf turned in the niche at its left.
    const shelf = boxes.find(([lo, hi]) => hi![0]! - lo![0]! > 100 && hi![1]! - lo![1]! < 200)!;
    expect(shelf).toBeDefined();
    expect(shelf[1]![0]).toBe(-9);
    expect(shelf[1]![1]! - shelf[0]![1]!).toBeGreaterThan(40);
  }, 120_000);

  /** The opening with one door over it (inset, 3 mm of gap): its volume and its box. */
  function door(lean: number): { volume: number; box: number[][] } {
    const base = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: walls(lean) } as CadDocument;
    const made = withBodyFurnished(base, opening, "Cadre", ["wl", "wr", "wb", "wf"]);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch")!;
    const partition = sketch.offsets!.find(isPartition)!.id;
    const front: NicheFeature = { id: "po1", type: "niche", name: "Porte 1", sketch: made.sketch, partition, niche: [0], fill: "door", mount: "inset", diameter: 25, drop: 60, drawers: 1, gap: 3, thickness: 18, handles: false };
    const doc = { ...made.doc, features: [...made.doc.features, front] };
    const r = new Recomputer();
    try {
      const result = r.recompute(doc);
      expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
      const out = r.output("po1");
      if (out?.kind !== "solids") throw new Error("pas de porte");
      const big = out.shapes.reduce((a, b) => (bodyMetrics(b).volume > bodyMetrics(a).volume ? b : a));
      return { volume: bodyMetrics(big).volume, box: big.boundingBox.bounds.map((p) => p.map((x) => Math.round(x))) };
    } finally {
      r.dispose();
    }
  }

  it("la porte de la niche suit la paroi penchée, son jeu gardé ; droite, elle ne change pas", () => {
    const square = door(0);
    const slanted = door(50);
    // Square: the opening less its 3 mm of gap on each side.
    expect([square.box[0]![0], square.box[1]![0]]).toEqual([-279, 279]);
    // Slanted: its left edge follows the wall 3 mm off it — a strip of 50 × 364 / 2 less, 18 thick.
    expect(slanted.volume).toBeLessThan(square.volume - 0.8 * ((50 * 364) / 2) * 18);
    expect(slanted.box[1]![0]).toBe(279);
  }, 120_000);
});
