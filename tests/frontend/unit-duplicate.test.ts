/** Dupliquer un meuble de cuisine dans la 3D : sur son linéaire quand le plan l'a fait, sinon à côté de lui. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type KitchenRunItem, type RoomFeature } from "../../frontend/src/document/types";
import { withCabinetDuplicated } from "../../frontend/src/document/unit-duplicate";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const cabinets = (doc: CadDocument) => doc.features.filter((f): f is CabinetFeature => f.type === "cabinet");

describe("dupliquer un meuble de cuisine", () => {
  it("sur son linéaire : le même juste après lui, avec ses cotes à lui ; refusé quand il n'y a plus la place", () => {
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-2-portes", 800], ["base-bas-3-tiroirs", 600]] as const) items = [...items, newItem(items, model, width)];
    items = items.map((i, k) => (k === 0 ? { ...i, depth: 500 } : i));
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: items } });
    if (typeof built === "string") throw new Error(built);
    const doors = cabinets(built.doc).find((c) => c.name.startsWith("Bas 2 portes"))!;
    const copy = withCabinetDuplicated(built.doc, doors.id);
    if (typeof copy === "string") throw new Error(copy);
    expect(() => parseDocument(copy.doc)).not.toThrow();
    const run = kitchenPlanIn(copy.doc, made.id)!.runs!.A!;
    expect(run.map((i) => [i.model, i.width, i.depth])).toEqual([["base-bas-2-portes", 800, 500], ["base-bas-2-portes", 800, 500], ["base-bas-3-tiroirs", 600, undefined]]);
    expect(new Set(run.map((i) => i.id)).size).toBe(3);
    const twin = cabinets(copy.doc).find((c) => c.id === copy.cabinet)!;
    expect([twin.width, twin.depth, twin.origin[0]]).toEqual([800, 500, 800]);
    expect(copy.note).toMatch(/dupliqué sur son linéaire/);
    // 800 + 800 + 600 = 2200 of 2400: no room for a third.
    expect(withCabinetDuplicated(copy.doc, twin.id)).toMatch(/Pas de place pour un autre « Bas 2 portes » de 80 cm sur ce linéaire : il reste 20 cm au plus/);
    expect(withCabinetDuplicated(built.doc, "nothing")).toMatch(/Sélectionnez d'abord un caisson/);
  });

  it("posé à part : sa copie à sa droite, avec ses façades et ses matières", () => {
    // A unit and its fronts as the catalogue makes them, on their own (no plan).
    const made = withKitchenPlan({ ...createReferencePlate(), features: [] }, { ...KITCHEN_PLAN, model: "I", lengthA: 2400 });
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [newItem([], "base-bas-2-portes", 800)] } });
    if (typeof built === "string") throw new Error(built);
    const cabinet: CabinetFeature = { ...cabinets(built.doc)[0]!, id: "cb1", name: "Bas 2 portes", origin: [100, 0, 0], rotation: 0 };
    const fronts: FrontsFeature = { ...built.doc.features.find((f): f is FrontsFeature => f.type === "fronts")!, id: "fr1", cabinet: "cb1" };
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts], bodyInfo: { [`cb1${PART_SEPARATOR}0`]: { material: "solid-oak" }, [`fr1${PART_SEPARATOR}1`]: { material: "walnut" } } };
    const copy = withCabinetDuplicated(doc, "cb1");
    if (typeof copy === "string") throw new Error(copy);
    expect(() => parseDocument(copy.doc)).not.toThrow();
    const twin = copy.doc.features.find((f) => f.id === copy.cabinet) as CabinetFeature;
    expect(twin).toMatchObject({ origin: [900, 0, 0], width: 800 });
    expect(twin.name).not.toBe("Bas 2 portes");
    const doors = copy.doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === twin.id);
    expect(doors).toHaveLength(1);
    expect(copy.doc.bodyInfo?.[`${twin.id}${PART_SEPARATOR}0`]?.material).toBe("solid-oak");
    expect(copy.doc.bodyInfo?.[`${doors[0]!.id}${PART_SEPARATOR}1`]?.material).toBe("walnut");
    // Turned a quarter: its right is along Y.
    const turned = withCabinetDuplicated({ ...doc, features: [{ ...cabinet, rotation: 90 }, fronts] }, "cb1");
    if (typeof turned === "string") throw new Error(turned);
    expect((turned.doc.features.find((f) => f.id === turned.cabinet) as CabinetFeature).origin).toEqual([100, 800, 0]);
  });

  describe("posé à part, un voisin dans le chemin", () => {
    const col = (id: string, x: number, width = 600): CabinetFeature => ({ id, type: "cabinet", name: `Colonne ${id}`, origin: [x, -600, 0], rotation: 0, width, height: 2400, depth: 600, thickness: 18, back: "applied", backThickness: 3, shelves: 4, plinth: 100, construction: "sides-through" });
    const room: RoomFeature = { id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200, walls: [3600, 2500, 3600, 2500].map((length) => ({ length, angle: 90 })), obstacles: [] };
    const xs = (doc: CadDocument) => Object.fromEntries(doc.features.filter((f): f is CabinetFeature => f.type === "cabinet").map((f) => [f.id, f.origin[0]]));
    const dup = (doc: CadDocument, id = "cb1") => {
      const r = withCabinetDuplicated(doc, id);
      if (typeof r === "string") throw new Error(r);
      return { ...r, x: (r.doc.features.find((f) => f.id === r.cabinet) as CabinetFeature).origin[0] };
    };

    it("la copie se pose juste à côté ; le voisin collé est poussé de sa largeur, le suivant d'autant moins que l'écart était grand", () => {
      const r = dup({ ...createReferencePlate(), features: [col("cb1", 0), col("cb2", 600), col("cb3", 1300)] });
      expect(r.x).toBe(600);
      expect(xs(r.doc)).toMatchObject({ cb1: 0, cb2: 1200, cb3: 1800 });
      expect(r.note).toMatch(/poussés de 60 cm/);
    });

    it("un voisin loin n'est pas poussé : l'écart le garde", () => {
      const r = dup({ ...createReferencePlate(), features: [col("cb1", 0), col("cb2", 1500)] });
      expect([r.x, xs(r.doc).cb2]).toEqual([600, 1500]);
    });

    it("dans une pièce : poussé contre le mur de droite, impossible — la copie va à gauche, en poussant de ce côté s'il le faut", () => {
      const doc: CadDocument = { ...createReferencePlate(), features: [room, col("cb1", 2400), col("cb2", 3000), col("cb0", 1200)] };
      const r = dup(doc);
      expect(r.x).toBe(1800);
      expect(xs(r.doc)).toMatchObject({ cb1: 2400, cb2: 3000, cb0: 1200 });
      // Left neighbour flush against it: pushed left, the copy takes its place.
      const tight = dup({ ...doc, features: [room, col("cb1", 2400), col("cb2", 3000), col("cb0", 1800)] });
      expect(tight.x).toBe(1800);
      expect(xs(tight.doc).cb0).toBe(1200);
    });

    it("serré entre deux murs sans place : refusé, avec ce qu'il faut faire", () => {
      const full = { ...createReferencePlate(), features: [room, ...[0, 600, 1200, 1800, 2400, 3000].map((x, i) => col(`cb${i + 1}`, x))] };
      expect(withCabinetDuplicated(full, "cb3")).toMatch(/Pas de place à côté/);
    });
  });
});

