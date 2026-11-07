/** Une cote de pièce tapée dans la vue : le caisson suit, une planche suit, ce qu'on ne sait pas changer le dit. */
import { describe, expect, it } from "vitest";
import { withPartitionSize } from "../../frontend/src/document/niche-size";
import { withPieceSize } from "../../frontend/src/document/piece-size";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type ExtrudeFeature, type SketchFeature } from "../../frontend/src/document/types";
import { isPartition } from "../../frontend/src/sketcher/partition-history";
import { pieceKey } from "../../frontend/src/viewport/joinery-view";

const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 800, depth: 500, thickness: 18, back: "none", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
const withCabinet = (patch: Partial<CabinetFeature> = {}): CadDocument => ({ ...createReferencePlate(), features: [{ ...cabinet, ...patch }] });
const done = (made: CadDocument | string) => {
  if (typeof made === "string") throw new Error(made);
  return made;
};
const feature = <T>(doc: CadDocument, id: string) => doc.features.find((f) => f.id === id) as T;

describe("une cote de pièce changée dans la vue", () => {
  it("garde la différence entre la pièce et le caisson", () => {
    const doc = done(withPieceSize(withCabinet(), "c1#4", 0, 564, 664));
    expect(feature<CabinetFeature>(doc, "c1").width).toBe(700);
    expect(feature<CabinetFeature>(done(withPieceSize(withCabinet(), "c1#0", 2, 800, 900)), "c1").height).toBe(900);
  });

  it("suit la rotation du caisson", () => {
    const doc = done(withPieceSize(withCabinet({ rotation: 90 }), "c1#0", 1, 600, 650));
    expect(feature<CabinetFeature>(doc, "c1").width).toBe(650);
    expect(feature<CabinetFeature>(done(withPieceSize(withCabinet({ rotation: 90 }), "c1#0", 0, 500, 550)), "c1").depth).toBe(550);
  });

  it("refuse un caisson impossible", () => {
    expect(withPieceSize(withCabinet(), "c1#0", 0, 600, 30)).toBeTypeOf("string");
  });

  it("change une plaque : sa distance, ou le côté haut de son esquisse", () => {
    const plate = createReferencePlate();
    const board = plate.features.find((f): f is ExtrudeFeature => f.type === "extrude")!;
    const sketch = plate.features.find((f): f is SketchFeature => f.type === "sketch")!;
    const axis = sketch.plane === "XY" ? 2 : sketch.plane === "XZ" ? 1 : 0;
    const thick = done(withPieceSize(plate, board.id, axis, Math.abs(board.distance), 44));
    expect(Math.abs(feature<ExtrudeFeature>(thick, board.id).distance)).toBe(44);

    const xs = sketch.points.map((p) => p.x);
    const wide = Math.max(...xs) - Math.min(...xs);
    const inPlane = sketch.plane === "YZ" ? 1 : 0;
    const made = feature<SketchFeature>(done(withPieceSize(plate, board.id, inPlane, wide, wide + 50)), sketch.id);
    const after = made.points.map((p) => p.x);
    expect(Math.max(...after) - Math.min(...after)).toBeCloseTo(wide + 50);
    expect(Math.min(...after)).toBeCloseTo(Math.min(...xs));
  });

  it("change la longueur d'une Répartition entière", () => {
    const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    const before = feature<SketchFeature>(made.doc, made.sketch).offsets!.find(isPartition)!;
    if (!isPartition(before)) throw new Error("pas de répartition");
    const doc = done(withPartitionSize(made.doc, made.sketch, "x", before.step.input.length, 2500));
    const after = feature<SketchFeature>(doc, made.sketch).offsets!.find(isPartition)!;
    if (!isPartition(after)) throw new Error("pas de répartition");
    expect(after.step.input.length).toBe(2500);
    expect(withPartitionSize(made.doc, made.sketch, "x", 123, 2500)).toBeTypeOf("string");
  });
});

describe("l'aperçu d'une étape modifiée", () => {
  it("reconnaît une pièce déjà construite, et voit celle qui change", () => {
    const side: [number, number][] = [[0, 0], [18, 0], [18, 2500], [0, 2500]];
    const built = pieceKey(side, 600);
    expect(pieceKey(side.map(([x, y]) => [x + 0.01, y]), 600)).toBe(built);
    expect(pieceKey([[0, 0], [18, 0], [18, 2200], [0, 2200]], 600)).not.toBe(built);
    expect(pieceKey(side, 500)).not.toBe(built);
  });
});
