/** The modules of dressing in the niches of a Répartition: their steps, what they say, one change in the document. */
import { describe, expect, it } from "vitest";
import { DRESSING, partitionInput } from "../../frontend/src/document/dressing-plan";
import { MODULES, moduleLayout, moduleSizes, moduleSteps, moduleWarnings, withModules, type ModuleKind, type ModulePick } from "../../frontend/src/document/dressing-modules";
import { plansOf } from "../../frontend/src/app/partition-plan";
import { modelHardware } from "../../frontend/src/document/hardware";
import { emptySketchGeometry, type ShelfParams, type SketchGeometry } from "../../frontend/src/document/sketch";
import { stepOfBody, withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { extrusionGroups, isShelves, leafNiches, partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const box = { x0: 18, y0: 98, x1: 918, y1: 2482 };

/** A Répartition of 3 cases, 60 cm deep, nothing in its niches. */
function cabinet(depth = 600): CadDocument {
  const input = { ...partitionInput({ ...structuredClone(DRESSING), programs: { A: ["long", "long", "long"], B: [], C: [] } }, "A") };
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition", input, [0, 0], depth)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...emptySketchGeometry() };
  const doc = { ...createReferencePlate(), features: [sketch] };
  return withSketchExtrusion(doc, "sk1", rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
}

const sketchOf = (doc: CadDocument) => doc.features.find((f) => f.id === "sk1") as SketchFeature;
const picks = (doc: CadDocument, ...cases: number[]): ModulePick[] =>
  leafNiches(sketchOf(doc))
    .filter((n) => cases.includes(n.path[0]!))
    .map((n) => ({ partition: n.partition, path: n.path, box: n.box }));
const made = (doc: CadDocument, picked: ModulePick[], kind: ModuleKind): CadDocument => {
  const result = withModules(doc, "sk1", picked, kind, 18, moduleSizes(kind));
  if (typeof result === "string") throw new Error(result);
  return result;
};
const niches = (doc: CadDocument) => doc.features.filter((f): f is NicheFeature => f.type === "niche");

describe("modules de dressing", () => {
  it("donnent à une niche profonde les mêmes étapes que l'assistant à une case", () => {
    expect(moduleSteps("double", [2], 2300, 18)).toMatchObject({ equip: [{ niche: [2, 0, 0] }, { niche: [2, 0, 1] }] });
    const deep = moduleSteps("double", [2, 1], 2300, 18);
    expect(deep.divisions.map((d) => d.niche)).toEqual([[2, 1], [2, 1, 0]]);
    expect(deep.equip.map((e) => e.niche)).toEqual([[2, 1, 0, 0], [2, 1, 0, 1]]);
  });

  it("se règlent : chapeau, zone des tiroirs, espacement", () => {
    const hat = moduleLayout(box, [0], "long", 18, { ...moduleSizes("long"), hat: 400 }) as Exclude<ReturnType<typeof moduleLayout>, string>;
    expect(hat.shelves[0]!.y1).toBeCloseTo(box.y1 - 400);
    const tall = moduleLayout(box, [0], "drawers", 18, { ...moduleSizes("drawers"), drawerZone: 900 }) as Exclude<ReturnType<typeof moduleLayout>, string>;
    expect(tall.equip[0]!.box.y1 - tall.equip[0]!.box.y0).toBeCloseTo(900);
    const near = moduleLayout(box, [0], "shelves", 18, { ...moduleSizes("shelves"), spacing: 200 }) as Exclude<ReturnType<typeof moduleLayout>, string>;
    const far = moduleLayout(box, [0], "shelves", 18, moduleSizes("shelves")) as Exclude<ReturnType<typeof moduleLayout>, string>;
    expect(near.shelves.length).toBeGreaterThan(far.shelves.length);
  });

  it("disent quand ils ne tiennent pas", () => {
    expect(moduleLayout({ ...box, y1: 250 }, [0], "long", 18, moduleSizes("long"))).toEqual(expect.any(String));
  });

  it("préviennent : tringle hors de portée ou trop longue, étagère haute, flèche, cintres", () => {
    const layout = moduleLayout(box, [0], "long", 18, moduleSizes("long")) as Exclude<ReturnType<typeof moduleLayout>, string>;
    const said = moduleWarnings(layout, 0, 600, 18).join(" ");
    expect(said).toMatch(/Tringle à 210,4 cm/);
    expect(said).toMatch(/Étagère à 218/);
    expect(moduleWarnings(layout, 0, 450, 18).join(" ")).toMatch(/cintres/);
    const wide = moduleLayout({ ...box, x1: 1500 }, [0], "long", 18, moduleSizes("long")) as Exclude<ReturnType<typeof moduleLayout>, string>;
    expect(moduleWarnings(wide, 0, 600, 18).join(" ")).toMatch(/Tringle de 148,2 cm/);
    expect(moduleWarnings(wide, 0, 600, 18).join(" ")).toMatch(/fléchit de/);
    const low = moduleLayout({ ...box, y1: 1900 }, [0], "long", 18, moduleSizes("long")) as Exclude<ReturnType<typeof moduleLayout>, string>;
    expect(moduleWarnings(low, 0, 600, 18)).toEqual([]);
  });

  it("arrivent dans le document : étapes, corps, équipements, et le document reste valide", () => {
    const doc = cabinet();
    const next = made(doc, picks(doc, 0), "double");
    const steps = sketchOf(next).offsets ?? [];
    expect(steps.map((r) => r.name)).toEqual(["Répartition", "Étagères 1", "Étagères 2"]);
    expect(steps.every((r) => (r.bodies ?? []).length > 0)).toBe(true);
    expect(niches(next).map((f) => [f.name, f.fill, f.niche.join(".")])).toEqual([["Penderie 1", "rod", "0.0.0"], ["Penderie 2", "rod", "0.0.1"]]);
    expect(() => parseDocument(JSON.parse(JSON.stringify(next)))).not.toThrow();
  });

  it("équipent plusieurs niches d'un coup, de gauche à droite, puis une niche obtenue", () => {
    const doc = cabinet();
    const two = made(doc, picks(doc, 2, 0), "drawers");
    expect(niches(two).map((f) => [f.name, f.niche.join(".")])).toEqual([["Tiroirs 1", "0.0"], ["Tiroirs 2", "2.0"]]);
    expect(niches(two)[0]!.drawers).toBe(3);
    // The third case is free, and a niche made above can take another module.
    const third = made(two, picks(two, 1), "long");
    expect(niches(third).map((f) => f.name)).toEqual(["Tiroirs 1", "Tiroirs 2", "Penderie 1"]);
  });

  it("gardent le nombre de tiroirs choisi", () => {
    const doc = cabinet();
    const next = withModules(doc, "sk1", picks(doc, 0), "drawers", 18, { ...moduleSizes("drawers"), drawers: 5 });
    expect(typeof next === "string" ? next : niches(next)[0]!.drawers).toBe(5);
  });

  it("mettent le porte-pantalons au devis", () => {
    const doc = cabinet();
    const next = made(doc, picks(doc, 0), "trousers");
    expect(modelHardware(next)).toEqual(expect.arrayContaining([{ name: "Porte-pantalons coulissant", quantity: 1 }]));
  });

  it("couvrent tous les modules de l'assistant", () => {
    const doc = cabinet();
    for (const kind of Object.keys(MODULES) as ModuleKind[]) expect(() => made(doc, picks(doc, 0), kind)).not.toThrow();
  });

  describe("une fois posés", () => {
    /** The step of the shelves above the drawers changed as « Modifier » does it. */
    const changed = (doc: CadDocument, offset: string, input: Partial<ShelfParams>): CadDocument => {
      const g = sketchOf(doc);
      const offsets = (g.offsets ?? []).map((r) => (r.id === offset && isShelves(r) ? { ...r, step: { ...r.step, input: { ...r.step.input, ...input } } } : r));
      const rebuilt = rebuildChain({ ...g, offsets }, "of1");
      if (typeof rebuilt === "string") throw new Error(rebuilt);
      return withSketchExtrusion(doc, "sk1", rebuilt.geometry, { groups: extrusionGroups(g.offsets ?? [], rebuilt) });
    };
    const shelvesOf = (doc: CadDocument) => doc.features.filter((f) => f.name.startsWith("Étagère "));
    const heights = (doc: CadDocument) => leafNiches(sketchOf(doc)).filter((n) => n.path[0] === 0 && n.path[1] === 1).map((n) => Number((n.box.y1 - n.box.y0).toFixed(1)));

    it("se changent depuis l'étagère : 40 cm sous le dessus, le reste réparti", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const top = shelvesOf(next).at(-1)!;
      const step = stepOfBody(next, top.id)!;
      expect(step).toMatchObject({ sketch: "sk1", kind: "shelves", name: "Étagères 2" });
      const before = heights(next);
      expect(new Set(before).size).toBe(1);
      const after = heights(changed(next, step.offset, { mode: "top", fixed: 400 }));
      expect(after).toHaveLength(before.length);
      expect(after.at(-1)).toBe(400);
      expect(new Set(after.slice(0, -1)).size).toBe(1);
      expect(after.reduce((a, b) => a + b, 0)).toBeCloseTo(before.reduce((a, b) => a + b, 0), 0);
    });

    it("ont des cotes qui suivent le réglage, avant l'OK", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const niche = leafNiches(sketchOf(next)).filter((n) => n.path[0] === 0 && n.path[1] === 1).map((n) => n.box);
      const box = { ...niche[0]!, y1: niche.at(-1)!.y1 };
      const into = [{ ...box, y1: box.y0 + 1000 }, { ...box, y0: box.y0 + 1018 }];
      const [plan] = plansOf(sketchOf(next), [{ box, into }]);
      expect(plan!.niches).toEqual(expect.arrayContaining(into));
      for (const old of niche) expect(plan!.niches).not.toContainEqual(old);
      expect(plan!.niches).toHaveLength(plansOf(sketchOf(next))[0]!.niches.length - niche.length + 2);
    });

    it("gardent matière et apparence de chaque pièce refaite, et les tiroirs suivent", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const [low, high] = [shelvesOf(next)[1]!, shelvesOf(next).at(-1)!];
      const side = next.features.find((f) => f.name === "Côté 2")!;
      const dressed: CadDocument = { ...next, bodyInfo: { [low.id]: { appearance: "chene" }, [high.id]: { appearance: "noyer", color: "#112233" }, [side.id]: { material: "m1" } } };
      const offset = stepOfBody(dressed, high.id)!.offset;
      const after = changed(dressed, offset, { mode: "top", fixed: 400 });
      const look = (name: string) => after.bodyInfo?.[after.features.find((f) => f.name === name)!.id];
      expect(look(low.name)).toEqual({ appearance: "chene" });
      expect(look(high.name)).toEqual({ appearance: "noyer", color: "#112233" });
      expect(look("Côté 2")).toEqual({ material: "m1" });
      expect(niches(after)).toHaveLength(1);
      // One shelf more than before takes after the last one.
      const more = changed(dressed, offset, { count: sketchShelves(dressed, offset) + 1 });
      expect(more.bodyInfo?.[shelvesOf(more).at(-1)!.id]).toEqual({ appearance: "noyer", color: "#112233" });
    });
  });
});

const sketchShelves = (doc: CadDocument, offset: string): number => {
  const r = sketchOf(doc).offsets?.find((o) => o.id === offset);
  return r && isShelves(r) ? r.step.input.count : 0;
};
