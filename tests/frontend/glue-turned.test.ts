/**
 * Coller par face dans tous les sens : deux faces qui ne sont pas parallèles (le côté d'un haut contre le devant d'une
 * colonne) — ce qui bouge tourne pour que sa face regarde l'autre, puis vient la toucher, à un jeu près.
 */
import { describe, expect, it } from "vitest";
import { glueTurned, parallelFaces } from "../../frontend/src/features/face-glue";
import { matedPoint } from "../../frontend/src/features/face-mate";

describe("coller des faces qui ne sont pas parallèles", () => {
  it("parallèles (opposées ou de même sens) : un déplacement suffit ; d'équerre : non", () => {
    expect(parallelFaces({ point: [0, 0, 0], normal: [1, 0, 0] }, { point: [0, 0, 0], normal: [-1, 0, 0] })).toBe(true);
    expect(parallelFaces({ point: [0, 0, 0], normal: [0, -1, 0] }, { point: [0, 0, 0], normal: [0, -1, 0] })).toBe(true);
    expect(parallelFaces({ point: [0, 0, 0], normal: [1, 0, 0] }, { point: [0, 0, 0], normal: [0, -1, 0] })).toBe(false);
  });

  it("le côté droit d'un haut contre le devant d'une colonne : un quart de tour, puis au contact du devant", () => {
    const side = { point: [600, 175, 1800] as [number, number, number], normal: [1, 0, 0] as [number, number, number] };
    const front = { point: [1500, -10, 1200] as [number, number, number], normal: [0, -1, 0] as [number, number, number] };
    const mate = glueTurned(side, front);
    expect(mate.rotation?.angle).toBeCloseTo(90, 6);
    expect(Math.abs(mate.rotation!.dir[2])).toBeCloseTo(1, 6);
    // The side's centre comes into the plane of the front (y = -10), nothing else moved in that plane.
    const moved = matedPoint(mate, side.point);
    expect(moved.map((c) => Math.round(c * 1000) / 1000)).toEqual([600, -10, 1800]);
    // Its normal now looks against the front's: +Y.
    const tip = matedPoint(mate, [side.point[0] + 1, side.point[1], side.point[2]]);
    expect([tip[0] - moved[0], tip[1] - moved[1], tip[2] - moved[2]].map((c) => Math.round(c * 1e6) / 1e6)).toEqual([0, 1, 0]);
  });

  it("un jeu les écarte, le long de la normale de la face d'arrivée", () => {
    const mate = glueTurned({ point: [0, 0, 0], normal: [1, 0, 0] }, { point: [0, -100, 0], normal: [0, -1, 0] }, 3);
    expect(matedPoint(mate, [0, 0, 0]).map((c) => Math.round(c * 1000) / 1000)).toEqual([0, -103, 0]);
  });
});
