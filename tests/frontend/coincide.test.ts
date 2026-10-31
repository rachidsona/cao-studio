/** Coïncidence dans le modèle : un point vient sur un point, ou sur un trait, au plus près ou là où on a cliqué. */
import { describe, expect, it } from "vitest";
import { closestOnPolyline, closestOnSegment, coincideMove, segmentNearRay } from "../../frontend/src/features/coincide";

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
});
