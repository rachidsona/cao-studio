/** Modules programmed: worked out on each niche, laid in niches of different sizes, worked out again when a niche changes. */
import { describe, expect, it } from "vitest";
import { DRESSING, partitionInput } from "../../frontend/src/document/dressing-plan";
import { moduleSizes, type ModuleKind } from "../../frontend/src/document/dressing-modules";
import { moduleAt, moduleOfNiche, withModuleChanged } from "../../frontend/src/document/module-edit";
import { nicheVariables, withProgramModules } from "../../frontend/src/document/module-follow";
import { isModuleProgram, paramProblem, programProblem, resolveProgram, type ModuleProgram } from "../../frontend/src/document/module-program";
import { emptySketchGeometry, type OffsetRecord, type SketchGeometry } from "../../frontend/src/document/sketch";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { extrusionGroups, isPartition, isShelves, leafNiches, partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const NICHE = { largeur: 900, hauteur: 2384, profondeur: 600, epaisseur: 18 };

const program = (kind: ModuleKind, change: Partial<ModuleProgram> = {}): ModuleProgram => ({ kind, sizes: moduleSizes(kind), thickness: 18, params: [], rules: [], formulas: {}, ...change });

/** « Une étagère tous les 35 cm » ; tiroirs dessous si la niche fait plus de 45 cm de large. */
const EVERY_35 = program("shelves", {
  params: [{ name: "pas", value: 350 }],
  rules: [{ when: "largeur > 45 cm", kind: "drawers" }],
  formulas: { shelves: "max(plancher(hauteur / pas) - 1; 1)", drawers: "si(largeur > 80 cm; 4; 3)", drawerZone: "arrondi(hauteur / 3; 10)" },
});

describe("programme d'un module", () => {
  it("se calcule sur la niche : nombre d'étagères, module choisi par une condition", () => {
    const narrow = resolveProgram(EVERY_35, { ...NICHE, largeur: 400 });
    expect(narrow).toMatchObject({ kind: "shelves", sizes: { shelves: 5 }, values: { shelves: 5 } });
    expect(resolveProgram(EVERY_35, { ...NICHE, largeur: 400, hauteur: 1400 })).toMatchObject({ sizes: { shelves: 3 } });
    const wide = resolveProgram(EVERY_35, NICHE);
    expect(wide).toMatchObject({ kind: "drawers", sizes: { drawers: 4, drawerZone: 790 } });
    expect(resolveProgram(EVERY_35, { ...NICHE, largeur: 600 })).toMatchObject({ kind: "drawers", sizes: { drawers: 3 } });
  });

  it("place la tringle, règle le chapeau et l'épaisseur des étagères", () => {
    const rod = resolveProgram(program("long", { formulas: { hat: "hauteur - 1750", rodDrop: "40 + epaisseur", thickness: "epaisseur + 4" } }), NICHE);
    expect(rod).toMatchObject({ kind: "long", thickness: 22, sizes: { hat: 634, rod: { diameter: 25, drop: 58 } } });
  });

  it("garde ses cotes sans formule, et l'espacement décide du nombre s'il est seul", () => {
    const fixed = resolveProgram(program("shelves", { sizes: { ...moduleSizes("shelves"), shelves: 4, heights: { "1": 300 } }, formulas: { spacing: "hauteur / 6" } }), NICHE);
    expect(fixed).toMatchObject({ sizes: { spacing: 397.3 } });
    expect((fixed as { sizes: { shelves?: number; heights?: unknown } }).sizes.shelves).toBeUndefined();
    expect((fixed as { sizes: { heights?: unknown } }).sizes.heights).toBeUndefined();
  });

  it("dit l'erreur en français, la formule et la cote en cause", () => {
    expect(resolveProgram(program("shelves", { formulas: { shelves: "plancher(hauteur / 350" } }), NICHE)).toBe("Nombre d'étagères — formule « plancher(hauteur / 350 » : une parenthèse fermante manque pour « plancher( ».");
    expect(resolveProgram(program("shelves", { formulas: { shelves: "hauteur / 50" } }), NICHE)).toBe("Nombre d'étagères — formule « hauteur / 50 » : elle donne 47,68, il en faut de 0 à 20.");
    expect(resolveProgram(program("long", { formulas: { hat: "hauteur - 3000" } }), NICHE)).toMatch(/^Hauteur du chapeau — formule « hauteur - 3000 » : elle donne -616 mm, il faut une longueur positive\.$/);
    expect(resolveProgram(program("shelves", { rules: [{ when: "largeur >", kind: "drawers" }] }), NICHE)).toMatch(/^Condition 1 — formule « largeur > »/);
    expect(paramProblem({ params: [{ name: "2x", value: 1 }] }, 0)).toMatch(/un nom commence par une lettre/);
    expect(paramProblem({ params: [{ name: "Hauteur", value: 1 }] }, 0)).toMatch(/déjà une variable/);
    expect(paramProblem({ params: [{ name: "a", value: 1 }, { name: "A", value: 2 }] }, 1)).toMatch(/déjà pris/);
    expect(programProblem(EVERY_35)).toBeNull();
  });

  it("se vérifie quand il est relu d'un fichier", () => {
    expect(isModuleProgram(EVERY_35)).toBe(true);
    expect(isModuleProgram({ ...EVERY_35, kind: "fusée" })).toBe(false);
    expect(isModuleProgram({ ...EVERY_35, formulas: { eval: "1" } })).toBe(false);
    expect(isModuleProgram({ ...EVERY_35, params: [{ name: "a", value: "1" }] })).toBe(false);
  });
});

/** A Répartition of 3 cases, the middle one twice as wide. */
function cabinet(height = DRESSING.height): CadDocument {
  const input = { ...partitionInput({ ...structuredClone(DRESSING), height, programs: { A: ["long", "long", "long"], B: [], C: [] } }, "A"), widths: [1, 2, 1] };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition", input, [0, 0], 600)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...emptySketchGeometry() };
  return withSketchExtrusion({ ...createReferencePlate(), features: [sketch] }, "sk1", rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
}

const sketchOf = (doc: CadDocument) => doc.features.find((f) => f.id === "sk1") as SketchFeature;
const casePick = (doc: CadDocument, c: number) => {
  const n = leafNiches(sketchOf(doc)).find((l) => l.path.length === 1 && l.path[0] === c)!;
  return { partition: n.partition, path: n.path, box: n.box };
};
const laid = (doc: CadDocument, c: number) => moduleAt(doc, sketchOf(doc), "of1", [c]);
const drawersIn = (doc: CadDocument, c: number) => doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "drawers" && f.niche[0] === c);

/** The same Répartition, its height changed: each change of a sketch goes through withSketchExtrusion. */
function resized(doc: CadDocument, height: number): CadDocument {
  const sketch = sketchOf(doc);
  const offsets = (sketch.offsets ?? []).map((r): OffsetRecord => (r.id === "of1" && isPartition(r) ? { ...r, step: { ...r.step, input: { ...r.step.input, height } } } : r));
  const rebuilt = rebuildChain({ ...sketch, offsets }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return withSketchExtrusion(doc, "sk1", rebuilt.geometry as SketchGeometry, { groups: extrusionGroups(sketch.offsets ?? [], rebuilt) });
}

describe("modules programmés dans le document", () => {
  it("se posent dans des niches de tailles différentes, chacun calculé sur la sienne", () => {
    const doc = cabinet();
    const narrow = program("shelves", { rules: [{ when: "largeur > 100 cm", kind: "drawers" }], formulas: { shelves: "plancher(hauteur / 35 cm) - 1", drawers: "si(largeur > 120 cm; 4; 2)" } });
    expect(nicheVariables(sketchOf(doc), "of1", casePick(doc, 1).box)).toMatchObject({ profondeur: 600, epaisseur: 18 });
    const made = withProgramModules(doc, "sk1", [casePick(doc, 0), casePick(doc, 1), casePick(doc, 2)], narrow);
    if (typeof made === "string") throw new Error(made);
    expect(laid(made, 0)).toMatchObject({ kind: "shelves", sizes: { shelves: 5 } });
    expect(laid(made, 2)).toMatchObject({ kind: "shelves", sizes: { shelves: 5 } });
    expect(laid(made, 1)).toMatchObject({ kind: "drawers" });
    expect(drawersIn(made, 1)?.drawers).toBe(4);
    // The program is kept with the module, and the document is still valid.
    expect(laid(made, 0)?.formula?.program.formulas.shelves).toBe("plancher(hauteur / 35 cm) - 1");
    expect(() => parseDocument(JSON.parse(JSON.stringify(made)))).not.toThrow();
    const broken = structuredClone(made);
    (sketchOf(broken).offsets!.find((r) => r.formula)!.formula!.program as { kind: string }).kind = "fusée";
    expect(() => parseDocument(JSON.parse(JSON.stringify(broken)))).toThrow(/décalages invalides/);
  });

  it("se recalculent quand la niche change, dans le même changement", () => {
    const doc = cabinet();
    const made = withProgramModules(doc, "sk1", [casePick(doc, 0)], program("shelves", { formulas: { shelves: "plancher(hauteur / 35 cm) - 1" } }));
    if (typeof made === "string") throw new Error(made);
    expect(laid(made, 0)?.sizes.shelves).toBe(5);
    const lower = resized(made, 1500);
    expect(laid(lower, 0)).toMatchObject({ kind: "shelves", sizes: { shelves: 2 } });
    expect(laid(lower, 0)?.formula?.at.hauteur).toBeCloseTo(laid(lower, 0)!.box.y1 - laid(lower, 0)!.box.y0);
    // One record of the program, no step left behind.
    expect((sketchOf(lower).offsets ?? []).filter((r) => isShelves(r)).length).toBe(1);
    // And back: as it was.
    expect(laid(resized(lower, DRESSING.height), 0)?.sizes.shelves).toBe(5);
  });

  it("changent de module quand une condition change avec la niche", () => {
    const doc = cabinet();
    const tall = program("shelves", { rules: [{ when: "hauteur > 2 m", kind: "long" }], formulas: { shelves: "3" } });
    const made = withProgramModules(doc, "sk1", [casePick(doc, 0)], tall);
    if (typeof made === "string") throw new Error(made);
    expect(laid(made, 0)?.kind).toBe("long");
    expect(laid(resized(made, 1800), 0)).toMatchObject({ kind: "shelves", sizes: { shelves: 3 } });
  });

  it("restent tels quels si la formule échoue dans la nouvelle niche, et redeviennent fixes si on les change sans programme", () => {
    const doc = cabinet();
    const made = withProgramModules(doc, "sk1", [casePick(doc, 0)], program("shelves", { formulas: { shelves: "si(hauteur < 1600; 1 / 0; 4)" } }));
    if (typeof made === "string") throw new Error(made);
    expect(laid(resized(made, 1500), 0)?.sizes.shelves).toBe(4);
    const placed = laid(made, 0)!;
    const fixed = withModuleChanged(made, "sk1", placed, "shelves", 18, { ...placed.sizes, shelves: 2 });
    if (typeof fixed === "string") throw new Error(fixed);
    expect(laid(fixed, 0)?.formula).toBeUndefined();
    expect(laid(resized(fixed, 1500), 0)?.sizes.shelves).toBe(2);
    expect(moduleOfNiche(fixed, sketchOf(fixed), "of1", [0, 1])?.kind).toBe("shelves");
  });

  it("disent quelle niche ne reçoit pas le module", () => {
    const doc = cabinet();
    const bad = withProgramModules(doc, "sk1", [casePick(doc, 0), casePick(doc, 1)], program("shelves", { formulas: { shelves: "si(largeur > 1 m; 30; 3)" } }));
    expect(bad).toMatch(/^Niche de 146,4 × 238,4 × 60 cm : Nombre d'étagères — formule « si\(largeur > 1 m; 30; 3\) » : elle donne 30, il en faut de 0 à 20\.$/);
  });
});
