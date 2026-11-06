/** Recettes de niche, cotes tapées, étagères tirées, murs gardés et styles. */
import { describe, expect, it } from "vitest";
import { moduleSizes, withModules } from "../../frontend/src/document/dressing-modules";
import { STYLES, withStyle } from "../../frontend/src/document/dressing-style";
import { columnOf, emptyRecipe, mirrored, readRecipe, withAlignedShelves, withRecipe, type NicheRecipe } from "../../frontend/src/document/niche-recipe";
import { shelfTravel, withNicheSize, withShelfMoved } from "../../frontend/src/document/niche-size";
import { planOf, withPlan, withZonePartition } from "../../frontend/src/document/plan-layout";
import { PLAN, planZones } from "../../frontend/src/document/plan-shapes";
import { readWall, withWall } from "../../frontend/src/document/wall-templates";
import { createReferencePlate, type CadDocument, type DressingPlan, type ExtrudeFeature, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { partitionHolder } from "../../frontend/src/app/joinery-3d";
import { partitionLayout } from "../../frontend/src/sketcher/partition";
import { isPartition, isShelves, leafNiches, pathKey, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const plan = (patch: Partial<DressingPlan> = {}): DressingPlan => ({ ...PLAN, model: "I", lengthA: 2700, ...patch });
const sketchOf = (doc: CadDocument, id: string) => doc.features.find((f) => f.id === id) as SketchFeature;

/** A wall of 3 cases, a module in the first. */
function wall() {
  const placed = withPlan({ ...createReferencePlate(), features: [] }, plan());
  const made = withZonePartition(placed.doc, placed.id, planZones(planOf(placed.doc)!.dressingPlan!)[0]!);
  if (typeof made === "string") throw new Error(made);
  const partition = sketchOf(made.doc, made.sketch).offsets!.find(isPartition)!.id;
  const leaf = leafNiches(sketchOf(made.doc, made.sketch)).find((n) => n.path[0] === 0)!;
  const doc = withModules(made.doc, made.sketch, [leaf], "drawers", 18, moduleSizes("drawers"));
  if (typeof doc === "string") throw new Error(doc);
  return { doc, sketch: made.sketch, partition, planId: placed.id };
}
const fills = (doc: CadDocument, path: number[]) => doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.niche[0] === path[0]);

describe("copier une niche", () => {
  it("relit puis repose l'aménagement ailleurs, à ses cotes", () => {
    const { doc, sketch, partition } = wall();
    const recipe = readRecipe(doc, { sketch, partition, path: [0] });
    expect(emptyRecipe(recipe)).toBe(false);
    const next = withRecipe(doc, { sketch, partition, path: [1] }, recipe);
    if (typeof next === "string") throw new Error(next);
    expect(fills(next, [1]).map((f) => f.fill)).toEqual(fills(doc, [0]).map((f) => f.fill));
    const shelves = (d: CadDocument, i: number) => sketchOf(d, sketch).offsets!.filter((r) => isShelves(r) && r.step.niche[0] === i).length;
    expect(shelves(next, 1)).toBe(shelves(doc, 0));
    const bodies = next.features.filter((f): f is ExtrudeFeature => f.type === "extrude" && f.sketch === sketch).length;
    expect(bodies).toBeGreaterThan(doc.features.filter((f) => f.type === "extrude" && f.sketch === sketch).length);
  });

  it("prend toute la colonne depuis une niche entre deux étagères, et s'arrête à une cloison", () => {
    const { doc, sketch, partition } = wall();
    expect(columnOf(doc, { sketch, partition, path: [0, 1, 2] }).path).toEqual([0]);
    const cut = withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 1, thickness: 18, mode: "equal", fixed: 0, vertical: true } }, { at: [0], input: { count: 2, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] });
    if (typeof cut === "string") throw new Error(cut);
    expect(columnOf(cut, { sketch, partition, path: [1, 0, 1] }).path).toEqual([1, 0]);
  });

  it("remplace ce que la niche contenait, et reste une niche vide si la recette l'est", () => {
    const { doc, sketch, partition } = wall();
    const place = { sketch, partition, path: [0] };
    const next = withRecipe(doc, place, { steps: [], equipment: [] });
    if (typeof next === "string") throw new Error(next);
    expect(emptyRecipe(readRecipe(next, place))).toBe(true);
    expect(fills(next, [0])).toEqual([]);
  });

  it("retourne les cloisons en miroir, et pas les étagères", () => {
    const base = { thickness: 18, fixed: 300 };
    const recipe: NicheRecipe = {
      steps: [{ at: [], input: { ...base, count: 1, mode: "bottom", vertical: true } }, { at: [0], input: { ...base, count: 2, mode: "equal" } }],
      equipment: [{ at: [0, 1], title: "Penderie", feature: { type: "niche", fill: "rod", diameter: 25, drop: 60 } as never }],
    };
    const turned = mirrored(recipe);
    expect(turned.steps[0]!.input.mode).toBe("top");
    expect(turned.steps[1]!.at).toEqual([1]);
    expect(turned.steps[1]!.input.mode).toBe("equal");
    expect(turned.equipment[0]!.at).toEqual([1, 1]);
  });

  it("aligne les étagères d'une colonne sur celles d'une autre", () => {
    const { doc, sketch, partition } = wall();
    const source = { sketch, partition, path: [0] };
    const target = { sketch, partition, path: [2] };
    const copied = withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 2, thickness: 18, mode: "bottom", fixed: 300 } }], equipment: [] });
    if (typeof copied === "string") throw new Error(copied);
    const next = withAlignedShelves(copied, { ...source, path: [1] }, target);
    if (typeof next === "string") throw new Error(next);
    const made = rebuildChain(sketchOf(next, sketch), partition);
    if (typeof made === "string") throw new Error(made);
    const y = (i: number, k: number) => made.niches.get(pathKey([i, k]))?.box.y1;
    expect(y(2, 0)).toBeCloseTo(y(1, 0)!, 3);
    expect(y(2, 1)).toBeCloseTo(y(1, 1)!, 3);
  });

  it("refuse d'aligner sur une niche sans étagères", () => {
    const { doc, sketch, partition } = wall();
    expect(withAlignedShelves(doc, { sketch, partition, path: [2] }, { sketch, partition, path: [1] })).toMatch(/pas d'étagères/);
  });
});

describe("le mur d'un outil de niche", () => {
  it("suit le panneau ou l'équipement sélectionné, sinon le dernier mur", () => {
    const { doc, sketch, planId } = wall();
    const other = withZonePartition({ ...doc, features: doc.features.filter((f) => f.id !== sketch) }, planId, planZones(planOf(doc)!.dressingPlan!)[0]!);
    if (typeof other === "string") throw new Error(other);
    const both: CadDocument = { ...other.doc, features: [...doc.features.filter((f) => f.id === sketch || (f.type === "extrude" && f.sketch === sketch)), ...other.doc.features] };
    const panel = both.features.find((f) => f.type === "extrude" && f.sketch === sketch)!;
    expect(partitionHolder(both, panel.id)?.id).toBe(sketch);
    expect(partitionHolder(both, sketch)?.id).toBe(sketch);
    expect(partitionHolder(both, null)?.id).toBe(other.sketch);
  });
});

describe("cote tapée dans la vue", () => {
  it("met une case à sa largeur, les autres se partagent le reste", () => {
    const { doc, sketch } = wall();
    const before = sketchOf(doc, sketch);
    const step = before.offsets!.find(isPartition)!.step;
    const [a, b] = (partitionLayout(step.input) as Exclude<ReturnType<typeof partitionLayout>, string>).caseSpans[1]!;
    const next = withNicheSize(doc, sketch, "x", [step.origin[0] + a, step.origin[0] + b], 600);
    if (typeof next === "string") throw new Error(next);
    const after = partitionLayout(sketchOf(next, sketch).offsets!.find(isPartition)!.step.input) as Exclude<ReturnType<typeof partitionLayout>, string>;
    expect(after.caseWidths[1]).toBeCloseTo(600, 3);
    expect(after.caseWidths.reduce((s, w) => s + w, 0)).toBeCloseTo((partitionLayout(step.input) as typeof after).caseWidths.reduce((s, w) => s + w, 0), 3);
  });

  it("met une niche à sa hauteur, et dit quand une case n'a pas d'étagère", () => {
    const { doc, sketch, partition } = wall();
    const made = rebuildChain(sketchOf(doc, sketch), partition);
    if (typeof made === "string") throw new Error(made);
    const niche = made.niches.get("0.1.0")!.box;
    const next = withNicheSize(doc, sketch, "y", [niche.y0, niche.y1], 400);
    if (typeof next === "string") throw new Error(next);
    const again = rebuildChain(sketchOf(next, sketch), partition);
    if (typeof again === "string") throw new Error(again);
    expect(again.niches.get("0.1.0")!.box.y1 - again.niches.get("0.1.0")!.box.y0).toBeCloseTo(400, 3);
    const free = made.niches.get("2")!.box;
    expect(withNicheSize(doc, sketch, "y", [free.y0, free.y1], 500)).toMatch(/posez d'abord une étagère/);
  });
});

describe("étagère tirée", () => {
  it("déplace une étagère, ses deux niches se partagent, les autres ne bougent pas", () => {
    const { doc, sketch, partition } = wall();
    const added = withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 3, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] });
    if (typeof added === "string") throw new Error(added);
    const record = sketchOf(added, sketch).offsets!.find((r) => isShelves(r) && r.step.niche[0] === 1)!;
    const travel = shelfTravel(sketchOf(added, sketch), record.id, 1)!;
    const before = rebuildChain(sketchOf(added, sketch), partition);
    if (typeof before === "string") throw new Error(before);
    const next = withShelfMoved(added, sketch, record.id, 1, travel.position + 96);
    if (typeof next === "string") throw new Error(next);
    const after = rebuildChain(sketchOf(next, sketch), partition);
    if (typeof after === "string") throw new Error(after);
    const y = (m: typeof after, k: number) => m.niches.get(`1.${k}`)!.box;
    expect(y(after, 0).y1).toBeCloseTo(y(before, 0).y1, 3);
    expect(y(after, 1).y1).toBeCloseTo(y(before, 1).y1 + 96, 3);
    expect(y(after, 2).y1).toBeCloseTo(y(before, 2).y1, 3);
  });

  it("refuse de traverser sa voisine", () => {
    const { doc, sketch, partition } = wall();
    const added = withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 2, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] });
    if (typeof added === "string") throw new Error(added);
    const record = sketchOf(added, sketch).offsets!.find((r) => isShelves(r) && r.step.niche[0] === 1)!;
    expect(withShelfMoved(added, sketch, record.id, 0, 5000)).toMatch(/touche/);
  });
});

describe("mes murs", () => {
  it("garde un mur et le repose sur une zone libre d'une autre longueur, aux mêmes proportions", () => {
    const { doc, sketch } = wall();
    const template = readWall(doc, sketch, "Mon mur")!;
    expect(JSON.parse(JSON.stringify(template))).toEqual(template);
    const other = withPlan({ ...createReferencePlate(), features: [] }, plan({ lengthA: 3600 }));
    const zone = planZones(planOf(other.doc)!.dressingPlan!)[0]!;
    const next = withWall(other.doc, other.id, zone, template);
    if (typeof next === "string") throw new Error(next);
    expect(next.features.some((f) => f.type === "niche" && f.fill === "drawers")).toBe(true);
    const made = planOf(next)!.dressingPlan!.made!.A!;
    const widths = (partitionLayout(sketchOf(next, made).offsets!.find(isPartition)!.step.input) as Exclude<ReturnType<typeof partitionLayout>, string>).caseWidths;
    expect(widths).toHaveLength(template.widths.length);
    expect(widths[0]! / widths[1]!).toBeCloseTo(template.widths[0]! / template.widths[1]!, 3);
  });
});

describe("style du dressing", () => {
  it("donne sa matière à la carcasse et aux façades, pas aux fonds, et sa poignée au projet", () => {
    const { doc, sketch } = wall();
    const bodies = doc.features.filter((f) => f.type === "extrude" && f.sketch === sketch).map((f) => f.id);
    const style = { ...STYLES[3]!, handle: "bar-128" };
    const next = withStyle(doc, bodies, style);
    expect(next.bodyInfo?.[bodies[0]!]?.material).toBe(style.carcass);
    expect(next.hardware?.handle).toBe("bar-128");
  });
});
