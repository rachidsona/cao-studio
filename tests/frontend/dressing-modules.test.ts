/** The modules of dressing in the niches of a Répartition: their steps, what they say, one change in the document. */
import { describe, expect, it } from "vitest";
import { DRESSING, partitionInput } from "../../frontend/src/document/dressing-plan";
import { MODULES, moduleLayout, moduleSizes, moduleSteps, moduleWarnings, withModules, type ModuleKind, type ModulePick } from "../../frontend/src/document/dressing-modules";
import { modelHardware } from "../../frontend/src/document/hardware";
import { emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { extrusionGroups, leafNiches, partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

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
});
