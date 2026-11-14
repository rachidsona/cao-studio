/** Inventaire du client : ce qu'il faut ranger, ce que le dressing dessiné offre, ce qui manque et les modules à ajouter. */
import { describe, expect, it } from "vitest";
import { withFurniture } from "../../frontend/src/document/furniture-build";
import { furnitureModel } from "../../frontend/src/document/furniture-models";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { wardrobeHave } from "../../frontend/src/document/wardrobe-have";
import { compare, EMPTY_WARDROBE, needs } from "../../frontend/src/document/wardrobe-inventory";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

describe("inventaire du client", () => {
  it("compte la tringle, les tablettes et les tiroirs que demande la garde-robe", () => {
    expect(needs({ ...EMPTY_WARDROBE, shirts: 20, jackets: 5, trousers: 10, dresses: 6, coats: 3, knits: 25, shoes: 12, drawers: 4 })).toEqual({
      shortRod: 20 * 30 + 5 * 60 + 10 * 30,
      longRod: 6 * 40 + 3 * 80,
      shelves: 5 * 350 + 12 * 200,
      drawers: 4,
    });
  });

  it("dit ce qui manque, avec 10 % de marge, et les modules qui le donnent", () => {
    const { gaps, width } = compare({ shortRod: 1200, longRod: 480, shelves: 4150, drawers: 4 }, { shortRod: 860, longRod: 860, shelves: 0, drawers: 0 });
    const by = Object.fromEntries(gaps.map((g) => [g.what, g]));
    expect(by.shortRod).toMatchObject({ need: 1320, missing: 460, module: { kind: "double", count: 1, width: 900 } });
    expect(by.longRod).toMatchObject({ missing: 0 });
    expect(by.shelves!.module).toMatchObject({ kind: "shelves", count: 2, width: 1200 });
    expect(by.drawers!.module).toMatchObject({ kind: "drawers", count: 1, width: 700 });
    expect(width).toBe(900 + 1200 + 700);
  });

  it("lit ce que le dressing offre : une tringle longue, les étagères et les tiroirs d'une bibliothèque", () => {
    const input: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "R", input, [0, 0], 500)] }, "of1");
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "E", plane: "XZ", offset: 0, ...rebuilt.geometry };
    const rod: NicheFeature = { id: "pd1", type: "niche", name: "Penderie 1", sketch: "sk1", partition: "of1", niche: [0], fill: "rod", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true };
    const base: CadDocument = { ...createReferencePlate(), features: [sketch, rod] };
    const have = wardrobeHave(base);
    expect(have.longRod).toBeGreaterThan(400);
    expect(have.shortRod).toBe(0);
    const m = furnitureModel("bookcase");
    const made = withFurniture(base, { kind: "bookcase", ...m.size, thickness: 18, option: "drawers" }, [2000, -300, 0], "melamine-white");
    if (typeof made === "string") throw new Error(made);
    const more = wardrobeHave(made.doc);
    expect(more.shelves).toBeGreaterThan(1000);
    expect(more.drawers).toBeGreaterThanOrEqual(2);
  });
});
