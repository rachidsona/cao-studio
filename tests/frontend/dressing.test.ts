/** The Dressing assistant: one Répartition per wall, its modules as steps, the equipments, the walls. */
import { describe, expect, it } from "vitest";
import { DRESSING, defaultProgram, dressingDocument, dressingProblem, partitionInput, wallRun, type DressingSettings } from "../../frontend/src/document/dressing-plan";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { nicheGeometry, nicheParts, worldBox } from "../../frontend/src/features/niche-parts";

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const settings = (patch: Partial<DressingSettings> = {}): DressingSettings => ({ ...structuredClone(DRESSING), ...patch });

describe("assistant Dressing", () => {
  it("propose environ un module par 80 cm", () => {
    expect(defaultProgram(3000)).toEqual(["long", "drawers", "double", "shelves"]);
    expect(defaultProgram(500)).toHaveLength(1);
  });

  it("un mur : une répartition toute hauteur, une case par module, ses étagères, penderies et tiroirs", () => {
    const s = settings({ programs: { A: ["long", "double", "drawers"], B: [], C: [] } });
    const { doc, problems } = dressingDocument(empty(), s);
    expect(problems).toEqual([]);
    const sketches = doc.features.filter((f): f is SketchFeature => f.type === "sketch");
    expect(sketches.map((f) => f.name)).toEqual(["Dressing — mur A", "Esquisse 1"]); // the répartition, then the wall
    const steps = sketches[0]!.offsets ?? [];
    expect(steps.map((r) => r.name)).toEqual(["Dressing — mur A", "Étagères 1", "Étagères 2", "Étagères 3", "Étagères 4", "Étagères 5"]);
    expect(steps[0]!.step).toMatchObject({ kind: "partition", input: { cases: 3, height: 2500, plinth: 80, widths: [900, 900, 700] }, depth: 600 });
    // Every step made its bodies (the panels, the shelves).
    expect(steps.every((r) => (r.bodies ?? []).length > 0)).toBe(true);
    const equipment = doc.features.filter((f): f is NicheFeature => f.type === "niche");
    expect(equipment.map((f) => [f.name, f.fill, f.niche.join(".")])).toEqual([
      ["Penderie 1", "rod", "0.0"],
      ["Penderie 2", "rod", "1.0.0"],
      ["Penderie 3", "rod", "1.0.1"],
      ["Tiroirs 1", "drawers", "2.0"],
    ]);
    expect(doc.bodyInfo?.[doc.features.find((f) => f.type === "extrude" && f.name === "Mur A")!.id]?.room).toBe(true);
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(modelHardware(doc)).toEqual(expect.arrayContaining([{ name: "Coulisse de tiroir (paire)", quantity: 3 }]));
  });

  it("en U, les murs B et C commencent derrière la profondeur du mur A, leurs façades vers la pièce", () => {
    const s = settings({ layout: "U", lengthA: 2400, lengthB: 2000, lengthC: 1800, programs: { A: ["shelves", "shelves"], B: ["drawers"], C: ["drawers"] } });
    expect(wallRun(s, "B")).toMatchObject({ plane: "YZ", start: -2000, length: 1400 });
    expect(wallRun(s, "C")).toMatchObject({ start: 600, length: 1200, frame: { normal: [-1, 0, 0] } });
    const { doc, problems } = dressingDocument(empty(), s);
    expect(problems).toEqual([]);
    const sketch = (id: string) => doc.features.find((f) => f.id === id) as SketchFeature;
    const fronts = (f: NicheFeature) => {
      const n = nicheGeometry(f, sketch(f.sketch));
      if (typeof n === "string") throw new Error(n);
      return worldBox(n, nicheParts(f, n).find((p) => p.role === "front")!);
    };
    const [b, c] = doc.features.filter((f): f is NicheFeature => f.type === "niche");
    // Wall B (X = 0): the fronts at X = 582…600, between Y = −2000 and −600.
    const [b0, b1] = fronts(b!);
    expect([b0[0], b1[0]]).toEqual([582, 600]);
    expect(b0[1]).toBeGreaterThan(-2000);
    expect(b1[1]).toBeLessThan(-600);
    // Wall C (X = 2400): the fronts at X = 1800…1818, facing the room.
    const [c0, c1] = fronts(c!);
    expect([c0[0], c1[0]]).toEqual([1800, 1818]);
    expect(doc.features.filter((f) => f.type === "extrude" && /^Mur /.test(f.name)).map((f) => f.name)).toEqual(["Mur A", "Mur B", "Mur C"]);
  });

  it("dit ce qui ne va pas", () => {
    expect(dressingProblem(settings({ height: 900 }))).toMatch(/hauteur/);
    expect(dressingProblem(settings({ programs: { A: [], B: [], C: [] } }))).toMatch(/aucun module/);
    expect(dressingProblem(settings({ lengthA: 1000, programs: { A: ["long", "long", "long"], B: [], C: [] } }))).toMatch(/trop court/);
    expect(dressingProblem(settings({ layout: "L", lengthB: 900, programs: { A: ["long"], B: ["shelves", "shelves"], C: [] } }))).toMatch(/mur B.*profondeur du mur A/);
    expect(dressingProblem(settings())).toBeNull();
    expect(partitionInput(settings(), "A").dividers).toEqual(["single", "single", "single"]);
  });
});
