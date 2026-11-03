/** « Mise en plan du caisson sélectionné » : le meuble d'une pièce choisie, et sa feuille seule. */
import { describe, expect, it } from "vitest";
import { cabinetSheet, cabinetSheetName, standardViews } from "../../frontend/src/app/drawing/standard-views";
import { pickedBodies } from "../../frontend/src/app/project-menu";
import { furnitureBodies, furnitureOf } from "../../frontend/src/document/cabinet-of";
import { DRESSING, dressingDocument } from "../../frontend/src/document/dressing-plan";
import type { SheetLayout } from "../../frontend/src/drawing/layout";
import { newSheet, type DrawingSheet } from "../../frontend/src/drawing/model";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type TrimFeature } from "../../frontend/src/document/types";

const cabinet = (id: string, name: string): CabinetFeature => ({ id, type: "cabinet", name, origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" });

function kitchen(): CadDocument {
  const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 0, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
  const trim: TrimFeature = { id: "tr1", type: "trim", name: "Finitions", parts: [{ name: "Plinthe", from: [0, 0, 0], to: [600, 16, 100] }], source: ["cb1#0"] };
  return { ...createReferencePlate(), features: [cabinet("cb1", "Bas 600"), fronts, trim, cabinet("cb2", "Haut 600")] };
}

describe("le meuble d'une pièce", () => {
  it("un caisson : sa carcasse, ses façades et ses finitions ; l'autre caisson à part", () => {
    const doc = kitchen();
    expect(furnitureOf(doc, "cb1#2")).toEqual({ key: "cabinet:cb1", name: "Bas 600" });
    expect(furnitureOf(doc, "fr1#0")?.key).toBe("cabinet:cb1");
    expect(furnitureOf(doc, "tr1#0")?.key).toBe("cabinet:cb1");
    expect(furnitureOf(doc, "cb2#0")?.key).toBe("cabinet:cb2");
    const displayed = ["cb1#0", "cb1#1", "fr1#0", "tr1#0", "cb2#0", "cb2#1"];
    expect(furnitureBodies(doc, displayed, ["fr1#0"])).toEqual({ key: "cabinet:cb1", name: "Bas 600", bodies: ["cb1#0", "cb1#1", "fr1#0", "tr1#0"] });
    expect(furnitureBodies(doc, displayed, ["nothing"])).toBeNull();
  });

  it("une Répartition : ses panneaux, ses étagères et l'équipement de ses niches ; pas les murs", () => {
    const { doc } = dressingDocument({ ...createReferencePlate(), features: [] }, { ...structuredClone(DRESSING), programs: { A: ["long", "drawers"], B: [], C: [] } });
    const sketch = doc.features.find((f) => f.type === "sketch" && f.name === "Dressing — mur A")!;
    const panel = doc.features.find((f) => f.type === "extrude" && f.name.startsWith("Côté"))!;
    const wall = doc.features.find((f) => f.type === "extrude" && f.name === "Mur A")!;
    const drawers = doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "drawers")!;
    expect(furnitureOf(doc, panel.id)).toEqual({ key: `corps:${sketch.id}`, name: "Dressing — mur A" });
    expect(furnitureOf(doc, `${drawers.id}#0`)?.key).toBe(`corps:${sketch.id}`);
    expect(furnitureOf(doc, wall.id)).toBeNull();
  });

  it("ce qui est choisi dans la vue donne ses corps : entiers, faces, arêtes, sommets", () => {
    const face = { bodyId: "b", faceIndex: 0 } as never;
    const edge = { bodyId: "c", edgeIndex: 1 } as never;
    expect(pickedBodies({ bodies: ["a"], faces: [face, face], edges: [edge], vertices: [], sketch: [], sketches: [] })).toEqual(["a", "b", "c"]);
  });
});

/** A layout that sees a box of 600 × 720 × 560 mm from every side. */
const layout = { geometry: () => ({ lines: [], circles: [], points: [], hatches: [], min: [0, 0], max: [600, 720] }) } as unknown as SheetLayout;

describe("la feuille du caisson", () => {
  it("est ajoutée à son nom, les autres corps laissés de côté, avec les quatre vues standard", () => {
    const first = standardViews(newSheet([], "Cuisine"), layout, 3);
    const sheets = cabinetSheet([first], { name: "Bas 600", sheetName: cabinetSheetName("Bas 600"), bodies: ["cb1#0", "fr1#0"] }, ["cb1#0", "fr1#0", "cb2#0"], layout, "Cuisine");
    expect(sheets).toHaveLength(2);
    const sheet = sheets[1]!;
    expect(sheet.name).toBe("Caisson — Bas 600");
    expect(sheet.title.title).toBe("Cuisine — Bas 600");
    expect(sheet.hiddenBodies).toEqual(["cb2#0"]);
    expect(sheet.views.map((v) => v.label)).toEqual(["Vue de face", "Vue de dessus", "Vue de gauche", "Vue isométrique"]);
    expect(sheet.id).not.toBe(first.id);
  });

  it("rouverte, la même feuille est mise à jour et garde ses cotes", () => {
    const focus = { name: "Bas 600", sheetName: cabinetSheetName("Bas 600"), bodies: ["cb1#0"] };
    const made = cabinetSheet([], focus, ["cb1#0", "cb2#0"], layout, "Cuisine");
    const noted: DrawingSheet[] = [{ ...made[0]!, annotations: [{ id: "note1", kind: "text", at: [20, 20], text: "Chant 1 mm", size: 3 }] }];
    const again = cabinetSheet(noted, focus, ["cb1#0", "cb2#0", "cb3#0"], layout, "Cuisine");
    expect(again).toHaveLength(1);
    expect(again[0]!.hiddenBodies).toEqual(["cb2#0", "cb3#0"]);
    expect(again[0]!.annotations).toHaveLength(1);
    expect(again[0]!.views).toHaveLength(4);
  });
});
