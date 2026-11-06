/** Les formes du plan de dressing : leurs zones, et le mur qui passe à chaque angle droit. */
import { describe, expect, it } from "vitest";
import { planOf, withPlan, withPlanChanged, withZonePartition } from "../../frontend/src/document/plan-layout";
import { cornerJoints, PLAN, PLAN_MODELS, planProblem, planZones, type PlanModel } from "../../frontend/src/document/plan-shapes";
import { createReferencePlate, type CadDocument, type DressingPlan, type SketchFeature } from "../../frontend/src/document/types";
import { isPartition } from "../../frontend/src/sketcher/partition-history";

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const plan = (patch: Partial<DressingPlan> = {}): DressingPlan => ({ ...PLAN, ...patch });
const area = (outline: [number, number][]) => Math.abs(outline.reduce((sum, [x, y], i) => { const [u, v] = outline[(i + 1) % outline.length]!; return sum + x * v - u * y; }, 0)) / 2;

describe("formes de plan", () => {
  const ids = (patch: Partial<DressingPlan>) => planZones(plan(patch)).map((z) => z.id);
  const box = (outline: [number, number][]) => [Math.min(...outline.map((p) => p[0])), Math.min(...outline.map((p) => p[1])), Math.max(...outline.map((p) => p[0])), Math.max(...outline.map((p) => p[1]))];
  const zone = (patch: Partial<DressingPlan>, id: string) => planZones(plan(patch)).find((z) => z.id === id)!;

  it("U à un seul pan coupé : l'autre angle reste droit", () => {
    expect(ids({ model: "U-cut-left" })).toEqual(["left", "A", "B", "C"]);
    expect(ids({ model: "U-cut-right" })).toEqual(["A", "right", "B", "C"]);
    expect(zone({ model: "U-cut-left" }, "A").run).toMatchObject({ start: 1000, length: 2000 });
    expect(zone({ model: "U-cut-left" }, "B").run.length).toBe(1000);
    expect(zone({ model: "U-cut-left" }, "C").run.length).toBe(1400);
  });

  it("U presque fermé : le mur D part du mur B ou du mur C, et laisse l'entrée", () => {
    expect(box(zone({ model: "G-left", lengthE: 1000 }, "D").outline)).toEqual([600, -2000, 1600, -1400]);
    expect(box(zone({ model: "G-right", lengthE: 1000 }, "D").outline)).toEqual([1400, -2000, 2400, -1400]);
    expect(planProblem(plan({ model: "G-left", lengthE: 1500 }))).toMatch(/entrée/);
    expect(planProblem(plan({ model: "G-left", lengthB: 1500 }))).toMatch(/passage/);
  });

  it("cloison centrale : deux linéaires dos à dos, perpendiculaires au mur A", () => {
    expect(box(zone({ model: "T", lengthB: 1500 }, "E").outline)).toEqual([900, -2100, 1500, -600]);
    expect(box(zone({ model: "T", lengthB: 1500 }, "F").outline)).toEqual([1500, -2100, 2100, -600]);
  });

  it("dos à dos : une face de chaque côté, sans mur", () => {
    const zones = planZones(plan({ model: "back" }));
    expect(zones.map((z) => z.label)).toEqual(["Face avant", "Face arrière"]);
    expect(box(zones[1]!.outline)).toEqual([0, 0, 3000, 600]);
  });

  it("deux profondeurs : le mur se partage, chaque partie à sa profondeur", () => {
    const zones = planZones(plan({ model: "depths", lengthA: 3000, lengthE: 1000, depth: 600, depthB: 350 }));
    expect(zones.map((z) => [z.run.start, z.run.length, z.run.depth])).toEqual([[0, 2000, 600], [2000, 1000, 350]]);
  });

  it("îlot : à un passage devant le mur A, au milieu, sans toucher les autres zones", () => {
    expect(box(zone({ model: "U", island: true, aisle: 800, islandLength: 1000, islandDepth: 500 }, "I").outline)).toEqual([1000, -1900, 2000, -1400]);
    expect(ids({ model: "T", island: true })).not.toContain("I");
    expect(planProblem(plan({ model: "G-left", island: true, aisle: 1000, lengthB: 2100, lengthE: 1200 }))).toMatch(/îlot touche/i);
    expect(planProblem(plan({ model: "I", island: true, aisle: 300 }))).toMatch(/passage/i);
  });

  it("angle arrondi : un quart d'arc entre les deux fronts, dans l'emprise du pan coupé", () => {
    const round = zone({ model: "L-right-round" }, "right");
    const cut = zone({ model: "L-right-cut" }, "right");
    expect(round.outline.length).toBeGreaterThan(20);
    expect(area(round.outline)).toBeLessThan(area(cut.outline));
    expect(box(round.outline)).toEqual(box(cut.outline));
    expect(round.clip!.length).toBeGreaterThan(20);
    expect(planProblem(plan({ model: "U-round", cornerA: 650 }))).toMatch(/arrondi/);
  });

  it("une zone a les mêmes cotes dans son contour et dans sa répartition, pour toutes les formes", () => {
    for (const model of Object.keys(PLAN_MODELS) as PlanModel[])
      for (const z of planZones(plan({ model }))) if (z.kind === "run") expect(area(z.outline), `${model} ${z.id}`).toBeCloseTo(z.run.length * z.run.depth, 3);
  });
});

describe("angles droits : qui passe", () => {
  const run = (patch: Partial<DressingPlan>, id: string) => planZones(plan(patch)).find((z) => z.id === id)!;

  it("le mur A passe, comme à l'origine, tant qu'on ne dit rien", () => {
    expect(run({ model: "U" }, "A").run).toMatchObject({ start: 0, length: 3000 });
    expect(run({ model: "U" }, "B").run.length).toBe(1400);
  });

  it("le mur B ou C peut passer jusqu'au mur, le mur A s'arrête contre lui", () => {
    const through = { left: true };
    expect(run({ model: "U", through }, "A").run).toMatchObject({ start: 600, length: 2400 });
    expect(run({ model: "U", through }, "B").run).toMatchObject({ start: -2000, length: 2000 });
    expect(run({ model: "U", through }, "C").run).toMatchObject({ start: 600, length: 1400 });
    const both = { model: "U" as const, through: { left: true, right: true } };
    expect(run(both, "A").run).toMatchObject({ start: 600, length: 1800 });
    expect(run(both, "C").run).toMatchObject({ start: 0, length: 2000 });
  });

  it("le mur D garde sa longueur utile et son entrée quand il passe à son angle", () => {
    const left = { model: "G-left" as const, lengthE: 1000, through: { far: true } };
    expect(run(left, "D").outline).toEqual([[0, -2000], [1600, -2000], [1600, -1400], [0, -1400]]);
    expect(run(left, "B").run).toMatchObject({ start: -1400, length: 800 });
    const right = { model: "G-right" as const, lengthE: 1000, through: { far: true } };
    expect(run(right, "D").outline).toEqual([[1400, -2000], [3000, -2000], [3000, -1400], [1400, -1400]]);
    expect(run(right, "C").run).toMatchObject({ start: 600, length: 800 });
  });

  it("ne propose que les angles droits du modèle", () => {
    const joints = (model: PlanModel) => cornerJoints(plan({ model })).map((c) => c.joint);
    expect(joints("I")).toEqual([]);
    expect(joints("L-left")).toEqual(["left"]);
    expect(joints("U-cut-left")).toEqual(["right"]);
    expect(joints("U-round")).toEqual([]);
    expect(joints("T")).toEqual([]);
    expect(joints("G-right")).toEqual(["left", "right", "far"]);
    expect(cornerJoints(plan({ model: "G-right" }))[2]!.walls).toEqual(["Mur C", "Mur D"]);
    expect(run({ model: "U-cut-left", through: { left: true } }, "A").run.start).toBe(1000);
  });

  it("une zone déjà faite suit le changement d'angle", () => {
    const placed = withPlan(empty(), plan({ model: "L-left" }));
    const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
    if (typeof made === "string") throw new Error(made);
    const changed = withPlanChanged(made.doc, placed.id, { ...planOf(made.doc)!.dressingPlan!, through: { left: true } });
    if (typeof changed === "string") throw new Error(changed);
    const step = (changed.doc.features.find((f) => f.id === made.sketch) as SketchFeature).offsets!.find(isPartition)!.step;
    expect(step.origin[0]).toBe(600);
    expect(step.input.length).toBe(2400);
  });
});
