/** Le plan d'un dressing vu de dessus : ses modèles, ses zones, ce qu'on bâtit dessus. */
import { describe, expect, it } from "vitest";
import { fillChoices, PLAN, PLAN_MODELS, planLines, planOf, planProblem, planZones, withCornerDoors, withPlan, withPlanChanged, withZonePartition, zoneDone, zonesLost, zoneStep, type PlanModel } from "../../frontend/src/document/plan-layout";
import { moduleSizes, withModules } from "../../frontend/src/document/dressing-modules";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CadDocument, type DressingPlan, type ExtrudeFeature, type SketchFeature } from "../../frontend/src/document/types";
import { hingeCount } from "../../frontend/src/features/fronts-parts";
import { nicheGeometry, nicheProblem } from "../../frontend/src/features/niche-parts";
import { removeWithShelves } from "../../frontend/src/document/shelf-removal";
import { parseDocument } from "../../frontend/src/document/validate";
import { partitionLayout } from "../../frontend/src/sketcher/partition";
import { isPartition, leafNiches } from "../../frontend/src/sketcher/partition-history";

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const plan = (patch: Partial<DressingPlan> = {}): DressingPlan => ({ ...PLAN, ...patch });
const area = (outline: [number, number][]) => Math.abs(outline.reduce((sum, [x, y], i) => { const [u, v] = outline[(i + 1) % outline.length]!; return sum + x * v - u * y; }, 0)) / 2;

describe("modèles de plan", () => {
  it("donnent chacun un plan possible, par défaut", () => {
    for (const model of Object.keys(PLAN_MODELS) as PlanModel[]) expect(planProblem(plan({ model }))).toBeNull();
  });

  it("droit : une seule zone", () => {
    expect(planZones(plan({ model: "I" })).map((z) => z.id)).toEqual(["A"]);
  });

  it("en L à angle droit : l'angle reste au mur A, l'autre mur part derrière sa profondeur", () => {
    const zones = planZones(plan({ model: "L-right" }));
    expect(zones.map((z) => [z.id, z.run?.length])).toEqual([["A", 3000], ["C", 1400]]);
  });

  it("face à face : deux linéaires, un passage entre eux", () => {
    const zones = planZones(plan({ model: "facing", lengthD: 2500, aisle: 900 }));
    expect(zones.map((z) => z.id)).toEqual(["A", "D"]);
    expect(zones[1]!.outline).toEqual([[0, -2100], [2500, -2100], [2500, -1500], [0, -1500]]);
    expect(zones[1]!.run.frame?.normal).toEqual([0, 1, 0]);
    expect(planProblem(plan({ model: "facing", aisle: 300 }))).toMatch(/passage/);
  });

  it("en L à pan coupé, comme le schéma : linéaire, pentagone, linéaire", () => {
    const zones = planZones(plan({ model: "L-right-cut", lengthA: 3000, lengthC: 2000, cornerA: 1000, cornerB: 900 }));
    expect(zones.map((z) => z.id)).toEqual(["A", "right", "C"]);
    expect(zones[0]!.run?.length).toBe(2000);
    expect(zones[2]!.run?.length).toBe(1100);
    const corner = zones[1]!.outline;
    expect(corner).toHaveLength(5);
    // The wall corner, then along wall C, its front ends, and along wall A.
    expect(corner).toEqual([[3000, 0], [2000, 0], [2000, -600], [2400, -900], [3000, -900]]);
    // A corner cut from a rectangle.
    expect(area(corner)).toBeCloseTo(1000 * 900 - (400 * 300) / 2, 6);
  });

  it("en U à pans coupés : deux angles et trois linéaires, sans chevauchement", () => {
    const zones = planZones(plan({ model: "U-cut" }));
    expect(zones.map((z) => z.id)).toEqual(["left", "A", "right", "B", "C"]);
    expect(zones.find((z) => z.id === "A")!.run).toMatchObject({ start: 1000, length: 1000 });
  });

  it("disent ce qui ne va pas", () => {
    expect(planProblem(plan({ lengthA: 1200 }))).toMatch(/Mur A est trop court/);
    expect(planProblem(plan({ cornerA: 600 }))).toMatch(/Un angle coupé/);
    expect(planProblem(plan({ height: 500 }))).toMatch(/hauteur/);
  });

  it("ne tracent chaque trait qu'une fois, et un double trait aux jonctions", () => {
    const p = plan({ model: "L-right-cut" });
    const lines = planLines(p);
    const keys = lines.map(([a, b]) => [a, b].map((q) => q.join()).sort().join("|"));
    expect(new Set(keys).size).toBe(lines.length);
    // The junction at the end of wall A: the side of the run, the joint, the side of the corner.
    const verticals = [...new Set(lines.filter(([a, b]) => a[0] === b[0] && a[0] > 1900 && a[0] < 2100).map(([a]) => a[0]))].sort((x, y) => x - y);
    expect(verticals).toEqual([1982, 2000, 2018]);
  });
});

describe("remplir une zone à la largeur voulue", () => {
  const free = (cases: number[]) => cases.reduce((a, b) => a + b, 0) + (cases.length + 1) * 18;

  it("propose un fileur ou un caisson du reste exact, et des caissons égaux", () => {
    const choices = fillChoices(2000, 18, 600, false);
    expect(choices.map((c) => c.label)).toEqual([
      "3 caissons de 60 cm et un fileur de 11 cm",
      "3 caissons égaux de 64,3 cm",
      "4 caissons égaux de 47,8 cm",
    ]);
    expect(choices[0]).toMatchObject({ rest: 3, filler: true });
    for (const choice of choices) expect(free(choice.cases)).toBeCloseTo(2000, 6);
  });

  it("met le reste où on le demande", () => {
    const [choice] = fillChoices(2000, 18, 600, true);
    expect(choice).toMatchObject({ rest: 0, filler: true });
    expect(choice!.cases[0]).toBeCloseTo(110, 6);
  });

  it("propose un caisson quand le reste est assez large, un fileur quand il est étroit", () => {
    expect(fillChoices(2300, 18, 600, false).map((c) => c.filler)).toContain(false);
    expect(fillChoices(2500, 18, 600, false).some((c) => c.filler)).toBe(false);
  });

  it("dit quand ça tombe juste", () => {
    const length = 3 * 600 + 4 * 18;
    expect(fillChoices(length, 18, 600, false)[0]).toMatchObject({ rest: null, filler: false, cases: [600, 600, 600] });
    expect(fillChoices(length, 18, 600, false)[0]!.label).toContain("juste");
  });

  it("ne propose rien d'impossible", () => {
    expect(fillChoices(100, 18, 600, false)).toEqual([]);
  });
});

describe("zones du plan", () => {
  const placed = (model: PlanModel = "L-right-cut") => {
    const { doc, id } = withPlan(empty(), plan({ model }));
    return { doc, id, zones: planZones(plan({ model })) };
  };

  it("le plan est une esquisse au sol, retrouvée et lue par le document", () => {
    const { doc, id } = placed();
    expect(planOf(doc)?.id).toBe(id);
    expect(planOf(doc)?.plane).toBe("XY");
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("un linéaire reçoit sa Répartition contre son mur, à sa longueur et sa profondeur", () => {
    const { doc, id, zones } = placed();
    const zone = zones.find((z) => z.id === "A")!;
    const made = withZonePartition(doc, id, zone);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    const record = sketch.offsets!.find(isPartition)!;
    expect(sketch.plane).toBe("XZ");
    expect(record.step.input.length).toBe(2000);
    expect(record.step.input.cases).toBe(3);
    expect(record.step.depth).toBe(600);
    expect(record.step.origin).toEqual([0, 0]);
    expect(zoneDone(made.doc, planOf(made.doc)!.dressingPlan!, "A")).toBe(true);
    expect(() => parseDocument(JSON.parse(JSON.stringify(made.doc)))).not.toThrow();
  });

  it("le mur de droite regarde la pièce", () => {
    const { doc, id, zones } = placed();
    const made = withZonePartition(doc, id, zones.find((z) => z.id === "C")!);
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f) => f.id === made.sketch) as SketchFeature;
    expect(sketch.frame?.normal).toEqual([-1, 0, 0]);
    expect(sketch.offsets!.find(isPartition)!.step.origin).toEqual([1000, 0]);
  });

  const corner = () => {
    const { doc, id, zones } = placed();
    const zone = zones.find((z) => z.id === "right")!;
    const made = withZonePartition(doc, id, zone);
    if (typeof made === "string") throw new Error(made);
    return { ...made, id, zone, sketch: made.doc.features.find((f) => f.id === made.sketch) as SketchFeature };
  };

  it("l'angle coupé est une Répartition découpée au pentagone, avec son côté du bout", () => {
    const { doc, sketch } = corner();
    const record = sketch.offsets!.find(isPartition)!;
    expect(record.step.input.length).toBe(1000);
    expect(record.step.depth).toBe(1000);
    expect(record.step.origin).toEqual([2000, 0]);
    expect(sketch.clip).toHaveLength(5);
    const bodies = doc.features.filter((f): f is ExtrudeFeature => f.type === "extrude" && f.sketch === sketch.id);
    expect(bodies.length).toBeGreaterThan(3);
    for (const body of bodies) expect(body.clip).toEqual(sketch.clip);
    expect(doc.features.some((f) => f.name === "Angle droit — côté" && f.type === "extrude")).toBe(true);
    expect(leafNiches(sketch)).toHaveLength(1);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("les étagères posées ensuite dans l'angle sont découpées comme lui, et le module de tiroirs y est refusé", () => {
    const { doc, sketch } = corner();
    const leaf = leafNiches(sketch)[0]!;
    const pick = { partition: leaf.partition, path: leaf.path, box: leaf.box };
    const next = withModules(doc, sketch.id, [pick], "shelves", 18, moduleSizes("shelves"));
    if (typeof next === "string") throw new Error(next);
    const shelves = next.features.filter((f): f is ExtrudeFeature => f.type === "extrude" && f.name.startsWith("Étagère "));
    expect(shelves.length).toBeGreaterThan(2);
    for (const shelf of shelves) expect(shelf.clip).toEqual(sketch.clip);
    expect(withModules(doc, sketch.id, [pick], "drawers", 18, moduleSizes("drawers"))).toMatch(/Pas de tiroirs/);
  });

  it("dans l'angle coupé : pas de tiroirs ni de portes de Répartition, mais une tringle", () => {
    const { sketch } = corner();
    const record = sketch.offsets!.find(isPartition)!;
    const n = nicheGeometry({ partition: record.id, niche: [0] }, sketch);
    if (typeof n === "string") throw new Error(n);
    const base = { diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true };
    expect(nicheProblem({ ...base, fill: "drawers" }, n)).toMatch(/Pas de tiroirs/);
    expect(nicheProblem({ ...base, fill: "doors" }, n)).toMatch(/pan coupé/);
    expect(nicheProblem({ ...base, fill: "rod" }, n)).toBeNull();
  });

  it("la porte du pan coupé est de biais, devant lui, et ses charnières vont au devis", () => {
    const { doc, id } = corner();
    const next = withCornerDoors(doc, id, true);
    const door = next.features.find((f) => f.name === "Angle droit — porte" && f.type === "sketch") as SketchFeature;
    const [nx, ny] = door.frame!.normal;
    // Away from the wall corner, towards the room.
    expect(nx).toBeLessThan(0);
    expect(ny).toBeLessThan(0);
    expect(Math.hypot(nx, ny)).toBeCloseTo(1, 9);
    expect(door.frame!.origin).toEqual([2200, -800, 0]);
    expect(modelHardware(next)).toEqual(expect.arrayContaining([{ name: "Charnière à boîtier Ø35", quantity: hingeCount(2500 - 80 - 6) }]));
    const off = withCornerDoors(next, id, false);
    expect(off.features.some((f) => f.name === "Angle droit — porte")).toBe(false);
    expect(off.features.filter((f) => f.name === "Angle droit — côté" && f.type === "extrude")).toHaveLength(1);
    expect(modelHardware(off).some((h) => h.name.startsWith("Charnière"))).toBe(false);
  });

  it("le plan changé : ce qui est fait dessus suit, à sa nouvelle place et ses cotes", () => {
    const { doc, id, zone } = corner();
    const a = withZonePartition(doc, id, planZones(plan({ model: "L-right-cut" }))[0]!);
    if (typeof a === "string") throw new Error(a);
    const changed = withPlanChanged(a.doc, id, plan({ model: "L-right-cut", lengthA: 3600, height: 2400, depth: 650, cornerB: 1100, cornerDoor: true, made: undefined }));
    if (typeof changed === "string") throw new Error(changed);
    expect(changed.problems).toEqual([]);
    const after = planOf(changed.doc)!.dressingPlan!;
    expect(zoneDone(changed.doc, after, "A")).toBe(true);
    const step = (zoneId: string) => {
      const target = zoneStep(changed.doc, after, zoneId)!;
      return (changed.doc.features.find((f) => f.id === target.sketch) as SketchFeature).offsets!.find(isPartition)!.step;
    };
    expect(step("A").input).toMatchObject({ length: 2600, height: 2400 });
    expect(step("A").depth).toBe(650);
    expect(step("right").origin).toEqual([2600, 0]);
    expect(step("right").depth).toBe(1100);
    expect((changed.doc.features.find((f) => f.id === after.made!.right) as SketchFeature).clip![1]).toEqual([2600, 0]);
    expect(changed.doc.features.filter((f) => f.name === "Angle droit — côté" && f.type === "extrude")).toHaveLength(1);
    expect(changed.doc.features.some((f) => f.name === "Angle droit — porte")).toBe(true);
    expect(zone.id).toBe("right");
  });

  it("un modèle sans cette zone : ce qui y était fait s'en va, en le disant", () => {
    const { doc, id } = corner();
    const next = plan({ model: "I" });
    expect(zonesLost(doc, id, next)).toEqual(["Angle droit"]);
    const changed = withPlanChanged(doc, id, next);
    if (typeof changed === "string") throw new Error(changed);
    expect(changed.doc.features.filter((f) => f.name.includes("ngle droit"))).toEqual([]);
    expect(changed.doc.features.filter((f) => f.type === "extrude")).toEqual([]);
    expect(planOf(changed.doc)!.dressingPlan!.made).toEqual({});
  });

  it("un plan qui ne laisse plus la place le dit, et rien ne change", () => {
    const { doc, id, zones } = placed();
    const made = withZonePartition(doc, id, zones[0]!);
    if (typeof made === "string") throw new Error(made);
    expect(typeof withPlanChanged(made.doc, id, plan({ model: "L-right-cut", lengthA: 1040 }))).toBe("string");
  });

  it("les corps d'une zone supprimés : son esquisse, le côté et la porte de l'angle partent, la zone est libre, le plan reste", () => {
    const { doc, id } = corner();
    const door = withCornerDoors(doc, id, true);
    const plate = planOf(door)!.dressingPlan!.made!.right!;
    const bodies = door.features.filter((f) => f.type === "extrude" && f.sketch === plate).map((f) => f.id);
    const { next, lost } = removeWithShelves(door, bodies);
    expect(next.features.map((f) => f.id)).toEqual([id]);
    expect(zoneDone(next, planOf(next)!.dressingPlan!, "right")).toBe(false);
    expect(lost.length).toBeGreaterThan(0);
  });

  const filled = () => {
    const { doc, id, zones } = placed("L-right");
    const zone = zones.find((z) => z.id === "C")!;
    const choice = fillChoices(zone.run.length, 18, 400, false).find((c) => c.filler)!;
    const made = withZonePartition(doc, id, zone, choice);
    if (typeof made === "string") throw new Error(made);
    return { ...made, id, zone, choice };
  };
  const filler = (doc: CadDocument) => doc.features.find((f) => f.name === "Mur C — fileur" && f.type === "sketch") as SketchFeature | undefined;

  it("une zone remplie a ses largeurs exactes et son fileur, devant le reste", () => {
    const { doc, sketch, choice, zone } = filled();
    const step = (doc.features.find((f) => f.id === sketch) as SketchFeature).offsets!.find(isPartition)!.step;
    expect(step.input.widths).toEqual(choice.cases);
    const layout = partitionLayout(step.input);
    if (typeof layout === "string") throw new Error(layout);
    const last = layout.caseSpans.at(-1)!;
    expect(last[1] - last[0]).toBeCloseTo(choice.cases.at(-1)!, 3);
    // Wall C: from its corner along −Y, flush with the front of the panels.
    const xs = filler(doc)!.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(3000 - 600, 6);
    expect(Math.max(...xs)).toBeCloseTo(3000 - 600 + 18, 6);
    const ys = filler(doc)!.points.map((p) => -p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(zone.run.start + last[0], 3);
    expect(ys.at(-1)).toBeCloseTo(zone.run.start + last[1], 3);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("quand le plan change, le reste prend la différence et le fileur suit", () => {
    const { doc, id, sketch, choice } = filled();
    const changed = withPlanChanged(doc, id, plan({ model: "L-right", lengthC: 2100 }));
    if (typeof changed === "string") throw new Error(changed);
    const step = (changed.doc.features.find((f) => f.id === sketch) as SketchFeature).offsets!.find(isPartition)!.step;
    expect(step.input.widths!.slice(0, -1)).toEqual(choice.cases.slice(0, -1));
    expect(step.input.widths!.at(-1)).toBeCloseTo(choice.cases.at(-1)! + 100, 6);
    expect(changed.doc.features.filter((f) => f.name === "Mur C — fileur" && f.type === "extrude")).toHaveLength(1);
  });

  it("le fileur part avec les corps de sa zone", () => {
    const { doc, sketch } = filled();
    const bodies = doc.features.filter((f) => f.type === "extrude" && f.sketch === sketch).map((f) => f.id);
    const { next } = removeWithShelves(doc, bodies);
    expect(filler(next)).toBeUndefined();
    expect(next.features.filter((f) => f.type === "extrude")).toEqual([]);
  });

  it("toute la zone en un seul caisson", () => {
    const { doc, id, zones } = placed("I");
    const zone = zones[0]!;
    const made = withZonePartition(doc, id, zone, { label: "", cases: [zone.run.length - 36], rest: null, filler: false });
    if (typeof made === "string") throw new Error(made);
    expect(leafNiches(made.doc.features.find((f) => f.id === made.sketch) as SketchFeature)).toHaveLength(1);
  });

  it("une zone dont l'ouvrage est supprimé redevient libre", () => {
    const { doc, id, zones } = placed();
    const made = withZonePartition(doc, id, zones.find((z) => z.id === "A")!);
    if (typeof made === "string") throw new Error(made);
    const gone = { ...made.doc, features: made.doc.features.filter((f) => f.id !== made.sketch) };
    expect(zoneDone(gone, planOf(gone)!.dressingPlan!, "A")).toBe(false);
  });
});
