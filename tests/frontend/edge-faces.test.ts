/** « Tirer une face » depuis une arête : les faces le long de l'arête (viewport/body-points.ts). */
import { describe, expect, it } from "vitest";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";
import { edgeFaces, edgeMiddle, type Point3 } from "../../frontend/src/viewport/body-points";

/** Faces made of two triangles each (a quad a b c d), and one edge from (0,0,0) to (0,0,10) in two segments. */
function mesh(faces: [Point3, Point3, Point3, Point3][]): BodyMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceGroups = faces.map((quad, f) => {
    const base = vertices.length / 3;
    vertices.push(...quad.flat());
    const start = indices.length;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return { start, count: 6, faceId: f };
  });
  return {
    bodyId: "b1",
    vertices: Float32Array.from(vertices),
    normals: new Float32Array(),
    indices: Uint32Array.from(indices),
    faceGroups,
    edges: Float32Array.from([0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 10]),
    edgeGroups: [{ start: 0, count: 4 }],
    metrics: {} as BodyMesh["metrics"],
  };
}

describe("faces le long d'une arête", () => {
  const m = mesh([
    [[0, 0, 0], [0, 5, 0], [0, 5, 10], [0, 0, 10]], // the end of the board (x = 0)
    [[0, 0, 0], [0, 0, 10], [800, 0, 10], [800, 0, 0]], // its long side (y = 0)
    [[0, 0, 0], [800, 0, 0], [800, 5, 0], [0, 5, 0]], // underneath: one end of the edge only
  ]);

  it("les deux faces qui ont les deux bouts de l'arête, pas celle qui n'en touche qu'un ; la plus petite d'abord", () => {
    expect(edgeFaces(m, 0)).toEqual([0, 1]);
    const swapped = mesh([
      [[0, 0, 0], [0, 0, 10], [800, 0, 10], [800, 0, 0]],
      [[0, 0, 0], [0, 5, 0], [0, 5, 10], [0, 0, 10]],
    ]);
    expect(edgeFaces(swapped, 0)).toEqual([1, 0]);
    expect(edgeFaces(m, 3)).toEqual([]);
  });

  it("le milieu de l'arête", () => {
    expect(edgeMiddle(m, 0)).toEqual([0, 0, 5]);
  });
});
