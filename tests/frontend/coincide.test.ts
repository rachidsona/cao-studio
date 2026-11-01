/** Coïncidence dans le modèle : un point vient sur un point, ou sur un trait, au plus près ou là où on a cliqué. */
import { describe, expect, it } from "vitest";
import { closestOnPolyline, closestOnSegment, coincideMove, fitInNiche, segmentNearRay, snugAxes, wallsAround } from "../../frontend/src/features/coincide";

describe("coïncidence d'un point sur un point ou un trait", () => {
  it("sur un point : le déplacement de l'un à l'autre", () => {
    expect(coincideMove([10, 0, 0], { point: [10, 20, 5] })).toEqual([0, 20, 5]);
  });

  it("sur un trait : au plus près, sans dépasser ses bouts", () => {
    expect(closestOnSegment([5, 7, 0], [0, 0, 0], [10, 0, 0])).toEqual([5, 0, 0]);
    expect(closestOnSegment([15, 7, 0], [0, 0, 0], [10, 0, 0])).toEqual([10, 0, 0]);
    expect(coincideMove([4, 30, 0], { trait: [[0, 0, 0], [100, 0, 0]] })).toEqual([0, -30, 0]);
  });

  it("une arête courbe (des segments par paires) et le point cliqué sur le trait", () => {
    const pairs: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 0, 0], [10, 10, 0]];
    expect(closestOnPolyline([20, 5, 0], pairs, true)).toEqual([10, 5, 0]);
    expect(coincideMove([0, 0, 50], { trait: pairs, pairs: true, clicked: [10, 2, 0] })).toEqual([10, 2, -50]);
  });

  it("une face plane : au plus près, droit sur son plan ; ou à l'endroit cliqué", () => {
    // The top face of a body at z = 720 (normal +Z), clicked at (300, 200).
    const face = { plane: [300, 200, 720] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
    expect(coincideMove([50, 60, 18], face)).toEqual([0, 0, 702]);
    expect(coincideMove([50, 60, 18], { ...face, clicked: [300, 200, 720] })).toEqual([250, 140, 702]);
    // A side face (normal −X) at x = 400: only x changes.
    expect(coincideMove([10, 20, 30], { plane: [400, 0, 0], normal: [-1, 0, 0] })).toEqual([390, 0, 0]);
  });

  it("le pointeur rencontre un trait : le point du trait le plus proche du rayon", () => {
    // A ray looking down −Z at x = 3, a trait along X at z = 0.
    expect(segmentNearRay([3, 0, 100], [0, 0, -1], [0, 0, 0], [10, 0, 0])).toEqual([3, 0, 0]);
  });

  it("une étagère calée entre ses côtés s'ajuste à une niche plus large, avec les mêmes jeux", () => {
    type B = [[number, number, number], [number, number, number]];
    // Sides 18 mm thick; a 400-wide niche (18–418) and a 600-wide one (436–1036); a back panel behind; a shelf 1 mm
    // short of each side in the small niche.
    const sides: B[] = [[[0, 0, 0], [18, 500, 2000]], [[418, 0, 0], [436, 500, 2000]], [[1036, 0, 0], [1054, 500, 2000]]];
    const back: B = [[0, 500, 0], [1054, 510, 2000]];
    const shelf: B = [[19, 20, 800], [417, 500, 818]];
    const others = [...sides, back];
    expect(wallsAround(shelf, others, 0)).toEqual([18, 418]);
    // Held along X (1 mm each side), not along Y (open at the front) nor Z.
    const snug = snugAxes(shelf, others);
    expect(snug).toEqual([{ axis: 0, gaps: [1, 1] }]);
    // Moved into the wide niche, 30 mm higher: from 437 to 1035.
    const moved: B = [[437, 20, 830], [835, 500, 848]];
    expect(fitInNiche(moved, others, snug)).toEqual([{ axis: 0, from: [437, 835], to: [437, 1035] }]);
    // Into a narrower one: shorter.
    const narrow: B[] = [[[0, 0, 0], [18, 500, 2000]], [[318, 0, 0], [336, 500, 2000]]];
    expect(fitInNiche([[10, 20, 800], [408, 500, 818]], narrow, snug)).toEqual([{ axis: 0, from: [10, 408], to: [19, 317] }]);
    // Where it already fits, nothing changes.
    expect(fitInNiche(shelf, others, snug)).toEqual([]);
  });
});
