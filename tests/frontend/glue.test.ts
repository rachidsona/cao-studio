/** Coller un module de la bibliothèque contre une face d'un meuble. */
import { describe, expect, it } from "vitest";
import { boxAround, faceOf, glueShift, type Box } from "../../frontend/src/document/glue";

// A cabinet 600 wide (x 0…600), 560 deep (y 0…560, its back at y = 560), 720 high on 100 of feet (z 0…820).
const cabinet: Box = [[0, 0, 0], [600, 560, 820]];
// Its right side, looking to +x.
const right = { box: [[600, 0, 100], [600, 560, 820]] as Box, normal: [1, 0, 0] as [number, number, number] };
// A module 1200 wide somewhere else, 580 deep, 900 high.
const module: Box = [[2000, 1000, 50], [3200, 1580, 950]];

describe("coller un module contre une face", () => {
  it("contre le côté droit : à droite du meuble, en bas sur son bas, contre son dos", () => {
    const shift = glueShift(module, right, cabinet, [0, 1])!;
    const moved = module.map((p) => p.map((v, i) => v + shift[i]!));
    expect(moved).toEqual([[600, -20, 0], [1800, 560, 900]]);
  });

  it("contre le côté gauche : à gauche ; sans dos connu, sur le bord avant", () => {
    const left = { box: [[0, 0, 100], [0, 560, 820]] as Box, normal: [-1, 0, 0] as [number, number, number] };
    const shift = glueShift(module, left, cabinet)!;
    const moved = module.map((p) => p.map((v, i) => v + shift[i]!));
    expect(moved).toEqual([[-1200, 0, 0], [0, 580, 900]]);
  });

  it("sur le dessus : posé sur le meuble ; une face de biais ne colle pas", () => {
    const top = { box: [[0, 0, 820], [600, 560, 820]] as Box, normal: [0, 0, 1] as [number, number, number] };
    const shift = glueShift(module, top, cabinet, [0, 1])!;
    expect(module[0][2] + shift[2]).toBe(820);
    expect(module[1][1] + shift[1]).toBe(560);
    expect(glueShift(module, { box: right.box, normal: [0.7, 0.7, 0] }, cabinet)).toBeNull();
  });

  it("lit la face d'un maillage : sa boîte et sa normale", () => {
    // Two triangles of the plane x = 600, outward (+x), then another face.
    const mesh = {
      vertices: [600, 0, 100, 600, 560, 100, 600, 560, 820, 600, 0, 820, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3, 0, 1, 4],
      faceGroups: [{ start: 0, count: 6 }, { start: 6, count: 3 }],
    };
    const face = faceOf(mesh, 0)!;
    expect(face.box).toEqual([[600, 0, 100], [600, 560, 820]]);
    expect(face.normal.map((v) => Number(v.toFixed(6)))).toEqual([1, 0, 0]);
    expect(faceOf(mesh, 5)).toBeNull();
    expect(boxAround([cabinet, module])).toEqual([[0, 0, 0], [3200, 1580, 950]]);
  });
});
