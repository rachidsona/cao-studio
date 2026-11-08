/** Les faces pareilles d'un corps : même aire, même périmètre, à plat. */
import { describe, expect, it } from "vitest";
import { faceMeasure, faceTwins } from "../../frontend/src/app/face-twins";

/** Squares of these sides, each as two triangles, side by side; then a bent face of two triangles. */
function mesh(sides: number[]) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceGroups: { start: number; count: number; faceId: number }[] = [];
  sides.forEach((s, f) => {
    const x = f * 1000;
    const base = vertices.length / 3;
    vertices.push(x, 0, 0, x + s, 0, 0, x + s, s, 0, x, s, 0);
    faceGroups.push({ start: indices.length, count: 6, faceId: f });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const base = vertices.length / 3;
  vertices.push(0, 0, 50, 10, 0, 50, 10, 10, 60, 0, 10, 50);
  faceGroups.push({ start: indices.length, count: 6, faceId: sides.length });
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), faceGroups };
}

describe("faces pareilles", () => {
  it("mesure l'aire et le contour, sans la diagonale intérieure", () => {
    expect(faceMeasure(mesh([100]), 0)).toEqual({ area: 10000, perimeter: 400, flat: true });
  });

  it("prend les faces de même taille, pas les autres", () => {
    expect(faceTwins(mesh([100, 200, 100, 100]), 2)).toEqual([0, 2, 3]);
    expect(faceTwins(mesh([100, 200, 100]), 1)).toEqual([1]);
  });

  it("une face qui n'est pas plane reste seule", () => {
    const m = mesh([100]);
    expect(faceMeasure(m, 1).flat).toBe(false);
    expect(faceTwins(m, 1)).toEqual([1]);
  });
});
