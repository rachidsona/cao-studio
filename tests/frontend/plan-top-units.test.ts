/** Surmeubles du Plan de dressing : au-dessus de chaque zone droite faite, une Répartition aux mêmes cases, posée dessus. */
import { describe, expect, it } from "vitest";
import { topProblem, topStep, withPlan, withPlanChanged, withTopUnitsSet, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CadDocument, type DressingPlan, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { isPartition } from "../../frontend/src/sketcher/partition-history";
import { withOrganisationCopied } from "../../frontend/src/document/partition-copy";

function dressing(): { doc: CadDocument; plan: string } {
  const made = withPlan({ ...createReferencePlate(), features: [] }, { ...PLAN, model: "I", lengthA: 2000, height: 2200 });
  const zone = planZones({ ...PLAN, model: "I", lengthA: 2000, height: 2200 })[0]!;
  const filled = withZonePartition(made.doc, made.id, zone);
  if (typeof filled === "string") throw new Error(filled);
  return { doc: filled.doc, plan: made.id };
}
const tops = (doc: CadDocument) => doc.features.filter((f): f is SketchFeature => f.type === "sketch" && f.name.startsWith("Surmeubles") && !!f.offsets?.some(isPartition));
const stepOf = (s: SketchFeature) => s.offsets!.find(isPartition)!.step as Extract<NonNullable<SketchFeature["offsets"]>[number]["step"], { kind: "partition" }>;
const doorsOf = (doc: CadDocument, sketch: string) => doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === sketch && f.fill === "door");
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
    // Its doors: « Porte sur niches », one per case, left and right in turn — or lift-up ones.
    expect(high.doors).toBeUndefined();
    expect(doorsOf(withTop, top!.id).map((d) => [d.niche, d.hinges])).toEqual(Array.from({ length: high.input.cases }, (_, k) => [[k], [k % 2 ? "right" : "left"]]));
    expect(planOf(withTop, plan).top).toEqual({ height: 400, doors: true });
    const lifted = withTopUnitsSet(withTop, plan, { height: 400, doors: "lift" });
    expect(doorsOf(lifted, top!.id).every((d) => d.hinges?.[0] === "top")).toBe(true);
    expect(doorsOf(lifted, top!.id)).toHaveLength(high.input.cases);
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
    expect(doorsOf(withTop, corner!.id)).toHaveLength(0);
    expect(stepOf(corner!).origin![1]).toBe(2200);
    expect(withTop.features.some((f) => f.name.startsWith("Surmeubles — ") && f.name.endsWith("— côté"))).toBe(true);
    expect(tops(withTop).filter((s) => !s.clip).every((s) => doorsOf(withTop, s.id).length > 0)).toBe(true);
  });

  it("gardés : ce qu'on y change (des portes relevables, une case) reste quand le plan change ; ils s'ouvrent dans leur outil", () => {
    const { doc, plan } = dressing();
    const placed = withTopUnitsSet(doc, plan, { height: 400, doors: true });
    const at = topStep(placed, planOf(placed, plan), "A")!;
    expect(at).not.toBeNull();
    // Changed by hand in its Répartition: its doors opening on the right, 3 cases.
    const edited = { ...placed, features: placed.features.map((f) => (f.type === "niche" && f.sketch === at.sketch ? { ...f, hinges: ["top"] } : f.id !== at.sketch || f.type !== "sketch" ? f : { ...f, offsets: f.offsets!.map((r) => (r.id !== at.step || r.step?.kind !== "partition" ? r : { ...r, step: { ...r.step, input: { ...r.step.input, cases: 3, dividers: ["single", "single"], widths: undefined } } })) })) } as CadDocument;
    const changed = withPlanChanged(edited, plan, { ...planOf(edited, plan), height: 2400, lengthA: 2400 });
    if (typeof changed === "string") throw new Error(changed);
    const [top] = tops(changed.doc);
    expect(top!.id).toBe(at.sketch);
    const step = stepOf(top!);
    expect([step.input.cases, step.input.height, step.origin![1]]).toEqual([3, 400, 2400]);
    expect(doorsOf(changed.doc, at.sketch).every((d) => d.hinges?.[0] === "top")).toBe(true);
  });

  it("la Pipette de forme copie un surmeuble sur un autre, ses Porte sur niches comprises", () => {
    const settings = { ...PLAN, model: "L-right" as const, lengthA: 2000, lengthC: 2000, height: 2200 };
    const made = withPlan({ ...createReferencePlate(), features: [] }, settings);
    let doc = made.doc;
    for (const zone of planZones(settings).filter((z) => z.kind === "run")) {
      const filled = withZonePartition(doc, made.id, zone);
      if (typeof filled === "string") throw new Error(filled);
      doc = filled.doc;
    }
    doc = withTopUnitsSet(doc, made.id, { height: 400, doors: "lift" });
    const [a, c] = tops(doc);
    expect(c).toBeDefined();
    // C opened at the side first, then given A's form: A's lift-up doors.
    const sideways = { ...doc, features: doc.features.map((f) => (f.type === "niche" && f.sketch === c!.id ? { ...f, hinges: ["left"] } : f)) } as CadDocument;
    const copied = withOrganisationCopied(sideways, a!.id, c!.id);
    if (typeof copied === "string") throw new Error(copied);
    expect(doorsOf(copied, c!.id).length).toBe(doorsOf(copied, a!.id).length);
    expect(doorsOf(copied, c!.id).every((d) => d.hinges?.[0] === "top")).toBe(true);
  });

  it("pas sous un rampant, et de 20 à 100 cm", () => {
    expect(topProblem({ ...PLAN, roof: "left" }, { height: 400 })).toMatch(/rampant/);
    expect(topProblem(PLAN, { height: 100 })).toMatch(/20 à 100 cm/);
    expect(topProblem(PLAN, { height: 400 })).toBeNull();
  });
});
