/** Surmeubles du Plan de dressing : au-dessus de chaque zone droite faite, une Répartition aux mêmes cases, posée dessus. */
import { describe, expect, it } from "vitest";
import { topProblem, withPlan, withPlanChanged, withTopUnitsSet, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CadDocument, type DressingPlan, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { isPartition } from "../../frontend/src/sketcher/partition-history";

function dressing(): { doc: CadDocument; plan: string } {
  const made = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2000, height: 2200 });
  const zone = planZones({ ...PLAN, model: "I", lengthA: 2000, height: 2200 })[0]!;
  const filled = withZonePartition(made.doc, made.id, zone);
  if (typeof filled === "string") throw new Error(filled);
  return { doc: filled.doc, plan: made.id };
}
const tops = (doc: CadDocument) => doc.features.filter((f): f is SketchFeature => f.type === "sketch" && f.name.startsWith("Surmeubles") && !!f.offsets?.some(isPartition));
const stepOf = (s: SketchFeature) => s.offsets!.find(isPartition)!.step as Extract<NonNullable<SketchFeature["offsets"]>[number]["step"], { kind: "partition" }>;
const planOf = (doc: CadDocument, id: string) => (doc.features.find((f) => f.id === id) as SketchFeature).dressingPlan as DressingPlan;

describe("surmeubles du plan de dressing", () => {
  it("posés sur la zone, à sa longueur et ses cases, de leur hauteur, avec leurs portes ; retirés d'un clic", () => {
    const { doc, plan } = dressing();
    const below = doc.features.find((f): f is SketchFeature => f.type === "sketch" && f.name.startsWith("Plan — "))!;
    const withTop = withTopUnitsSet(doc, plan, { height: 400, doors: true });
    expect(() => parseDocument(JSON.parse(JSON.stringify(withTop)))).not.toThrow();
    const [top] = tops(withTop);
    expect(top).toBeDefined();
    const [low, high] = [stepOf(below), stepOf(top!)];
    expect(high.input.length).toBe(low.input.length);
    expect(high.input.cases).toBe(low.input.cases);
    expect([high.input.height, high.input.plinth]).toEqual([400, 0]);
    // On top of the zone: its origin at the zone's height.
    expect(high.origin).toEqual([low.origin![0], 2200]);
    expect(high.doors).toBeDefined();
    expect(planOf(withTop, plan).top).toEqual({ height: 400, doors: true });
    // The plan changed: they follow, at its new height.
    const changed = withPlanChanged(withTop, plan, { ...planOf(withTop, plan), height: 2400 });
    if (typeof changed === "string") throw new Error(changed);
    expect(tops(changed.doc)).toHaveLength(1);
    expect(stepOf(tops(changed.doc)[0]!).origin).toEqual([low.origin![0], 2400]);
    // Taken away.
    const none = withTopUnitsSet(changed.doc, plan, null);
    expect(tops(none)).toHaveLength(0);
    expect(planOf(none, plan).top).toBeUndefined();
  });

  it("sur un angle aussi : découpés à son contour comme dessous, avec leur dernier côté, ouverts", () => {
    const settings = { ...PLAN, model: "L-right-cut" as const, lengthA: 2000, height: 2200 };
    const made = withPlan({ ...createReferencePlate(), features: [] }, settings);
    let doc = made.doc;
    for (const zone of planZones(settings)) {
      const filled = withZonePartition(doc, made.id, zone);
      if (typeof filled === "string") throw new Error(filled);
      doc = filled.doc;
    }
    const withTop = withTopUnitsSet(doc, made.id, { height: 400, doors: true });
    const corner = tops(withTop).find((s) => s.clip);
    expect(corner).toBeDefined();
    expect(stepOf(corner!).doors).toBeUndefined();
    expect(stepOf(corner!).origin![1]).toBe(2200);
    expect(withTop.features.some((f) => f.name.startsWith("Surmeubles — ") && f.name.endsWith("— côté"))).toBe(true);
    expect(tops(withTop).filter((s) => !s.clip).every((s) => stepOf(s).doors)).toBe(true);
  });

  it("pas sous un rampant, et de 20 à 100 cm", () => {
    expect(topProblem({ ...PLAN, roof: "left" }, { height: 400 })).toMatch(/rampant/);
    expect(topProblem(PLAN, { height: 100 })).toMatch(/20 à 100 cm/);
    expect(topProblem(PLAN, { height: 400 })).toBeNull();
  });
});
