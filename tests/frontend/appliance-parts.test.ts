/**
 * L'électroménager réaliste : les cotes du commerce de chaque modèle, chaque pièce dans l'encombrement de son appareil,
 * peu de formes et presque pas d'opérations booléennes, les bonnes apparences par pièce, l'ordre des premières pièces
 * gardé pour les projets enregistrés (et leurs pièces nouvelles habillées à l'ouverture), un prix indicatif en MAD.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { appearanceById } from "../../frontend/src/appearance/library";
import { applianceSpot, withAppliance } from "../../frontend/src/document/appliance-place";
import { withAppliancePartLooks } from "../../frontend/src/document/appliance-looks";
import { createReferencePlate, type ApplianceFeature, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { APPLIANCE_LIBRARY, CATEGORIES, applianceDef, appliancePrice, priceText } from "../../frontend/src/features/appliance-library";
import { applianceEnvelope, applianceParts, appliancePartNames } from "../../frontend/src/features/appliance-parts";
import { shapeBox } from "../../frontend/src/features/appliance-shapes";
import { buildAppliance } from "../../frontend/src/features/appliance";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { setupKernel } from "./kernel-setup";

/** Each model at each size and finish, and at sizes the kitchen plan gives (a hood under a low ceiling, up to a high one). */
const every = () => [
  ...APPLIANCE_LIBRARY.flatMap((def) => def.sizes.flatMap(([width, height, depth]) => def.finishes.map((finish) => ({ def, spec: { model: def.id, width, height, depth, finish } })))),
  ...[["hood-chimney", 598, 250, 500], ["hood-chimney", 898, 1700, 500], ["hood-glass", 598, 260, 380], ["hood-island", 898, 300, 598], ["hood-box", 598, 250, 500], ["hood-vertical", 598, 260, 380], ["hood-pendant", 420, 300, 420], ["oven-pyro", 597, 600, 550]].map(([model, width, height, depth]) => ({ def: applianceDef(model as string)!, spec: { model: model as string, width: width as number, height: height as number, depth: depth as number, finish: "inox" } })),
];
const looks = (model: string, finish: string) => {
  const [width, height, depth] = applianceDef(model)!.sizes[0]!;
  return Object.fromEntries(applianceParts({ model, width, height, depth, finish }).map((p) => [p.name, p.look]));
};

describe("électroménager : cotes du commerce", () => {
  it("les modèles usuels ont les cotes des catalogues (mm, largeur × hauteur × profondeur)", () => {
    const size = (id: string, i = 0) => applianceDef(id)!.sizes[i];
    expect(size("oven-pyro")).toEqual([595, 595, 548]);
    expect(size("oven-compact")).toEqual([595, 455, 548]);
    expect(size("oven-90")![0]).toBeGreaterThan(890);
    expect(size("microwave-builtin", 1)).toEqual([595, 455, 550]);
    expect(applianceDef("hob-induction")!.sizes.map((s) => s[0])).toEqual([590, 780, 900]);
    expect(applianceDef("hob-gas")!.sizes.map((s) => s[0])).toEqual([580, 750, 860]);
    expect(applianceDef("hood-chimney")!.sizes.map((s) => s[0])).toEqual([598, 898]);
    expect(size("dishwasher-builtin")).toEqual([598, 815, 550]);
    expect(size("dishwasher-free")).toEqual([598, 850, 600]);
    expect(size("fridge-builtin")![1]).toBe(1770);
    expect(size("fridge-american")![0]).toBeGreaterThan(900);
    expect(size("wine-builtin")).toEqual([595, 818, 570]);
    // A built-in fits a 600 cabinet; an under-counter one stands under an 870 + 38 worktop.
    for (const id of ["oven-pyro", "oven-compact", "microwave-builtin", "dishwasher-builtin", "wine-builtin"]) expect(size(id)![0], id).toBeLessThanOrEqual(600);
    for (const id of ["dishwasher-builtin", "dishwasher-free", "wine-builtin"]) expect(size(id)![1], id).toBeLessThanOrEqual(870);
  });

  it("chaque famille a sa place dans la bibliothèque, et chaque taille son prix indicatif en MAD", () => {
    expect(CATEGORIES.map((c) => c.id)).toContain("wine");
    for (const def of APPLIANCE_LIBRARY) {
      expect(CATEGORIES.some((c) => c.id === def.category), def.id).toBe(true);
      expect(def.prices.length, def.id).toBe(def.sizes.length);
      for (const p of def.prices) expect(p, def.id).toBeGreaterThan(300);
      // A larger size is no cheaper (same model).
      def.sizes.forEach((s, i) => def.sizes.forEach((t, j) => s[0] > t[0] && s[1] >= t[1] && expect(def.prices[i]!, def.id).toBeGreaterThanOrEqual(def.prices[j]!)));
      expect(def.name, def.id).not.toMatch(/bosch|siemens|miele|samsung|lg|whirlpool|smeg|franke/i);
    }
    expect(appliancePrice(applianceDef("hob-induction")!, [900, 55, 520])).toBe(8990);
    expect(appliancePrice(applianceDef("hob-induction")!, [123, 55, 520])).toBe(4990);
    expect(priceText(12900)).toBe("12 900 MAD");
  });
});

describe("électroménager : chaque pièce dans son appareil", () => {
  it("chaque pièce, à chaque taille et finition, tient dans l'encombrement de son appareil", () => {
    for (const { spec } of every()) {
      const [lo, hi] = applianceEnvelope(spec);
      // Its box, and only a little in front (door, handle) and on top (a gas hob's grids).
      expect(lo[1], spec.model).toBeGreaterThanOrEqual(-70);
      expect(hi[2] - spec.height, spec.model).toBeLessThanOrEqual(35);
      for (const part of applianceParts(spec)) {
        for (const s of part.shapes) {
          const [a, b] = shapeBox(s);
          for (let i = 0; i < 3; i++) {
            expect(a[i]!, `${spec.model} ${spec.width} ${part.name} min ${i}`).toBeGreaterThanOrEqual(lo[i]! - 1e-6);
            expect(b[i]!, `${spec.model} ${spec.width} ${part.name} max ${i}`).toBeLessThanOrEqual(hi[i]! + 1e-6);
            expect(b[i]! - a[i]!, `${spec.model} ${part.name} épaisseur ${i}`).toBeGreaterThan(0.1);
          }
        }
      }
    }
  });

  it("le corps d'un appareil encastré reste dans sa boîte : seuls sa porte, sa poignée et ses manettes dépassent devant", () => {
    for (const { def, spec } of every().filter(({ def }) => def.place === "in")) {
      const body = applianceParts(spec)[0]!;
      for (const s of body.shapes) {
        const [a, b] = shapeBox(s);
        expect(a[1], def.id).toBeGreaterThanOrEqual(0);
        expect(b[0], def.id).toBeLessThanOrEqual(spec.width + 1e-6);
      }
    }
  });

  it("une cuisine en compte des dizaines : peu de formes, presque aucune opération booléenne", () => {
    for (const { spec } of every()) {
      const shapes = applianceParts(spec).flatMap((p) => p.shapes);
      expect(shapes.length, spec.model).toBeLessThanOrEqual(64);
      const booleans = shapes.reduce((n, s) => n + (s.kind === "bowl" ? 1 : s.kind === "box" ? (s.holes?.length ?? 0) : 0), 0);
      expect(booleans, spec.model).toBeLessThanOrEqual(4);
      expect(applianceParts(spec).length, spec.model).toBeLessThanOrEqual(12);
    }
  });
});

describe("électroménager : les nouveaux modèles se posent à leur place", () => {
  const base: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas 600", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
  const tall: CabinetFeature = { ...base, id: "cb2", name: "Colonne 600", height: 2100 };

  it("une cave à vin sous le plan posée au sol comme un lave-vaisselle, en colonne sur le socle ; une hotte îlot au milieu du caisson", () => {
    expect(applianceSpot(applianceDef("wine-builtin")!, [595, 818, 570], base, 908)).toEqual([2.5, 0, 870 - 818 - 5]);
    expect(applianceSpot(applianceDef("wine-column")!, [595, 1772, 560], tall, 908)).toEqual([2.5, 0, 150 + 18]);
    expect(applianceSpot(applianceDef("hood-island")!, [898, 900, 598], base, 908)).toEqual([-149, (560 - 598) / 2, 908 + 650]);
    // The pendant one too, over the middle; the box and the vertical one against the wall, as a chimney hood.
    expect(applianceSpot(applianceDef("hood-pendant")!, [420, 900, 420], base, 908)).toEqual([90, (560 - 420) / 2, 908 + 650]);
    expect(applianceSpot(applianceDef("hood-vertical")!, [598, 900, 380], base, 908)[1]).toBe(560 - 380);
    const r = withAppliance({ ...createReferencePlate(), features: [base] }, "wine-builtin", [595, 818, 570], "black", base);
    if (typeof r === "string") throw new Error(r);
    expect((r.doc.features[0] as CabinetFeature).shelves).toBe(0);
  });

  it("réfrigérateur sous plan et lave-linge intégrable au sol du caisson bas ; un réfrigérateur trop haut pour lui refusé ; machine à café et tiroir chauffe-plat en colonne", () => {
    expect(applianceSpot(applianceDef("fridge-under")!, [598, 820, 550], base, 908)).toEqual([1, 0, 870 - 820 - 5]);
    expect(applianceSpot(applianceDef("fridge-under")!, [598, 820, 550], tall, 908)).toEqual([1, 0, 150 + 18]);
    expect(applianceSpot(applianceDef("fridge-builtin")!, [540, 1220, 545], base, 908)).toMatch(/1220 mm de haut/);
    expect(applianceSpot(applianceDef("washer-builtin")!, [596, 818, 544], base, 908)).toEqual([2, 0, 870 - 818 - 5]);
    for (const id of ["coffee-builtin", "drawer-warming"]) expect(typeof applianceSpot(applianceDef(id)!, applianceDef(id)!.sizes[0]!, tall, 908), id).toBe("object");
    expect(applianceDef("hob-extract")!.category).toBe("hob");
  });

  it("le petit électroménager se pose sur le plan de travail, contre le mur, sans le découper ; piano de cuisson et multi-portes debout", () => {
    expect(CATEGORIES.map((c) => c.id)).toContain("small");
    for (const id of ["kettle", "toaster", "espresso", "mixer"]) {
      const def = applianceDef(id)!;
      const [w, h, d] = def.sizes[0]!;
      expect(applianceSpot(def, [w, h, d], base, 908), id).toEqual([(600 - w) / 2, 560 - d - 30, 908]);
      const r = withAppliance({ ...createReferencePlate(), features: [base] }, id, [w, h, d], def.finishes[0]!, base);
      if (typeof r === "string") throw new Error(r);
      expect(r.doc.features.some((f) => f.type !== "cabinet" && f.type !== "appliance"), id).toBe(false);
    }
    for (const id of ["range-90", "fridge-french", "dryer-free"]) expect(applianceDef(id)!.place, id).toBe("stand");
    // The range's grids are its top: nothing above its height.
    expect(applianceEnvelope({ model: "range-90", width: 900, height: 900, depth: 600, finish: "inox" })[1][2]).toBe(900);
    expect(appliancePartNames({ model: "range-90", width: 900, height: 900, depth: 600, finish: "inox" })).toEqual(expect.arrayContaining(["Porte du four", "Grilles en fonte", "Chapeaux de brûleurs", "Manettes"]));
  });
});

describe("électroménager : un micro-ondes réaliste", () => {
  it("sa vitre ouvre sur sa cavité aux parois claires, son plateau tournant en verre dedans ; touches, bouton d'ouverture ; ouïes du posable", () => {
    for (const [model, size] of [["microwave-builtin", [595, 390, 400]], ["microwave-free", [485, 280, 370]]] as const) {
      const parts = applianceParts({ model, width: size[0], height: size[1], depth: size[2], finish: "inox" });
      const by = Object.fromEntries(parts.map((p) => [p.name, p]));
      const door = by["Porte"]!.shapes[0]!;
      const body = by["Caisse"]!.shapes[0]!;
      // The door and the body are dug through where the window is: the cavity shows through the tinted glass.
      expect(door.kind === "box" && door.holes?.length, model).toBe(1);
      expect(body.kind === "box" && body.holes?.[0]![0][1], model).toBeLessThan(0);
      expect(by["Intérieur"]!.shapes, model).toHaveLength(5);
      expect(by["Plateau tournant"]!.look).toBe("glass-clear");
      const [plate] = by["Plateau tournant"]!.shapes.slice(-1).map(shapeBox);
      const [cavity] = [body.kind === "box" ? body.holes![0]! : null];
      for (const i of [0, 1]) {
        expect(plate![0][i]!, model).toBeGreaterThan(cavity![0][i]!);
        expect(plate![1][i]!, model).toBeLessThan(cavity![1][i]!);
      }
      expect(by["Touches"]!.shapes, model).toHaveLength(5);
    }
    expect(appliancePartNames({ model: "microwave-free", width: 485, height: 280, depth: 370, finish: "black" })).toEqual(["Caisse", "Porte", "Vitre", "Commandes", "Manette", "Poignée", "Afficheur", "Pieds", "Intérieur", "Plateau tournant", "Touches", "Ouïes"]);
  });
});

describe("électroménager : apparences et projets enregistrés", () => {
  it("chaque pièce a une apparence de la bibliothèque, la bonne pour ce qu'elle est", () => {
    for (const { spec } of every()) for (const p of applianceParts(spec)) expect(appearanceById(p.look), `${spec.model} ${p.name} ${p.look}`).toBeDefined();
    expect(looks("oven-pyro", "inox")).toMatchObject({ Porte: "steel-brushed", "Verre de porte": "glass-lacquered-black", Vitre: "glass-oven", Afficheur: "display-white", Joint: "rubber-black" });
    expect(looks("oven-pyro", "black")).toMatchObject({ Porte: "glass-lacquered-black", Poignée: "steel-black" });
    expect(looks("hob-induction", "black")).toMatchObject({ "Verre vitrocéramique": "glass-ceramic", Foyers: "plastic-grey" });
    expect(looks("hob-gas", "inox")).toMatchObject({ Plateau: "steel-brushed", "Grilles en fonte": "cast-iron", "Chapeaux de brûleurs": "enamel-black", Brûleurs: "aluminium-brushed" });
    expect(looks("hood-chimney", "inox")).toMatchObject({ Hotte: "steel-brushed", Filtres: "aluminium-brushed", Éclairage: "led-neutral" });
    expect(looks("fridge-american", "black")).toMatchObject({ "Porte réfrigérateur": "glass-lacquered-black", Caisse: "steel-black", Joint: "rubber-black" });
    expect(looks("wine-builtin", "black")).toMatchObject({ Vitre: "glass-smoked", Clayettes: "wood-beech" });
    expect(looks("sink-granite", "black")).toMatchObject({ Plage: "granite-black", Bonde: "chrome" });
    expect(appearanceById("cast-iron")!.category).toBe("appliance");
    expect(appearanceById("display-white")!.emissive).toBeGreaterThan(0);
  });

  it("les premières pièces de chaque modèle gardent leur ordre et leur nom (apparences gardées par rang)", () => {
    const first = (model: string, finish = "inox") => {
      const [width, height, depth] = applianceDef(model)!.sizes[0]!;
      return appliancePartNames({ model, width, height, depth, finish });
    };
    expect(first("oven-pyro").slice(0, 7)).toEqual(["Caisse", "Porte", "Vitre", "Bandeau de commande", "Écran", "Manettes", "Poignée"]);
    expect(first("microwave-builtin").slice(0, 6)).toEqual(["Caisse", "Porte", "Vitre", "Commandes", "Manette", "Poignée"]);
    expect(first("hob-induction", "black").slice(0, 4)).toEqual(["Verre vitrocéramique", "Corps", "Foyers", "Commandes tactiles"]);
    expect(first("hob-gas").slice(0, 5)).toEqual(["Plateau", "Corps", "Brûleurs", "Grilles en fonte", "Manettes"]);
    expect(first("hood-chimney").slice(0, 5)).toEqual(["Hotte", "Filtres", "Corps", "Cheminée", "Boutons"]);
    expect(first("hood-glass", "black").slice(0, 5)).toEqual(["Façade en verre", "Filtres", "Corps", "Cheminée", "Boutons"]);
    expect(first("hood-builtin").slice(0, 3)).toEqual(["Groupe", "Visière", "Filtres"]);
    expect(first("hood-box")).toEqual(["Hotte", "Filtres", "Corps", "Cheminée", "Boutons", "Cheminée haute", "Éclairage"]);
    expect(first("hood-vertical", "black")).toEqual(["Façade en verre", "Filtres", "Corps", "Cheminée", "Boutons", "Cheminée haute", "Éclairage"]);
    expect(first("hood-pendant")).toEqual(["Hotte", "Filtres", "Câbles", "Éclairage"]);
    expect(first("fridge-builtin", "white").slice(0, 2)).toEqual(["Caisse", "Joint"]);
    expect(first("fridge-combi").slice(0, 5)).toEqual(["Caisse", "Porte congélateur", "Porte réfrigérateur", "Poignées", "Socle"]);
    expect(first("fridge-american").slice(0, 6)).toEqual(["Caisse", "Porte congélateur", "Porte réfrigérateur", "Distributeur d'eau", "Poignées", "Socle"]);
    expect(first("dishwasher-builtin").slice(0, 2)).toEqual(["Cuve", "Bandeau"]);
    expect(first("dishwasher-free").slice(0, 5)).toEqual(["Caisse", "Porte", "Bandeau de commande", "Poignée", "Socle"]);
    expect(first("sink-steel").slice(0, 4)).toEqual(["Plage", "Bac", "Bonde", "Égouttoir"]);
    expect(first("tap-pro", "chrome").slice(0, 4)).toEqual(["Embase", "Corps", "Manette", "Ressort"]);
  });

  it("un projet enregistré avant les pièces nouvelles les a habillées à l'ouverture, sans toucher aux autres", () => {
    const base: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas 600", origin: [0, 0, 0], width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" };
    const placed = withAppliance({ ...createReferencePlate(), features: [base] }, "oven-pyro", [595, 595, 548], "inox", base);
    if (typeof placed === "string") throw new Error(placed);
    // As saved before: only its seven first pieces dressed, the door given another look by hand.
    const old: CadDocument = { ...placed.doc, bodyInfo: Object.fromEntries(Object.entries(placed.doc.bodyInfo ?? {}).filter(([id]) => !id.startsWith(`${placed.id}#`) || Number(id.split("#")[1]) < 7)) };
    old.bodyInfo![`${placed.id}#1`] = { ...old.bodyInfo![`${placed.id}#1`], appearance: "lacquer-black-gloss" };
    const opened = parseDocument(JSON.parse(JSON.stringify(old)));
    expect(opened.bodyInfo?.[`${placed.id}#1`]?.appearance).toBe("lacquer-black-gloss");
    expect(opened.bodyInfo?.[`${placed.id}#8`]).toMatchObject({ appearance: "display-white", room: true, layer: old.bodyInfo![`${placed.id}#0`]!.layer });
    // An appliance never dressed is left alone; a document with nothing to add is the same object.
    const bare: CadDocument = { ...createReferencePlate(), features: [{ id: "ap1", type: "appliance", name: "Four", model: "oven-pyro", origin: [0, 0, 0], width: 595, height: 595, depth: 548, finish: "inox" }] };
    expect(withAppliancePartLooks(bare)).toBe(bare);
    expect(withAppliancePartLooks(placed.doc)).toBe(placed.doc);
  });
});

describe("électroménager réaliste dans le noyau", () => {
  beforeAll(setupKernel, 60_000);

  it("chaque taille de chaque modèle se bâtit, une pièce par corps, à sa place, dans son encombrement", () => {
    for (const def of APPLIANCE_LIBRARY) {
      for (const [width, height, depth] of def.sizes) {
        const f: ApplianceFeature = { id: "ap1", type: "appliance", name: def.name, model: def.id, origin: [1000, 200, 50], width, height, depth, finish: def.finishes[0]! };
        const out = buildAppliance(f);
        const [lo, hi] = applianceEnvelope(f);
        expect(out.shapes.length, def.id).toBe(applianceParts(f).length);
        for (const s of out.shapes) {
          const m = bodyMetrics(s);
          expect(m.volume, def.id).toBeGreaterThan(0);
          for (let i = 0; i < 3; i++) {
            expect(m.bbox[0][i]!, `${def.id} min ${i}`).toBeGreaterThanOrEqual(f.origin[i]! + lo[i]! - 0.01);
            expect(m.bbox[1][i]!, `${def.id} max ${i}`).toBeLessThanOrEqual(f.origin[i]! + hi[i]! + 0.01);
          }
          s.delete();
        }
      }
    }
  });

  it("la façade inclinée d'une hotte en verre est un prisme penché, devant son corps", () => {
    const f: ApplianceFeature = { id: "ap1", type: "appliance", name: "Hotte", model: "hood-glass", origin: [0, 0, 0], width: 598, height: 900, depth: 380, finish: "black" };
    const shapes = buildAppliance(f).shapes;
    const [g, b] = [bodyMetrics(shapes[0]!), bodyMetrics(shapes[2]!)];
    expect(g.bbox[0][1]).toBeLessThan(b.bbox[0][1]);
    expect(g.bbox[1][2]).toBeCloseTo(400, 0);
    // A slab about 5 mm thick: far less than its box.
    const box = (g.bbox[1][0] - g.bbox[0][0]) * (g.bbox[1][1] - g.bbox[0][1]) * (g.bbox[1][2] - g.bbox[0][2]);
    expect(g.volume).toBeLessThan(box * 0.1);
    for (const s of shapes) s.delete();
  });
});
