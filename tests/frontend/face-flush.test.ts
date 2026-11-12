/**
 * Aligner, face sur face : la face posée glisse dans le plan de l'autre pour que ses bords affleurent ceux de l'autre,
 * au coin le plus proche du clic — deux faces de même taille se posent exactement l'une sur l'autre.
 */
import { describe, expect, it } from "vitest";
import { faceOnFace, flushSlide, matedPoint } from "../../frontend/src/features/face-mate";
import type { Vec3 } from "../../frontend/src/document/types";

const rect = (x0: number, y0: number, x1: number, y1: number, z: number) => {
  const corners: Vec3[] = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  return { corners, sides: corners.map((c, i) => [c, corners[(i + 1) % 4]!] as [Vec3, Vec3]) };
};

describe("bords affleurés au coin cliqué", () => {
  it("deux faces de même taille : la planche du dessus se pose exactement sur celle du dessous, où que l'on clique", () => {
    const top = rect(0, 0, 100, 50, 100);
    const below = rect(10, 5, 110, 55, 20);
    // Clicked off the middle (as « au point cliqué » did, which left the boards shifted).
    const mate = faceOnFace({ point: [50, 25, 100], normal: [0, 0, -1] }, { point: [60, 30, 20], normal: [0, 0, 1] });
    for (const clicked of [[12, 7, 20], [105, 50, 20], [80, 10, 20]] as Vec3[]) {
      const slide = flushSlide(mate, top.corners, { normal: [0, 0, 1], ...below, clicked });
      const placed = top.corners.map((p) => matedPoint({ ...mate, translate: mate.translate.map((c, i) => c + slide[i]!) as Vec3 }, p));
      expect(placed.map((p) => p.map((c) => Math.round(c * 1000) / 1000))).toEqual(below.corners);
    }
  });

  it("une face plus petite : ses deux bords affleurent ceux de l'autre au coin le plus proche du clic", () => {
    const small = rect(0, 0, 100, 50, 100);
    const big = rect(0, 0, 200, 100, 20);
    const mate = faceOnFace({ point: [50, 25, 100], normal: [0, 0, -1] }, { point: [100, 50, 20], normal: [0, 0, 1] });
    const at = (clicked: Vec3) => {
      const slide = flushSlide(mate, small.corners, { normal: [0, 0, 1], ...big, clicked });
      return small.corners.map((p) => matedPoint({ ...mate, translate: mate.translate.map((c, i) => c + slide[i]!) as Vec3 }, p));
    };
    const corner = (pts: Vec3[], pick: (p: Vec3) => number) => pts.reduce((a, b) => (pick(b) > pick(a) ? b : a));
    expect(corner(at([190, 95, 20]), (p) => p[0] + p[1]).map(Math.round)).toEqual([200, 100, 20]);
    expect(corner(at([5, 5, 20]), (p) => -p[0] - p[1]).map(Math.round)).toEqual([0, 0, 20]);
  });

  it("une face sans côté droit (un cercle) : rien ne glisse", () => {
    const mate = faceOnFace({ point: [0, 0, 10], normal: [0, 0, -1] }, { point: [0, 0, 0], normal: [0, 0, 1] });
    expect(flushSlide(mate, [[1, 1, 10]], { normal: [0, 0, 1], corners: [[0, 0, 0]], sides: [], clicked: [0, 0, 0] })).toEqual([0, 0, 0]);
  });
});
