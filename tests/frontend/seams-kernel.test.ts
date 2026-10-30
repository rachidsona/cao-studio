/** Coutures d'une planche, avec le vrai noyau : un contour dont le bord du haut est en trois morceaux. */
import { draw, makeBox, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { seamEdges } from "../../frontend/src/geometry/seams";
import { setupKernel } from "./kernel-setup";

describe("arêtes entre deux faces d'un même plan", () => {
  beforeAll(setupKernel, 60_000);

  it("une boîte n'a pas de couture", () => {
    expect(seamEdges(makeBox([0, 0, 0], [100, 50, 20]))).toEqual([]);
  });

  it("le dessus coupé en trois donne deux coutures, à x = 30 et x = 60", () => {
    // 0 → 90 along x, the top edge (y = 18) cut at 60 and 30, extruded 50 along z.
    const board = draw([0, 0]).lineTo([90, 0]).lineTo([90, 18]).lineTo([60, 18]).lineTo([30, 18]).lineTo([0, 18]).close().sketchOnPlane("XY").extrude(50) as Shape3D;
    const seams = seamEdges(board);
    expect(seams).toHaveLength(2);
    const xs = seams.map((i) => board.edges[i]!.startPoint.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(30, 6);
    expect(xs[1]).toBeCloseTo(60, 6);
  });
});
