/** « Le corps entier » de Déplacer : à quel meuble ou à quelle Répartition un élément appartient. */
import { describe, expect, it } from "vitest";
import { wholeOf } from "../../frontend/src/app/move-whole";
import { CATALOG, addKitchenUnit } from "../../frontend/src/document/kitchen-catalog";
import { createReferencePlate, type CadDocument, type NicheFeature } from "../../frontend/src/document/types";
import { cabinetPartNames } from "../../frontend/src/features/cabinet-parts";

const entry = (id: string) => CATALOG.find((e) => e.id === id)!;
const kitchen = () => {
  const { doc, cabinet, fronts } = addKitchenUnit(createReferencePlate(), entry("base-bas-2-portes-800"));
  const shown = [...cabinetPartNames(cabinet).map((_, i) => `${cabinet.id}#${i}`), `${fronts!.id}#0`, `${fronts!.id}#1`];
  return { doc, cabinet, fronts: fronts!, shown };
};

describe("le corps entier d'un élément", () => {
  it("une pièce d'un caisson : le caisson, avec ses façades", () => {
    const { doc, cabinet, shown } = kitchen();
    expect(wholeOf(doc, `${cabinet.id}#3`, shown)).toEqual({ kind: "cabinet", id: cabinet.id, name: cabinet.name, bodies: shown });
  });

  it("une porte : le caisson qui la porte", () => {
    const { doc, cabinet, fronts, shown } = kitchen();
    expect(wholeOf(doc, `${fronts.id}#0`, shown)).toMatchObject({ kind: "cabinet", id: cabinet.id });
  });

  it("une pièce déjà déplacée reste du même meuble", () => {
    const { doc, cabinet, shown } = kitchen();
    const moved: CadDocument = { ...doc, features: [...doc.features, { id: "mv1", type: "move", name: "Déplacement 1", target: `${cabinet.id}#3`, translate: [10, 0, 0] }] };
    expect(wholeOf(moved, "mv1", [...shown.filter((id) => id !== `${cabinet.id}#3`), "mv1"])).toMatchObject({ kind: "cabinet", id: cabinet.id });
  });

  it("deux caissons voisins restent deux meubles", () => {
    const first = kitchen();
    const { doc, cabinet } = addKitchenUnit(first.doc, entry("base-bas-1-porte-600"), first.cabinet.id);
    const shown = [...first.shown, `${cabinet.id}#0`, `${cabinet.id}#1`];
    expect(wholeOf(doc, `${cabinet.id}#0`, shown)!.bodies).toEqual([`${cabinet.id}#0`, `${cabinet.id}#1`]);
  });

  it("une pièce de Répartition : son esquisse, niches comprises", () => {
    const niche = { id: "ni1", type: "niche", name: "Portes", sketch: "sk1", partition: "of1", niche: [], fill: "doors" } as unknown as NicheFeature;
    const doc: CadDocument = {
      ...createReferencePlate(),
      features: [{ id: "sk1", type: "sketch", name: "Plan — mur a" } as never, { id: "ex2", type: "extrude", name: "Panneaux", sketch: "sk1" } as never, niche],
    };
    expect(wholeOf(doc, "ni1#0", ["ex2#0", "ex2#1", "ni1#0"])).toEqual({ kind: "sketch", id: "sk1", name: "Plan — mur a", bodies: ["ex2#0", "ex2#1", "ni1#0"] });
  });

  it("un élément seul n'a pas de corps entier à proposer", () => {
    const doc = createReferencePlate();
    expect(wholeOf(doc, "ex1", ["ex1"])).toBeNull();
  });
});
