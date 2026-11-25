/** Meubles de cuisine pris dans la liste : posés à côté du caisson choisi, construits comme lui ; glissés, tournés. */
import { describe, expect, it } from "vitest";
import { CATALOG, addKitchenUnit, cabinetBox, customEntry, entryFromCabinet, slideCabinet, stickDelta, turnCabinet } from "../../frontend/src/document/kitchen-catalog";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { drawerHeights, frontsParts } from "../../frontend/src/features/fronts-parts";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const entry = (id: string) => CATALOG.find((e) => e.id === id)!;
const cabinets = (doc: CadDocument) => doc.features.filter((f): f is CabinetFeature => f.type === "cabinet");

describe("meubles de cuisine", () => {
  it("chaque meuble a un identifiant à lui, et une seule porte sous 60 cm", () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    expect(CATALOG.filter((e) => e.layout === "doors").every((e) => e.width >= 600)).toBe(true);
    expect(CATALOG.map((e) => e.id)).toEqual(expect.arrayContaining(["base-bas-1-porte-600", "base-bas-evier-800", "tall-colonne-refrigerateur-600"]));
  });

  it("le premier part de l'origine devant le mur, avec ses façades et leurs matières", () => {
    const { doc, cabinet, fronts } = addKitchenUnit(createReferencePlate(), entry("base-bas-1-porte-600"));
    expect(cabinet).toMatchObject({ name: "Bas 1 porte 600", origin: [0, -580, 0], width: 600, height: 870, depth: 580, plinth: 150, shelves: 1 });
    expect(fronts).toMatchObject({ cabinet: cabinet.id, layout: "door" });
    expect(doc.bodyInfo?.[`${fronts!.id}#0`]?.material).toBe("lacquer-white");
    expect(doc.bodyInfo?.[`${cabinet.id}#0`]?.material).toBe("melamine-white");
  });

  it("le bas évier a deux traverses, pas de dessus et pas de fond (les tuyaux passent derrière)", () => {
    const { doc, cabinet } = addKitchenUnit(createReferencePlate(), entry("base-bas-evier-800"));
    expect(cabinet).toMatchObject({ top: "rails", back: "none" });
    expect(cabinetParts(cabinet).map((p) => p.name)).toEqual(["Côté gauche", "Côté droit", "Dessous", "Traverse avant", "Traverse arrière"]);
    expect(doc.bodyInfo?.[`${cabinet.id}#3`]?.material).toBe("melamine-white");
    expect(doc.bodyInfo?.[`${cabinet.id}#4`]?.material).toBe("melamine-white");
    expect(entryFromCabinet(doc, cabinet).top).toBe("rails");
    expect(addKitchenUnit(createReferencePlate(), entry("base-bas-2-portes-800")).cabinet.top).toBeUndefined();
  });

  it("se pose à droite du caisson choisi, à la première place libre, son fond sur le même plan", () => {
    let doc = createReferencePlate();
    doc = addKitchenUnit(doc, entry("base-bas-1-porte-600")).doc;
    const first = cabinets(doc)[0]!;
    doc = addKitchenUnit(doc, entry("base-bas-3-tiroirs-400"), first.id).doc;
    expect(cabinets(doc)[1]!.origin).toEqual([600, -580, 0]);
    // Beside the first again: the place is taken, it goes past the second.
    const third = addKitchenUnit(doc, entry("base-bas-2-portes-800"), first.id);
    expect(third.cabinet.origin).toEqual([1000, -580, 0]);
    expect(third.cabinet.name).toBe("Bas 2 portes 800");
    expect(third.fronts?.layout).toBe("doors");
  });

  it("un haut se pose au-dessus du bas choisi, fond contre le même mur ; une colonne four n'a pas de façades", () => {
    const base = addKitchenUnit(createReferencePlate(), entry("base-bas-1-porte-600"));
    const wall = addKitchenUnit(base.doc, entry("wall-haut-1-porte-600"), base.cabinet.id);
    expect(wall.cabinet).toMatchObject({ origin: [0, -350, 1450], height: 700, depth: 350, plinth: 0 });
    expect(cabinetBox(wall.cabinet)[1][1]).toBe(cabinetBox(base.cabinet)[1][1]);
    const hood = addKitchenUnit(wall.doc, entry("wall-haut-sur-hotte-600"), wall.cabinet.id);
    expect(hood.cabinet.origin).toEqual([600, -350, 1800]);
    expect(addKitchenUnit(hood.doc, entry("tall-colonne-four-600")).fronts).toBeNull();
  });

  it("construit comme son voisin : épaisseurs, standard, façades, matières ; tourné comme lui", () => {
    const anchor: CabinetFeature = {
      id: "cb1", type: "cabinet", name: "Bas B1", origin: [580, 0, 0], rotation: 90, width: 600, height: 870, depth: 580,
      thickness: 19, back: "inset", backThickness: 8, shelves: 1, plinth: 150, construction: "top-bottom-through", standard: "melamine-19",
    };
    const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "inset", gap: 2, thickness: 22, hinges: true, handles: false };
    const doc: CadDocument = { ...createReferencePlate(), features: [anchor, fronts], bodyInfo: { "fr1#0": { material: "solid-oak" }, "cb1#0": { material: "birch-plywood" } } };
    const next = addKitchenUnit(doc, entry("base-bas-1-porte-450"), "cb1");
    expect(next.cabinet).toMatchObject({ origin: [580, 600, 0], rotation: 90, thickness: 19, back: "inset", backThickness: 8, construction: "top-bottom-through", standard: "melamine-19" });
    expect(next.fronts).toMatchObject({ mount: "inset", gap: 2, thickness: 22, handles: false });
    expect(next.doc.bodyInfo?.[`${next.fronts!.id}#0`]?.material).toBe("solid-oak");
    expect(next.doc.bodyInfo?.[`${next.cabinet.id}#0`]?.material).toBe("birch-plywood");
  });

  it("glisse au millimètre sans changer de hauteur ; tourne d'un quart sur place", () => {
    const c = addKitchenUnit(createReferencePlate(), entry("base-bas-1-porte-600")).cabinet;
    expect(slideCabinet(c, [120.4, -3.6, 50]).origin).toEqual([120, -584, 0]);
    const middle = (b: ReturnType<typeof cabinetBox>) => [0, 1].map((i) => (b[0][i]! + b[1][i]!) / 2);
    const turned = turnCabinet(c);
    expect(turned.rotation).toBe(90);
    expect(middle(cabinetBox(turned))).toEqual(middle(cabinetBox(c)));
    // Four quarters: back where it was.
    expect(turnCabinet(turnCabinet(turnCabinet(turned)))).toMatchObject({ origin: c.origin, rotation: 0 });
  });

  it("se colle à une face debout ou à un coin : côté contre côté fonds alignés, fond contre le mur, coin sur coin", () => {
    // A base unit 600 wide (fronts included: 579 deep), away from the run; rotation 0, its back towards +Y.
    const box: [[number, number, number], [number, number, number]] = [[-2000, -900, 0], [-1400, -321, 870]];
    const neighbour: [[number, number, number], [number, number, number]] = [[0, -579, 0], [600, 0, 870]];
    // The neighbour's left side (looking −X): the cabinet's right side on it, the backs in line.
    expect(stickDelta(box, 0, { kind: "face", point: [0, -300, 400], normal: [-1, 0, 0], other: neighbour })).toEqual([1400, 321, 0]);
    // Its right side (looking +X): the cabinet's left side on it.
    expect(stickDelta(box, 0, { kind: "face", point: [600, -100, 400], normal: [1, 0, 0], other: neighbour })).toEqual([2600, 321, 0]);
    // A wall looking −Y: the back on it, centred on the point clicked.
    expect(stickDelta(box, 0, { kind: "face", point: [1000, 0, 1200], normal: [0, -1, 0], other: [[0, 0, 0], [3000, 100, 2500]] })).toEqual([2700, 321, 0]);
    // A top: nothing (the cabinet keeps its height).
    expect(stickDelta(box, 0, { kind: "face", point: [300, -300, 870], normal: [0, 0, 1], other: neighbour })).toBeNull();
    // A corner: the nearest corner of the cabinet goes on it.
    expect(stickDelta(box, 0, { kind: "point", point: [0, 0, 870] })).toEqual([1400, 321, 0]);
  });

  it("mes meubles : décrits, vérifiés, posés à leurs cotes et sous leur nom", () => {
    expect(customEntry({ name: " ", kind: "base", width: 450, layout: "door", shelves: 1 })).toMatch(/nom/);
    expect(customEntry({ name: "Trop étroit", kind: "base", width: 30, layout: "door", shelves: 1 })).toMatch(/largeur/i);
    expect(customEntry({ name: "Tiroirs", kind: "base", width: 600, layout: "drawers", drawers: 12, shelves: 0 })).toMatch(/1 à 8/);
    const own = customEntry({ name: "Bas poubelle", kind: "base", width: 450, height: 900, depth: 600, plinth: 100, layout: "door", shelves: 0 });
    if (typeof own === "string") throw new Error(own);
    expect(own).toMatchObject({ custom: true, height: 900 });
    const { doc, cabinet, fronts } = addKitchenUnit(createReferencePlate(), own);
    expect(cabinet).toMatchObject({ name: "Bas poubelle", width: 450, height: 900, depth: 600, plinth: 100, origin: [0, -600, 0] });
    expect(fronts?.layout).toBe("door");
    // The same again: numbered.
    expect(addKitchenUnit(doc, own).cabinet.name).toBe("Bas poubelle (2)");
  });

  it("mes meubles : repris d'un caisson du projet avec ses façades", () => {
    const placed = addKitchenUnit(createReferencePlate(), entry("wall-haut-2-portes-900"));
    const e = entryFromCabinet(placed.doc, placed.cabinet);
    expect(e).toMatchObject({ kind: "wall", name: "Haut 2 portes 900", width: 900, height: 700, depth: 350, layout: "doors", custom: true });
  });
});

describe("caissons de casquette (sur-meubles)", () => {
  it("posés sur le meuble haut choisi, sa porte relevante, 60 cm de profondeur contre le mur ; le suivant à côté ; sur une colonne aussi", async () => {
    const { KINDS } = await import("../../frontend/src/document/kitchen-catalog");
    const top = KINDS.wall.z + KINDS.wall.height;
    const wall = addKitchenUnit(createReferencePlate(), entry("wall-haut-1-porte-600"));
    const cap = addKitchenUnit(wall.doc, entry("wall-casquette-relevante-600"), wall.cabinet.id);
    // 60 cm deep, its back against the wall unit's: it comes 25 cm further out.
    const out = (c: typeof wall.cabinet) => c.origin[1] - (600 - c.depth);
    expect(cap.cabinet).toMatchObject({ width: 600, height: 350, depth: 600, origin: [wall.cabinet.origin[0], out(wall.cabinet), top] });
    expect(cap.fronts).toMatchObject({ layout: "door", side: "top" });
    const next = addKitchenUnit(cap.doc, entry("wall-casquette-relevante-400"), cap.cabinet.id);
    expect(next.cabinet.origin).toEqual([600, out(wall.cabinet), top]);
    const column = addKitchenUnit(createReferencePlate(), entry("tall-colonne-rangement-600"));
    const over = addKitchenUnit(column.doc, entry("wall-casquette-sur-colonne-600"), column.cabinet.id);
    expect(over.cabinet).toMatchObject({ depth: 600, origin: [column.cabinet.origin[0], out(column.cabinet), top] });
  });

  it("sur un meuble haut d'une autre hauteur (celui d'un Plan de cuisine) : posée sur son dessus", () => {
    const wall = addKitchenUnit(createReferencePlate(), entry("wall-haut-1-porte-600"));
    const high = { ...wall.cabinet, origin: [0, 0, 1450] as [number, number, number], height: 900 };
    const doc = { ...wall.doc, features: wall.doc.features.map((f) => (f.id === high.id ? high : f)) };
    const cap = addKitchenUnit(doc, entry("wall-casquette-relevante-600"), high.id);
    expect(cap.cabinet.origin[2]).toBe(2350);
    expect(addKitchenUnit(cap.doc, entry("wall-casquette-relevante-400"), cap.cabinet.id).cabinet.origin).toEqual([600, -250, 2350]);
  });

  it("le Plan de cuisine ne les propose pas dans ses rangées : il a sa casquette en caissons", async () => {
    const { runModels } = await import("../../frontend/src/features/kitchen-run-items");
    expect(runModels().some((m) => m.name.startsWith("Casquette"))).toBe(false);
  });
});

describe("tiroirs de hauteurs différentes", () => {
  it("deux petits tiroirs sur un casserolier : leurs parts 1, 1, 2 ; sans parts justes, tous égaux", () => {
    expect(drawerHeights(700, 3, 3, [1, 1, 2])).toEqual([173.5, 173.5, 347]);
    expect(drawerHeights(700, 3, 3)).toEqual([694 / 3, 694 / 3, 694 / 3]);
    expect(drawerHeights(700, 3, 3, [1, 2])).toEqual([694 / 3, 694 / 3, 694 / 3]);
    expect(drawerHeights(700, 3, 3, [1, "a", 2] as unknown as number[])).toEqual([694 / 3, 694 / 3, 694 / 3]);
  });

  it("« Bas 2 tiroirs et casserolier » : trois tiroirs, leurs parts gardées sur ses façades", () => {
    const entry = CATALOG.find((e) => e.name === "Bas 2 tiroirs et casserolier" && e.width === 600)!;
    expect(entry).toMatchObject({ layout: "drawers", drawers: 3, drawerShares: [1, 1, 2] });
    const doc = addKitchenUnit(createReferencePlate(), entry).doc;
    const fronts = doc.features.find((f): f is FrontsFeature => f.type === "fronts")!;
    expect(fronts).toMatchObject({ layout: "drawers", drawers: 3, drawerShares: [1, 1, 2] });
    // The fronts themselves: the bottom one (the pan drawer) twice as high as each of the two over it.
    const cabinet = doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const heights = frontsParts(fronts, cabinet).filter((p) => p.name.startsWith("Façade tiroir")).map((p) => Math.round(p.to[2] - p.from[2]));
    expect(heights).toHaveLength(3);
    expect(heights[0]).toBe(heights[1]);
    expect(Math.abs(heights[2]! - 2 * heights[0]!)).toBeLessThanOrEqual(1);
  });
});

describe("deux tiroirs et un casserolier sous deux traverses", () => {
  it("pas de dessus : deux traverses de 9 cm reliant les côtés, l'avant couchée, l'arrière debout ; son fond gardé", () => {
    const entry = CATALOG.find((e) => e.name === "Bas 2 tiroirs et casserolier, traverses" && e.width === 600)!;
    expect(entry).toMatchObject({ layout: "drawers", drawers: 3, drawerShares: [1, 1, 2], top: "rails", railWidth: 90 });
    const { doc, cabinet } = addKitchenUnit(createReferencePlate(), entry);
    expect(cabinet).toMatchObject({ top: "rails", railWidth: 90 });
    const parts = cabinetParts(cabinet);
    expect(parts.some((p) => p.name === "Dessus")).toBe(false);
    const rails = parts.filter((p) => p.name.startsWith("Traverse"));
    expect(rails.map((p) => p.name)).toEqual(["Traverse avant", "Traverse arrière"]);
    expect(Math.round(rails[0]!.to[1] - rails[0]!.from[1])).toBe(90);
    expect(Math.round(rails[1]!.to[2] - rails[1]!.from[2])).toBe(90);
    expect(Math.round(rails[1]!.to[1] - rails[1]!.from[1])).toBe(18);
    expect(cabinet.back).toBe("applied");
    // The sink unit keeps its 10 cm rails.
    const sink = addKitchenUnit(createReferencePlate(), CATALOG.find((e) => e.name === "Bas évier" && e.width === 800)!).cabinet;
    expect(cabinetParts(sink).filter((p) => p.name.startsWith("Traverse")).map((p) => Math.round(Math.max(p.to[1] - p.from[1], p.to[2] - p.from[2])))).toEqual([100, 100]);
    expect(doc.features.some((f) => f.type === "fronts" && f.drawers === 3)).toBe(true);
  });
  it("dans le Plan de cuisine : ses traverses de 9 cm, et pas de découpe d'évier au-dessus de ses tiroirs", () => {
    const sinkOver = (model: string) => {
      const p = { ...KITCHEN_PLAN, model: "I" as const, lengthA: 2400, runs: { A: [newItem([], model, 800)] } };
      const layout = kitchenFromPlan(p);
      return { unit: layout.units.find((u) => u.name.startsWith(model === "base-bas-evier" ? "Bas évier" : "Bas 2 tiroirs"))!, holes: layout.boxes.flatMap((b) => b.holes ?? []) };
    };
    const drawers = sinkOver("base-bas-2-tiroirs-et-casserolier-traverses");
    expect(drawers.unit).toMatchObject({ top: "rails", railWidth: 90, layout: "drawers", drawers: 3 });
    expect(drawers.holes).toEqual([]);
    expect(sinkOver("base-bas-evier").holes.length).toBe(1);
  });
});

