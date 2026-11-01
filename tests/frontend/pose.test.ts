/** Plan de pose : une feuille par mur, l'élévation de ce qui est posé contre lui, vue de la pièce. */
import { describe, expect, it } from "vitest";
import { againstWall, poseSheets, type PoseBody } from "../../frontend/src/drawing/pose";

const body = (id: string, name: string, lo: [number, number, number], hi: [number, number, number], wall = false): PoseBody => ({ id, name, box: [lo, hi], wall });

describe("plan de pose", () => {
  // Wall A along X (its face at Y = 0, the room at Y < 0), wall B along Y (face X = 0); two units on A, one on B.
  const bodies = [
    body("wa", "Mur A", [-100, 0, 0], [3000, 100, 2500], true),
    body("wb", "Mur B", [-100, -2400, 0], [0, 0, 2500], true),
    body("a1", "Bas A1", [600, -560, 0], [1200, 0, 870]),
    body("a2", "Haut A1", [600, -350, 1450], [1200, 0, 2150]),
    body("b1", "Bas B1", [0, -1800, 0], [560, -1200, 870]),
    body("far", "Îlot", [1000, -2200, 0], [2200, -1640, 870]),
  ];

  it("trouve ce qui est contre chaque mur, et de quel côté", () => {
    const a = againstWall(bodies[0]!, bodies)!;
    expect([a.axis, a.side]).toEqual([1, -1]);
    expect(a.bodies.map((b) => b.id)).toEqual(["a1", "a2"]);
    const b = againstWall(bodies[1]!, bodies)!;
    expect([b.axis, b.side, b.bodies.map((x) => x.id)]).toEqual([0, 1, ["b1"]]);
  });

  it("une feuille par mur : l'élévation vue de la pièce, le reste caché", () => {
    const sheets = poseSheets([], "Cuisine", bodies);
    expect(sheets.map((s) => s.name)).toEqual(["Pose — Mur A", "Pose — Mur B"]);
    const view = sheets[0]!.views[0]!;
    // Looking at wall A from the room (from −Y): the viewer on −Y, X to the right.
    expect(view.spec.toViewer).toEqual([0, -1, 0]);
    expect(view.spec.right).toEqual([1, 0, 0]);
    expect(view.hiddenBodies).toEqual(["wb", "b1", "far"]);
    expect(view.scale).toBe(20);
    expect(sheets[1]!.id).not.toBe(sheets[0]!.id);
  });
});
