/** Magie extrusion, les formes de l'esquisse : le point placé par les mesures tapées, et l'accrochage sur la grille. */
import { describe, expect, it } from "vitest";
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
