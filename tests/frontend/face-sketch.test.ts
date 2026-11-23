/** Magie extrusion, les formes de l'esquisse : le point placé par les mesures tapées, et l'accrochage sur la grille. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver } from "../../frontend/src/constraints/solver";
import { typedPoint } from "../../frontend/src/app/face-sketch-tool";
import { groundSnap } from "../../frontend/src/app/magic-extrude";

const mm = (v: number) => v * 10; // cm typed

describe("les mesures tapées d'une forme", () => {
  it("rectangle par le centre et ovale : « largeur;hauteur » donnent le coin, du côté du pointeur", () => {
    expect(typedPoint("rectangle-center", [[0, 0]], [50, -20], [60, 40], mm)).toEqual([300, -200]);
    expect(typedPoint("oval", [[0, 0]], [-5, 5], [30], mm)).toEqual([-150, 150]);
  });

  it("une distance vers le pointeur ; « distance;angle » ; l'angle d'un arc ; la largeur d'un oblong", () => {
    expect(typedPoint("polygon", [[0, 0]], [3, 4], [50], mm)).toEqual([300, 400]);
    const [x, y] = typedPoint("circle-3pt", [[0, 0]], [9, 9], [10, 90], mm)!;
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(100, 9);
    const end = typedPoint("arc", [[0, 0], [100, 0]], [0, 0], [90], mm)!;
    expect(end[0]).toBeCloseTo(0, 9);
    expect(end[1]).toBeCloseTo(100, 9);
    expect(typedPoint("slot", [[0, 0], [400, 0]], [200, -50], [8], mm)).toEqual([400, -40]);
    expect(typedPoint("rectangle-3pt", [[0, 0], [400, 0]], [200, 50], [30], mm)).toEqual([400, 300]);
  });
});

describe("l'accrochage sur la grille", () => {
  it("sur les axes à portée, sinon au pas de la grille ; un point tenu par un aimant reste", () => {
    expect(groundSnap({ point: [3, 247], kind: "free" }, 10, 5)).toEqual({ point: [0, 250], kind: "corner" });
    expect(groundSnap({ point: [123, -4], kind: "free" }, 10, 5)).toEqual({ point: [120, 0], kind: "corner" });
    expect(groundSnap({ point: [123, 77], kind: "free" }, 10, 5)).toEqual({ point: [120, 80], kind: "free" });
    expect(groundSnap({ point: [1, 1], kind: "corner" }, 10, 5)).toEqual({ point: [1, 1], kind: "corner" });
  });
});

describe("les cotes fixes des mesures tapées", () => {
  beforeAll(() => initSolver());
  const empty = () => ({ points: [], curves: [], constraints: [] });
  const dims = (g: { constraints: { kind: string; value?: number }[] }) => g.constraints.filter((c) => c.value !== undefined).map((c) => [c.kind, Math.round(c.value!)]);

  it("rectangle par le centre : sa largeur et sa hauteur ; cercle par 2 points : son diamètre", async () => {
    const { DrawingTool } = await import("../../frontend/src/sketcher/tools");
    const { typedDimensions } = await import("../../frontend/src/app/face-sketch-tool");
    const rect = new DrawingTool("rectangle-center");
    rect.click(empty(), { pos: [0, 0] });
    const r = rect.click(empty(), { pos: [300, 200] });
    if (r.kind !== "commit") throw new Error("pas de rectangle");
    expect(dims(typedDimensions(r.geometry, "rectangle-center", [[0, 0], [300, 200]], [{ at: 1, values: [600, 400] }], r.created))).toEqual([["length", 600], ["length", 400]]);
    const circle = new DrawingTool("circle-2pt");
    circle.click(empty(), { pos: [0, 0] });
    const c = circle.click(empty(), { pos: [80, 0] });
    if (c.kind !== "commit") throw new Error("pas de cercle");
    expect(dims(typedDimensions(c.geometry, "circle-2pt", [[0, 0], [80, 0]], [{ at: 1, values: [80] }], c.created))).toEqual([["diameter", 80]]);
  });

  it("polygone : la distance du centre au sommet ; rien de tapé, aucune cote", async () => {
    const { DrawingTool } = await import("../../frontend/src/sketcher/tools");
    const { typedDimensions } = await import("../../frontend/src/app/face-sketch-tool");
    const poly = new DrawingTool("polygon");
    poly.click(empty(), { pos: [0, 0] });
    const p = poly.click(empty(), { pos: [0, 250] });
    if (p.kind !== "commit") throw new Error("pas de polygone");
    expect(dims(typedDimensions(p.geometry, "polygon", [[0, 0], [0, 250]], [{ at: 1, values: [250] }], p.created))).toEqual([["distance", 250]]);
    expect(dims(typedDimensions(p.geometry, "polygon", [[0, 0], [0, 250]], [], p.created))).toEqual([]);
  });
});
