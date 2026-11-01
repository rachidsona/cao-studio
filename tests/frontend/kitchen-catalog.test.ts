/** Meubles de cuisine pris dans la liste : posés à côté du caisson choisi, construits comme lui ; glissés, tournés. */
import { describe, expect, it } from "vitest";
import { CATALOG, addKitchenUnit, cabinetBox, slideCabinet, turnCabinet } from "../../frontend/src/document/kitchen-catalog";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";

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
    expect(cabinet).toMatchObject({ name: "Bas 1 porte 600", origin: [0, -560, 0], width: 600, height: 870, depth: 560, plinth: 150, shelves: 1 });
    expect(fronts).toMatchObject({ cabinet: cabinet.id, layout: "door" });
    expect(doc.bodyInfo?.[`${fronts!.id}#0`]?.material).toBe("lacquer-white");
    expect(doc.bodyInfo?.[`${cabinet.id}#0`]?.material).toBe("melamine-white");
  });

  it("se pose à droite du caisson choisi, à la première place libre, son fond sur le même plan", () => {
    let doc = createReferencePlate();
    doc = addKitchenUnit(doc, entry("base-bas-1-porte-600")).doc;
    const first = cabinets(doc)[0]!;
    doc = addKitchenUnit(doc, entry("base-bas-3-tiroirs-400"), first.id).doc;
    expect(cabinets(doc)[1]!.origin).toEqual([600, -560, 0]);
    // Beside the first again: the place is taken, it goes past the second.
    const third = addKitchenUnit(doc, entry("base-bas-2-portes-800"), first.id);
    expect(third.cabinet.origin).toEqual([1000, -560, 0]);
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
      id: "cb1", type: "cabinet", name: "Bas B1", origin: [560, 0, 0], rotation: 90, width: 600, height: 870, depth: 560,
      thickness: 19, back: "inset", backThickness: 8, shelves: 1, plinth: 150, construction: "top-bottom-through", standard: "melamine-19",
    };
    const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "inset", gap: 2, thickness: 22, hinges: true, handles: false };
    const doc: CadDocument = { ...createReferencePlate(), features: [anchor, fronts], bodyInfo: { "fr1#0": { material: "solid-oak" }, "cb1#0": { material: "birch-plywood" } } };
    const next = addKitchenUnit(doc, entry("base-bas-1-porte-450"), "cb1");
    expect(next.cabinet).toMatchObject({ origin: [560, 600, 0], rotation: 90, thickness: 19, back: "inset", backThickness: 8, construction: "top-bottom-through", standard: "melamine-19" });
    expect(next.fronts).toMatchObject({ mount: "inset", gap: 2, thickness: 22, handles: false });
    expect(next.doc.bodyInfo?.[`${next.fronts!.id}#0`]?.material).toBe("solid-oak");
    expect(next.doc.bodyInfo?.[`${next.cabinet.id}#0`]?.material).toBe("birch-plywood");
  });

  it("glisse au millimètre sans changer de hauteur ; tourne d'un quart sur place", () => {
    const c = addKitchenUnit(createReferencePlate(), entry("base-bas-1-porte-600")).cabinet;
    expect(slideCabinet(c, [120.4, -3.6, 50]).origin).toEqual([120, -564, 0]);
    const middle = (b: ReturnType<typeof cabinetBox>) => [0, 1].map((i) => (b[0][i]! + b[1][i]!) / 2);
    const turned = turnCabinet(c);
    expect(turned.rotation).toBe(90);
    expect(middle(cabinetBox(turned))).toEqual(middle(cabinetBox(c)));
    // Four quarters: back where it was.
    expect(turnCabinet(turnCabinet(turnCabinet(turned)))).toMatchObject({ origin: c.origin, rotation: 0 });
  });
});
