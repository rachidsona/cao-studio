/** The modules of dressing in the niches of a Répartition: their steps, what they say, one change in the document. */
import { describe, expect, it } from "vitest";
import { DRESSING, partitionInput } from "../../frontend/src/document/dressing-plan";
import { MODULES, moduleLayout, moduleSizes, moduleSteps, moduleWarnings, withModules, type ModuleKind, type ModulePick } from "../../frontend/src/document/dressing-modules";
import { plansOf } from "../../frontend/src/app/dressing/partition-plan";
import { removeStep, removeWithShelves } from "../../frontend/src/document/shelf-removal";
import { deleteFeatures } from "../../frontend/src/document/operations";
import { nicheGeometry } from "../../frontend/src/features/niche-parts";
import { moduleOfNiche, withModuleChanged, withoutModule } from "../../frontend/src/document/module-edit";
import { modelHardware } from "../../frontend/src/document/hardware";
import { emptySketchGeometry, type ShelfParams, type SketchGeometry } from "../../frontend/src/document/sketch";
import { stepOfBody, withSketchExtrusion } from "../../frontend/src/document/sketch-extrusion";
import { shelfMovedBy } from "../../frontend/src/document/niche-size";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { extrusionGroups, heightStep, isShelves, leafNiches, partitionRecord, rebuildChain, withNicheHeight } from "../../frontend/src/sketcher/partition-history";

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

  describe("relus et changés", () => {
    const read = (doc: CadDocument, path: number[]) => moduleOfNiche(doc, sketchOf(doc), "of1", path);
    const leaf = (doc: CadDocument, first: number) => leafNiches(sketchOf(doc)).filter((n) => n.path[0] === first);

    it("se relisent tous dans leurs étapes, depuis n'importe quelle niche", () => {
      for (const kind of ["long", "double", "drawers", "rod-drawers", "shelves", "trousers"] as ModuleKind[]) {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), kind);
        for (const n of leaf(next, 0)) expect(read(next, n.path)).toMatchObject({ kind, path: [0], thickness: 18 });
      }
    });

    it("une case libre ou divisée à la main n'est pas un module", () => {
      const doc = cabinet();
      expect(read(doc, [0])).toBeNull();
      const next = made(doc, picks(doc, 0), "drawers");
      expect(read(next, [1])).toBeNull();
    });

    it("rendent leurs mesures réelles : tiroirs, zone, nombre d'étagères, niches réglées", () => {
      const doc = cabinet();
      const sizes = { ...moduleSizes("drawers"), drawers: 5, drawerZone: 800, shelves: 3, heights: { "1.1": 200 } };
      const next = withModules(doc, "sk1", picks(doc, 0), "drawers", 22, sizes) as CadDocument;
      const placed = read(next, leaf(next, 0)[1]!.path)!;
      expect(placed.sizes).toMatchObject({ drawers: 5, drawerZone: 800, shelves: 3, heights: { "1.1": 200 } });
      expect(placed.thickness).toBe(22);
    });

    it("se changent en une fois : étagères, tiroirs, hauteur d'une niche, sans doubler ce qui existait", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const placed = read(next, leaf(next, 0)[2]!.path)!;
      const shelves = next.features.filter((f) => f.name.startsWith("Étagère "));
      const dressed: CadDocument = { ...next, bodyInfo: { ...next.bodyInfo, [shelves[1]!.id]: { appearance: "chene" } } };
      const after = withModuleChanged(dressed, "sk1", placed, "drawers", 18, { ...placed.sizes, drawers: 4, shelves: 2, heights: { "1.2": 400 } }) as CadDocument;
      expect(typeof after).toBe("object");
      expect(niches(after)).toHaveLength(1);
      expect(niches(after)[0]!.drawers).toBe(4);
      const left = leaf(after, 0).map((n) => Number((n.box.y1 - n.box.y0).toFixed(3)));
      expect(left).toHaveLength(4);
      expect(left.at(-1)).toBe(400);
      expect(after.features.filter((f) => f.name.startsWith("Étagère "))).toHaveLength(3);
      expect(after.bodyInfo?.[after.features.filter((f) => f.name.startsWith("Étagère "))[1]!.id]).toEqual({ appearance: "chene" });
      expect(() => parseDocument(JSON.parse(JSON.stringify(after)))).not.toThrow();
    });

    it("les façades des tiroirs d'un module prennent un style, que le module relit et qu'on change", () => {
      const doc = cabinet();
      const sizes = { ...moduleSizes("drawers"), front: { gap: 3, bottomGap: 3, betweenGap: 3, sideGap: 3, thickness: 18, handles: true, style: "fluted" as const, pitch: 30, frameDepth: 3, frameWidth: 0 } };
      const result = withModules(doc, "sk1", picks(doc, 0), "drawers", 18, sizes);
      if (typeof result === "string") throw new Error(result);
      expect(niches(result).find((f) => f.fill === "drawers")).toMatchObject({ style: "fluted", pitch: 30, frameDepth: 3 });
      const placed = read(result, leaf(result, 0)[2]!.path)!;
      expect(placed.sizes.front).toMatchObject({ style: "fluted", pitch: 30, frameDepth: 3, frameWidth: 0 });
      const slats = withModuleChanged(result, "sk1", placed, "drawers", 18, { ...placed.sizes, front: { ...placed.sizes.front!, style: "slats", pitch: 45, frameDepth: 4 } }) as CadDocument;
      expect(niches(slats).find((f) => f.fill === "drawers")).toMatchObject({ style: "slats", pitch: 45 });
      expect(() => parseDocument(JSON.parse(JSON.stringify(slats)))).not.toThrow();
    });

    it("changent de type, et le porte-pantalons quitte le devis", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "trousers");
      const placed = read(next, leaf(next, 0)[0]!.path)!;
      const after = withModuleChanged(next, "sk1", placed, "long", 18, moduleSizes("long")) as CadDocument;
      expect(niches(after).map((f) => f.fill)).toEqual(["rod"]);
      expect(modelHardware(after).some((h) => h.name === "Porte-pantalons coulissant")).toBe(false);
      const same = withModuleChanged(next, "sk1", placed, "trousers", 18, placed.sizes) as CadDocument;
      expect(modelHardware(same)).toEqual(expect.arrayContaining([{ name: "Porte-pantalons coulissant", quantity: 1 }]));
    });

    it("gardent les réglages de leurs façades et de leur tringle", () => {
      const doc = cabinet();
      const sizes = { ...moduleSizes("rod-drawers"), rod: { diameter: 30, drop: 80 }, front: { gap: 5, bottomGap: 2, betweenGap: 4, sideGap: 6, thickness: 22, handles: false } };
      const next = withModules(doc, "sk1", picks(doc, 0), "rod-drawers", 18, sizes) as CadDocument;
      expect(read(next, leaf(next, 0)[0]!.path)!.sizes).toMatchObject({ rod: sizes.rod, front: sizes.front });
    });

    it("se retirent : la niche est de nouveau libre", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const after = withoutModule(next, "sk1", read(next, leaf(next, 0)[0]!.path)!);
      expect(leaf(after, 0).map((n) => n.path.join())).toEqual(["0"]);
      expect(niches(after)).toEqual([]);
    });
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

    it("se règlent niche par niche avec l'outil Niche, le reste réparti, les tiroirs à leur place", () => {
      const doc = cabinet();
      const next = made(doc, picks(doc, 0), "drawers");
      const leaf = leafNiches(sketchOf(next)).filter((n) => n.path[0] === 0 && n.path[1] === 1);
      const [third, top] = [leaf[2]!, leaf.at(-1)!];
      const step = heightStep(sketchOf(next), third.partition, third.path)!;
      expect(step.record.name).toBe("Étagères 2");
      expect(step.index).toBe(2);
      // The drawers' niche is set by the step that made it.
      const drawers = leafNiches(sketchOf(next)).find((n) => n.path.join() === "0,0")!;
      expect(heightStep(sketchOf(next), drawers.partition, drawers.path)).toMatchObject({ index: 0 });
      // A case nothing divides has no height of its own.
      const free = leafNiches(sketchOf(next)).find((n) => n.path.join() === "1")!;
      expect(heightStep(sketchOf(next), free.partition, free.path)).toBeNull();

      const input = withNicheHeight(withNicheHeight((step.record.step as { input: ShelfParams }).input, 2, 200), 4, 400);
      const after = changed(next, step.record.id, input);
      const h = heights(after);
      expect(h[2]).toBe(200);
      expect(h[4]).toBe(400);
      expect(new Set([h[0], h[1], h[3]]).size).toBe(1);
      expect(top.box.y1).toBe(leafNiches(sketchOf(after)).filter((n) => n.path[0] === 0 && n.path[1] === 1).at(-1)!.box.y1);
      expect(niches(after)).toHaveLength(1);
      expect(() => parseDocument(JSON.parse(JSON.stringify(after)))).not.toThrow();
      // Released, it shares what is left again; all released, the niches are equal.
      expect(withNicheHeight(input, 2, null)).toMatchObject({ mode: "set", heights: [null, null, null, null, 400] });
      expect(withNicheHeight(withNicheHeight(input, 2, null), 4, null).mode).toBe("equal");
    });

    describe("se suppriment avec leurs traits et leurs niches", () => {
      const shelfHeights = (doc: CadDocument) => shelvesOf(doc).map((f) => (f.type === "extrude" ? f.regions?.[0]?.[1] : 0)).sort((a, b) => a! - b!);
      const leaves = (doc: CadDocument) => leafNiches(sketchOf(doc)).map((n) => n.path.join("."));

      it("une étagère du milieu : les autres ne bougent pas, ses niches n'en font plus qu'une", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "drawers");
        const before = shelfHeights(next);
        const lines = sketchOf(next).curves.length;
        const [one, two] = [shelvesOf(next)[2]!, shelvesOf(next)[4]!];
        const dressed: CadDocument = { ...next, bodyInfo: { [two.id]: { appearance: "noyer" } } };
        const { next: after, lost } = removeWithShelves(dressed, [one.id]);
        expect(lost).toEqual([]);
        expect(shelfHeights(after)).toEqual(before.filter((_, i) => i !== 2));
        expect(sketchOf(after).curves.length).toBe(lines - 2);
        expect(leaves(after)).toHaveLength(leaves(next).length - 1);
        const step = sketchOf(after).offsets!.find((r) => r.name === "Étagères 2")!;
        expect(isShelves(step) && step.step.input.count).toBe(3);
        expect(step.bodies).toHaveLength(3);
        expect(after.bodyInfo?.[shelvesOf(after).at(-1)!.id]).toEqual({ appearance: "noyer" });
        expect(niches(after)).toHaveLength(1);
        expect(() => parseDocument(JSON.parse(JSON.stringify(after)))).not.toThrow();
      });

      it("toutes celles d'une étape : l'étape, ses traits et ses niches s'en vont", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "drawers");
        const step = sketchOf(next).offsets!.find((r) => r.name === "Étagères 2")!;
        const { next: after, lost } = removeWithShelves(next, step.bodies!);
        expect(lost).toEqual([]);
        expect(sketchOf(after).offsets!.some((r) => r.name === "Étagères 2")).toBe(false);
        expect(leaves(after).filter((p) => p.startsWith("0"))).toEqual(["0.0", "0.1"]);
        expect(shelvesOf(after)).toHaveLength(1);
        expect(sketchOf(after).curves.length).toBe(sketchOf(next).curves.length - 8);
      });

      it("ce qui suit une niche suit sa nouvelle place, et ce qu'une niche fusionnée contenait part avec elle", () => {
        const doc = cabinet();
        const shelves = made(doc, picks(doc, 0), "shelves");
        const niche = picks(shelves, 0).at(-1)!;
        const next = withModules(shelves, "sk1", [niche], "long", 18, { ...moduleSizes("long"), hat: 100 }) as CadDocument;
        const rod = niches(next)[0]!;
        const last = niche.path.at(-1)!;
        // A shelf below it: the niche goes down a step, and the division in it with it.
        const below = removeWithShelves(next, [shelvesOf(next)[0]!.id]);
        expect(below.lost).toEqual([]);
        expect(niches(below.next)[0]!.niche).toEqual([0, last - 1, 0]);
        expect(typeof nicheGeometry(niches(below.next)[0]!, sketchOf(below.next))).not.toBe("string");
        // The shelf right under it joins it to the niche below: what it held goes.
        const step = sketchOf(next).offsets!.find((r) => r.name === "Étagères 1")!;
        const under = removeWithShelves(next, [step.bodies!.at(-1)!]);
        expect(under.lost).toEqual(expect.arrayContaining([rod.id]));
        expect(niches(under.next)).toEqual([]);
        expect(sketchOf(under.next).offsets!.some((r) => r.name === "Étagères 2")).toBe(false);
      });

      it("depuis l'Historique, l'étape emporte ses étagères", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "shelves");
        const step = sketchOf(next).offsets!.find((r) => r.name === "Étagères 1")!;
        const after = removeStep(next, "sk1", step.id);
        expect(shelvesOf(after)).toEqual([]);
        expect(leaves(after).filter((p) => p.startsWith("0"))).toEqual(["0"]);
      });

      const extrusions = (doc: CadDocument) => doc.features.filter((f) => f.type === "extrude").map((f) => f.id);

      it("tous les corps de la Répartition : son esquisse s'en va, ce qu'elle portait aussi", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "drawers");
        const { next: after, lost } = removeWithShelves(next, extrusions(next));
        expect(after.features).toEqual([]);
        expect(lost).toEqual(expect.arrayContaining([niches(next)[0]!.id]));
        expect(lost).not.toContain("sk1");
      });

      it("une partie seulement : l'esquisse reste", () => {
        const doc = cabinet();
        const side = doc.features.find((f) => f.name === "Côté 2")!;
        const { next, lost } = removeWithShelves(doc, [side.id]);
        expect(next.features.some((f) => f.id === "sk1")).toBe(true);
        expect(lost).toEqual([]);
      });

      it("des panneaux et des étagères ensemble : les panneaux ne reviennent pas", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "shelves");
        const panel = next.features.find((f) => f.name === "Dessus 1" || f.name === "Dessus")!;
        const { next: after } = removeWithShelves(next, [panel.id, shelvesOf(next)[0]!.id]);
        expect(after.features.filter((f) => f.name === panel.name)).toEqual([]);
        expect(shelvesOf(after)).toHaveLength(shelvesOf(next).length - 1);
      });

      it("une esquisse à un seul corps part avec lui, une esquisse sans corps reste", () => {
        const doc = cabinet();
        const plate = createReferencePlate();
        const body = plate.features.find((f) => f.type === "extrude")!;
        const { next } = removeWithShelves(plate, [body.id]);
        expect(next.features.filter((f) => f.type === "sketch")).toEqual([]);
        expect(doc.features.some((f) => f.id === "sk1")).toBe(true);
      });

      it("une Répartition supprimée dans l'Historique emporte ses corps et son esquisse", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "drawers");
        expect(removeStep(next, "sk1", "of1").features).toEqual([]);
      });

      it("une étape dont les corps ont déjà disparu se retire aussi", () => {
        const doc = cabinet();
        const next = made(doc, picks(doc, 0), "shelves");
        const step = sketchOf(next).offsets!.find((r) => r.name === "Étagères 1")!;
        const stale = deleteFeatures(next, step.bodies!).next;
        const after = removeStep(stale, "sk1", step.id);
        expect(leaves(after).filter((p) => p.startsWith("0"))).toEqual(["0"]);
        expect(sketchOf(after).curves.length).toBe(sketchOf(doc).curves.length);
      });
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

describe("les étapes d'un module ont des identifiants à elles", () => {
  /** Every board made on the sketch belongs to one step, and one only; no step shares its id with another. */
  const sound = (doc: CadDocument) => {
    const records = sketchOf(doc).offsets ?? [];
    const ids = records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const owned = records.flatMap((r) => r.bodies ?? []);
    expect(new Set(owned).size).toBe(owned.length);
    const boards = doc.features.filter((f) => f.type === "extrude" && f.sketch === "sk1").map((f) => f.id);
    expect([...boards].sort()).toEqual([...owned].sort());
  };
  const read = (doc: CadDocument, column: number) => moduleOfNiche(doc, sketchOf(doc), "of1", [...leafNiches(sketchOf(doc)).find((n) => n.path[0] === column)!.path]);

  it("un identifiant libéré par une étape retirée n'est pas repris : le module à deux étapes posé ensuite ne prend pas celui d'une étape voisine", () => {
    // A rod in the first two cases, the first one taken away: its id is free, the next one still in use.
    let doc = made(cabinet(), picks(cabinet(), 0), "long");
    doc = made(doc, picks(doc, 1), "long");
    doc = withoutModule(doc, "sk1", read(doc, 0)!);
    sound(doc);
    const kept = read(doc, 1)!;
    const boardsBefore = doc.features.filter((f) => f.type === "extrude").length;
    // Drawers and shelves in the third case: two steps, made together.
    doc = made(doc, picks(doc, 2), "drawers");
    sound(doc);
    expect(read(doc, 1)).toMatchObject({ kind: "long", step: kept.step });
    // Changed, as its settings do at the bottom of « Modules à glisser »: it alone is made again, nothing left behind.
    const placed = read(doc, 2)!;
    expect(placed.kind).toBe("drawers");
    const before = doc.features.filter((f) => f.type === "extrude").length;
    const changed = withModuleChanged(doc, "sk1", placed, "drawers", 18, { ...placed.sizes, shelves: (placed.sizes.shelves ?? 0) + 2 });
    if (typeof changed === "string") throw new Error(changed);
    sound(changed);
    expect(changed.features.filter((f) => f.type === "extrude").length).toBe(before + 2);
    expect(read(changed, 1)).toMatchObject({ kind: "long", step: kept.step });
    expect(() => parseDocument(JSON.parse(JSON.stringify(changed)))).not.toThrow();
    // And again, and taken away: the cabinet as it was before it.
    const again = withModuleChanged(changed, "sk1", read(changed, 2)!, "drawers", 18, { ...placed.sizes, shelves: 1 });
    if (typeof again === "string") throw new Error(again);
    sound(again);
    const bare = withoutModule(again, "sk1", read(again, 2)!);
    sound(bare);
    expect(bare.features.filter((f) => f.type === "extrude").length).toBe(boardsBefore);
  });
});

describe("un module dans une niche vide d'un module posé", () => {
  it("une colonne d'une seule étagère : la niche du dessous, vide, reçoit des tiroirs et étagères", () => {
    const one = withModules(cabinet(), "sk1", picks(cabinet(), 1), "shelves", 18, { ...moduleSizes("shelves"), shelves: 1 });
    if (typeof one === "string") throw new Error(one);
    const below = leafNiches(sketchOf(one)).find((n) => n.path.join(".") === "1.0")!;
    // The niche counts as part of the column of shelves placed…
    expect(moduleOfNiche(one, sketchOf(one), below.partition, below.path)).not.toBeNull();
    // …and still takes a module of its own (the palette drops it there).
    const next = withModules(one, "sk1", [{ partition: below.partition, path: below.path, box: below.box }], "drawers", 18, moduleSizes("drawers"));
    if (typeof next === "string") throw new Error(next);
    expect(niches(next).some((n) => n.fill === "drawers" && n.niche.slice(0, 2).join(".") === "1.0")).toBe(true);
  });
});

describe("une étagère déplacée comme un corps (Déplacer)", () => {
  it("le long de son axe : elle bouge dans sa division, ses niches et ce qui les équipe suivent ; de travers : un déplacement de corps", () => {
    const doc = made(cabinet(), picks(cabinet(), 0), "drawers");
    const sketch = sketchOf(doc);
    const drawers = niches(doc).find((n) => n.fill === "drawers")!;
    const record = (sketch.offsets ?? []).find((r) => isShelves(r) && r.bodies?.length)!;
    const body = record.bodies![0]!;
    const before = nicheGeometry(drawers, sketch);
    // The sketch of the wall is upright, in XZ: a shelf goes up and down along Z.
    const moved = shelfMovedBy(doc, body, [0, 0, -50]);
    expect(typeof moved).toBe("object");
    const after = moved as CadDocument;
    expect((sketchOf(after).offsets ?? []).find((r) => r.id === record.id)?.step).not.toEqual(record.step);
    const following = nicheGeometry(niches(after).find((n) => n.fill === "drawers")!, sketchOf(after));
    expect(typeof before === "string" || typeof following === "string").toBe(false);
    if (typeof before !== "string" && typeof following !== "string") expect(following.box).not.toEqual(before.box);
    // Sideways, or not a shelf of a Répartition: it stays a move of the body.
    expect(shelfMovedBy(doc, body, [30, 0, 0])).toBeNull();
    expect(shelfMovedBy(doc, "nothing", [0, 0, -50])).toBeNull();
  });
});
