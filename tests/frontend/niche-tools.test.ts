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
import { alignedInputs, partBox, shelfLayout, type NicheBox, type ShelfInput } from "../../frontend/src/sketcher/shelves";
import { extrusionGroups, isPartition, isShelves, leafNiches, nicheSpans, pathKey, rebuildChain, rehomedPath, shelvesRecord, withCloisonsThrough, withDivisionUnder } from "../../frontend/src/sketcher/partition-history";
import { moduleOfNiche } from "../../frontend/src/document/module-edit";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";

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

describe("cloison dans la niche mère", () => {
  const cloison = (id: string, of: string, path: number[]) => shelvesRecord(id, "Cloisons 1", of, path, { count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true }, 600);
  const moved = (keep: number) => {
    const { doc, sketch, partition } = wall();
    const g = sketchOf(doc, sketch);
    const offsets = withDivisionUnder(g.offsets!, partition, [0], keep, cloison("of-new", partition, [0]));
    const rebuilt = rebuildChain({ ...g, offsets }, partition);
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const next = withSketchExtrusion(doc, sketch, rebuilt.geometry, { groups: extrusionGroups(g.offsets ?? [], rebuilt), repath: [{ partition, path: (p) => rehomedPath(p, [0], keep) }] });
    return { next, sketch, partition, rebuilt, offsets };
  };

  it("garde les étagères et les tiroirs d'un côté, l'autre côté est une niche vide", () => {
    const { next, sketch, partition, rebuilt, offsets } = moved(0);
    expect(rebuilt.problems).toEqual([]);
    expect(offsets.findIndex((r) => r.id === "of-new")).toBeLessThan(offsets.findIndex((r) => isShelves(r) && r.id !== "of-new"));
    expect(offsets.filter((r) => isShelves(r) && r.id !== "of-new").every((r) => isShelves(r) && r.step.niche.slice(0, 2).join() === "0,0")).toBe(true);
    expect(emptyRecipe(readRecipe(next, { sketch, partition, path: [0, 1] }))).toBe(true);
    expect(emptyRecipe(readRecipe(next, { sketch, partition, path: [0, 0] }))).toBe(false);
    expect(next.features.filter((f): f is NicheFeature => f.type === "niche").every((f) => f.niche.slice(0, 2).join() === "0,0")).toBe(true);
    const whole = rebuilt.niches.get("0")!.box;
    const shelf = rebuilt.niches.get("0.0.1.0")!.box;
    expect(shelf.x1 - shelf.x0).toBeCloseTo((whole.x1 - whole.x0 - 18) / 2, 3);
  });

  it("peut les garder à droite", () => {
    const { next, sketch, partition } = moved(1);
    expect(emptyRecipe(readRecipe(next, { sketch, partition, path: [0, 0] }))).toBe(true);
    expect(emptyRecipe(readRecipe(next, { sketch, partition, path: [0, 1] }))).toBe(false);
  });

  it("ne garde pas de corps en trop, et Module relit encore la colonne", () => {
    const { doc, sketch, partition } = wall();
    const count = (d: CadDocument) => d.features.filter((f) => f.type === "extrude" && f.sketch === sketch).length;
    const { next } = moved(0);
    expect(count(next)).toBe(count(doc) + 1);
    expect(moduleOfNiche(next, sketchOf(next, sketch), partition, [0, 0, 0])?.kind).toBe("drawers");
  });
});

describe("cloison à travers les étagères", () => {
  /** A case of 5 shelves, its 6 niches, then this run of them. */
  const stacked = () => {
    const { doc, sketch, partition } = wall();
    const added = withRecipe(doc, { sketch, partition, path: [1] }, { steps: [{ at: [], input: { count: 5, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] });
    if (typeof added === "string") throw new Error(added);
    return { doc: added, sketch, partition, g: sketchOf(added, sketch) };
  };
  const through = (g: SketchFeature, partition: string, from: number, to: number, keep = 0) => {
    let n = 0;
    const made = withCloisonsThrough(
      g,
      { partition, parent: [1], from, to },
      (niche) => shelvesRecord(`new-${n++}`, "Cloisons 9", partition, niche, { count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true }, 600),
      (niche, input) => shelvesRecord(`new-${n++}`, "Étagères 9", partition, niche, input, 600),
      keep,
    );
    if (typeof made === "string") throw new Error(made);
    const rebuilt = rebuildChain({ ...g, offsets: made.offsets }, partition);
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    return { ...made, rebuilt };
  };

  it("trouve les niches voisines l'une au-dessus de l'autre, pas celles qui sont séparées", () => {
    const { g, partition } = stacked();
    const made = rebuildChain(g, partition);
    if (typeof made === "string") throw new Error(made);
    const box = (k: number) => made.niches.get(`1.${k}`)!.box;
    const [span] = nicheSpans(g, [box(1), box(2), box(3)]);
    expect(span).toMatchObject({ parent: [1], from: 1, to: 3 });
    expect(span!.box).toEqual({ x0: box(1).x0, y0: box(1).y0, x1: box(1).x1, y1: box(3).y1 });
    expect(nicheSpans(g, [box(1), box(3)])).toEqual([]);
    expect(nicheSpans(g, [box(1), made.niches.get("0")!.box])).toEqual([]);
  });

  it("coupe les deux étagères du milieu, garde celles du bord et les hauteurs", () => {
    const { g, partition } = stacked();
    const before = rebuildChain(g, partition);
    if (typeof before === "string") throw new Error(before);
    const { rebuilt } = through(g, partition, 2, 4);
    expect(rebuilt.problems).toEqual([]);
    const shelf = (k: number) => before.niches.get(`1.${k}`)!.box.y1;
    // The cloison goes from the shelf under the run to the shelf above it.
    const whole = rebuilt.niches.get("1.2")!.box;
    expect(whole.y0).toBeCloseTo(before.niches.get("1.2")!.box.y0, 3);
    expect(whole.y1).toBeCloseTo(before.niches.get("1.4")!.box.y1, 3);
    // Left and right: the two middle shelves, cut, at the heights they had.
    for (const side of [0, 1]) {
      expect(rebuilt.niches.get(`1.2.${side}.0`)!.box.y1).toBeCloseTo(shelf(2), 3);
      expect(rebuilt.niches.get(`1.2.${side}.1`)!.box.y1).toBeCloseTo(shelf(3), 3);
      expect(rebuilt.niches.get(`1.2.${side}.2`)!.box.y1).toBeCloseTo(shelf(4), 3);
    }
    // Above the run, nothing moved.
    expect(rebuilt.niches.get("1.3")!.box).toEqual(before.niches.get("1.5")!.box);
    expect(rebuilt.niches.get("1.1")!.box).toEqual(before.niches.get("1.1")!.box);
  });

  it("garde dans la bonne niche ce que les niches contenaient", () => {
    const { g, partition } = stacked();
    const { repath } = through(g, partition, 2, 4);
    expect(repath([1, 3, 0])).toEqual([1, 2, 0, 1, 0]);
    expect(repath([1, 5])).toEqual([1, 3]);
    expect(repath([1, 0])).toEqual([1, 0]);
    expect(repath([0, 3])).toEqual([0, 3]);
    expect(through(g, partition, 2, 4, 1).repath([1, 3])).toEqual([1, 2, 1, 1]);
  });

  it("toute la colonne : la division disparaît, ses corps partent avec elle", () => {
    const { g, partition } = stacked();
    const { rebuilt, removed, offsets } = through(g, partition, 0, 5);
    expect(rebuilt.problems).toEqual([]);
    expect(removed.length).toBe(5);
    expect(rebuilt.niches.get("1.0.4")).toBeDefined();
    expect(offsets.some((r) => isShelves(r) && !r.id.startsWith("new-") && r.step.niche[0] === 1)).toBe(false);
  });
});

describe("cloisons sur une même ligne", () => {
  const equal: ShelfInput = { count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true };
  const places = (box: NicheBox, input: ShelfInput) => {
    const layout = shelfLayout(box, input);
    if (typeof layout === "string") throw new Error(layout);
    return layout.shelves.map((span) => partBox(box, span, layout).x0);
  };

  it("place la cloison de la grande niche sur celle de la plus étroite, comme sur la capture", () => {
    const wide: NicheBox = { x0: 0, y0: 0, x1: 2946, y1: 380 };
    const narrow: NicheBox = { x0: 1482, y0: 400, x1: 2946, y1: 800 };
    const [a, b] = alignedInputs([wide, narrow], equal);
    expect(b).toEqual(equal);
    expect(places(wide, a!)[0]).toBeCloseTo(places(narrow, b!)[0]!, 6);
  });

  it("aligne plusieurs cloisons, et respecte la place fixe de la plus étroite", () => {
    const wide: NicheBox = { x0: 0, y0: 0, x1: 3000, y1: 380 };
    const narrow: NicheBox = { x0: 900, y0: 400, x1: 2100, y1: 800 };
    for (const input of [{ ...equal, count: 2 }, { ...equal, mode: "bottom" as const }]) {
      const [a] = alignedInputs([wide, narrow], input);
      const line = places(narrow, input);
      places(wide, a!).forEach((x, i) => expect(x).toBeCloseTo(line[i]!, 6));
    }
  });

  it("laisse les niches de même largeur et celles que la ligne ne traverse pas", () => {
    const same: NicheBox[] = [{ x0: 0, y0: 0, x1: 1000, y1: 300 }, { x0: 0, y0: 320, x1: 1000, y1: 600 }];
    expect(alignedInputs(same, equal)).toEqual([equal, equal]);
    const apart: NicheBox[] = [{ x0: 0, y0: 0, x1: 500, y1: 300 }, { x0: 2000, y0: 320, x1: 3000, y1: 600 }];
    expect(alignedInputs(apart, equal)).toEqual([equal, equal]);
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
