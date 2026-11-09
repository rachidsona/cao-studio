/** « Prolonger élément » : un caisson ou une Répartition s'allonge, par la face choisie, jusqu'au plan d'une autre. */
import { describe, expect, it } from "vitest";
import { extendable, extendElement } from "../../frontend/src/document/extend-element";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { frameOf } from "../../frontend/src/sketcher/frame";
import { isPartition } from "../../frontend/src/sketcher/partition-history";
import { createReferencePlate, type CabinetFeature, type CadDocument, type SketchFeature } from "../../frontend/src/document/types";

const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Haut d'angle", origin: [0, 0, 1450], width: 600, height: 700, depth: 350, thickness: 18, back: "none", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
const withCabinet = (patch: Partial<CabinetFeature> = {}): CadDocument => ({ ...createReferencePlate(), features: [{ ...cabinet, ...patch }] });
const done = (r: { doc: CadDocument; by: number } | string) => {
  if (typeof r === "string") throw new Error(r);
  return r;
};
const of = (doc: CadDocument) => doc.features.find((f) => f.id === "c1") as CabinetFeature;

describe("prolonger un élément", () => {
  it("un caisson s'allonge par son côté droit jusqu'au voisin : sa largeur, son origine ne bouge pas", () => {
    const r = done(extendElement(withCabinet(), "c1#0", { point: [600, 100, 1800], normal: [1, 0, 0] }, { point: [881, -50, 1700], normal: [-1, 0, 0] }));
    expect(r.by).toBe(281);
    expect([of(r.doc).width, of(r.doc).origin]).toEqual([881, [0, 0, 1450]]);
  });

  it("par son côté gauche, son devant ou son dessous : l'origine recule d'autant ; tourné, il suit ses axes", () => {
    const left = done(extendElement(withCabinet(), "c1#0", { point: [0, 0, 1800], normal: [-1, 0, 0] }, { point: [-100, 0, 0], normal: [1, 0, 0] }));
    expect([of(left.doc).width, of(left.doc).origin]).toEqual([700, [-100, 0, 1450]]);
    const down = done(extendElement(withCabinet(), "c1#0", { point: [300, 0, 1450], normal: [0, 0, -1] }, { point: [0, 0, 1400], normal: [0, 0, 1] }));
    expect([of(down.doc).height, of(down.doc).origin[2]]).toEqual([750, 1400]);
    // Turned a quarter: its width runs along Y.
    const turned = done(extendElement(withCabinet({ rotation: 90 }), "c1#0", { point: [0, 600, 1800], normal: [0, 1, 0] }, { point: [0, 650, 0], normal: [0, -1, 0] }));
    expect(of(turned.doc).width).toBe(650);
    // Shortened, too.
    expect(of(done(extendElement(withCabinet(), "c1#0", { point: [600, 0, 0], normal: [1, 0, 0] }, { point: [500, 0, 0], normal: [1, 0, 0] })).doc).width).toBe(500);
  });

  it("refuse des faces qui ne sont pas parallèles, un caisson trop petit, un corps qui n'est ni caisson ni Répartition", () => {
    expect(extendElement(withCabinet(), "c1#0", { point: [600, 0, 0], normal: [1, 0, 0] }, { point: [900, 0, 0], normal: [0, 1, 0] })).toMatch(/pas parallèles/);
    expect(extendElement(withCabinet(), "c1#0", { point: [600, 0, 0], normal: [1, 0, 0] }, { point: [20, 0, 0], normal: [-1, 0, 0] })).toMatch(/ne ferait plus que/);
    const plate = createReferencePlate();
    const body = plate.features.find((f) => f.type === "extrude")!.id;
    expect(extendable(plate, body)).toBeNull();
  });

  it("une Répartition s'allonge en longueur ; par son côté gauche, son esquisse se décale d'autant", () => {
    const placed = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2700 });
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    const board = made.doc.features.find((f) => (f.type === "extrude" || f.type === "panels" || f.type === "niche") && f.sketch === made.sketch)!.id;
    const frame = frameOf(sketch);
    const length = (doc: CadDocument) => {
      const r = (doc.features.find((f) => f.id === made.sketch) as SketchFeature).offsets!.find(isPartition)!;
      return isPartition(r) ? r.step.input.length : NaN;
    };
    const was = length(made.doc);
    const right = done(extendElement(made.doc, board, { point: frame.origin, normal: frame.u }, { point: frame.origin.map((c, i) => c + frame.u[i]! * 100) as [number, number, number], normal: frame.u.map((c) => -c) as [number, number, number] }));
    expect(length(right.doc)).toBeCloseTo(was + 100, 3);
    const left = done(extendElement(made.doc, board, { point: frame.origin, normal: frame.u.map((c) => -c) as [number, number, number] }, { point: frame.origin.map((c, i) => c - frame.u[i]! * 50) as [number, number, number], normal: frame.u }));
    expect(length(left.doc)).toBeCloseTo(was + 50, 3);
    const moved = frameOf(left.doc.features.find((f) => f.id === made.sketch) as SketchFeature).origin;
    expect(moved.map((c, i) => Math.round((c - frame.origin[i]!) * 10) / 10)).toEqual(frame.u.map((c) => Math.round(-c * 50 * 10) / 10 || 0));
  });
});
