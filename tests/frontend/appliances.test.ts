/** La bibliothèque d'électroménager : chaque modèle a ses pièces, se bâtit avec le vrai noyau, et se pose par rapport au caisson cliqué. */
import { beforeAll, describe, expect, it } from "vitest";
import { withAppliance, applianceSpot } from "../../frontend/src/document/appliance-place";
import { bodyLabel } from "../../frontend/src/document/operations";
import { createReferencePlate, type ApplianceFeature, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { bodyFamily } from "../../frontend/src/document/display-families";
import { APPLIANCE_LIBRARY, applianceDef } from "../../frontend/src/features/appliance-library";
import { applianceParts } from "../../frontend/src/features/appliance-parts";
import { buildAppliance } from "../../frontend/src/features/appliance";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { setupKernel } from "./kernel-setup";

const base: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas 600", origin: [1000, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
const model = (c: CabinetFeature = base): CadDocument => ({ ...createReferencePlate(), features: [c, fronts] });
const placed = (r: ReturnType<typeof withAppliance>) => {
  if (typeof r === "string") throw new Error(r);
  return r;
};
const appliance = (d: CadDocument, id: string) => d.features.find((f): f is ApplianceFeature => f.id === id)!;

describe("bibliothèque d'électroménager", () => {
  it("chaque modèle, à chaque taille et finition, a ses pièces nommées et habillées", () => {
    for (const def of APPLIANCE_LIBRARY) {
      for (const [width, height, depth] of def.sizes) {
        for (const finish of def.finishes) {
          const parts = applianceParts({ model: def.id, width, height, depth, finish });
          expect(parts.length, def.id).toBeGreaterThanOrEqual(2);
          for (const p of parts) {
            expect(p.name, def.id).toBeTruthy();
            expect(p.look, `${def.id} ${p.name}`).toMatch(/^[a-z-]+$/);
            expect(p.shapes.length).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(applianceParts({ model: "nope", width: 1, height: 1, depth: 1, finish: "inox" })).toEqual([]);
  });

  it("un four se pose dans le caisson, au nu de sa face, sous le plan ; il lui ôte ses façades et ses étagères", () => {
    const r = placed(withAppliance(model(), "oven-pyro", [595, 595, 548], "inox", base));
    const oven = appliance(r.doc, r.id);
    expect(oven.origin).toEqual([1002.5, 0, 870 - 595 - 18]);
    expect(r.doc.features.some((f) => f.type === "fronts")).toBe(false);
    expect((r.doc.features[0] as CabinetFeature).shelves).toBe(0);
    expect(r.notes).toContain("Façades du caisson ôtées.");
    // Its pieces: named, on the appliances' layer, out of the cut list.
    expect(bodyLabel(r.doc, `${r.id}#1`)).toBe("Four encastrable pyrolyse — Porte");
    expect(r.doc.bodyInfo?.[`${r.id}#0`]).toMatchObject({ room: true, appearance: "plastic-black" });
    expect(bodyFamily(r.doc, `${r.id}#1`)).toBe("appliances");
    expect(() => parseDocument(JSON.parse(JSON.stringify(r.doc)))).not.toThrow();
  });

  it("tourné avec son caisson ; trop large pour lui : refusé avec pourquoi", () => {
    const turned = { ...base, rotation: 90 as const };
    const r = placed(withAppliance(model(turned), "dishwasher-builtin", [598, 815, 550], "inox", turned));
    expect(appliance(r.doc, r.id).rotation).toBe(90);
    expect(withAppliance(model({ ...base, width: 400 }), "oven-pyro", [595, 595, 548], "inox", { ...base, width: 400 })).toMatch(/le caisson n'en a que 400/);
  });

  it("un second clic sur le même caisson ne pose pas un deuxième appareil par-dessus le premier", () => {
    const once = placed(withAppliance(model(), "hob-induction", [590, 55, 520], "black", base));
    expect(withAppliance(once.doc, "hob-induction", [590, 55, 520], "black", base)).toMatch(/déjà posé ici/);
    expect(withAppliance(once.doc, "hob-gas", [600, 100, 510], "inox", base)).toMatch(/déjà posé ici/);
    // Another kind of appliance on the same cabinet still goes.
    expect(typeof withAppliance(once.doc, "tap-gooseneck", [50, 380, 210], "chrome", base)).not.toBe("string");
  });

  it("une plaque et un évier sur le plan de travail, découpé dessous ; un robinet au fond, percé ; une hotte à 65 cm au-dessus", () => {
    const worktop = { body: "ex9", box: [[900, -40, 870], [1700, 560, 908]] as [[number, number, number], [number, number, number]] };
    const hob = placed(withAppliance(model(), "hob-induction", [590, 55, 520], "black", base, { worktop }));
    expect(appliance(hob.doc, hob.id).origin[2]).toBe(908 - 49);
    const cut = hob.doc.features.find((f) => f.type === "machining")!;
    expect(cut).toMatchObject({ target: "ex9", kind: "cutout" });
    const tap = placed(withAppliance(model(), "tap-gooseneck", [60, 360, 230], "chrome", base, { worktop }));
    expect(tap.doc.features.find((f) => f.type === "machining")).toMatchObject({ ops: [{ kind: "hole", diameter: 35 }] });
    // A second cut on the same worktop follows the first: one worktop, cut twice, never two copies of it.
    const both = placed(withAppliance(hob.doc, "tap-gooseneck", [60, 360, 230], "chrome", base, { worktop }));
    expect(both.doc.features.filter((f) => f.type === "machining").map((f) => (f as { target: string }).target)).toEqual(["ex9", cut.id]);
    const hood = placed(withAppliance(model(), "hood-chimney", [598, 900, 500], "inox", base, { worktop }));
    expect(appliance(hood.doc, hood.id).origin[2]).toBe(908 + 650);
    expect(appliance(hood.doc, hood.id).origin[1]).toBe(560 - 500);
  });

  it("un réfrigérateur posable debout à sa place, contre le mur ; un groupe filtrant sous un meuble haut", () => {
    const def = applianceDef("fridge-combi")!;
    expect(applianceSpot(def, [595, 1860, 650], base, 908)).toEqual([2.5, 560 - 650, 0]);
    const wall = { ...base, origin: [1000, 0, 1500] as [number, number, number], height: 720, depth: 350, plinth: 0 };
    expect(applianceSpot(applianceDef("hood-builtin")!, [560, 180, 280], wall, 0)).toEqual([20, 0, -180]);
  });
});

describe("électroménager dans le noyau", () => {
  beforeAll(setupKernel, 60_000);

  it("chaque modèle se bâtit, une pièce par corps, valide, à sa place", () => {
    for (const def of APPLIANCE_LIBRARY) {
      const [width, height, depth] = def.sizes[0]!;
      const f: ApplianceFeature = { id: "ap1", type: "appliance", name: def.name, model: def.id, origin: [1000, 200, 0], width, height, depth, finish: def.finishes[0]! };
      const out = buildAppliance(f);
      expect(out.shapes.length, def.id).toBe(applianceParts(f).length);
      for (const s of out.shapes) {
        const m = bodyMetrics(s);
        expect(m.volume, def.id).toBeGreaterThan(0);
        s.delete();
      }
    }
  });
});

describe("le plan de travail sous une plaque posée", () => {
  it("le dessus du caisson (son propre panneau) n'est pas le plan de travail ; le plan posé dessus l'est", async () => {
    const { liesOn } = await import("../../frontend/src/app/appliances/appliance-tool");
    // A cabinet 860 high: its « Dessus » 842 to 860, the kitchen's worktop 860 to 900.
    expect(liesOn(860, [[0, 0, 842], [600, 560, 860]])).toBe(false);
    expect(liesOn(860, [[0, 0, 860], [600, 600, 900]])).toBe(true);
    // Too thick, or far above: not a worktop.
    expect(liesOn(860, [[0, 0, 860], [600, 600, 960]])).toBe(false);
    expect(liesOn(860, [[0, 0, 1000], [600, 600, 1040]])).toBe(false);
  });
});
