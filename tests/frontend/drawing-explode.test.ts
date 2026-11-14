/** Vue éclatée de la mise en plan : les pièces s'écartent le long de l'axe où elles dépassent, de la part demandée. */
import { describe, expect, it } from "vitest";
import { explodeMeshes } from "../../frontend/src/drawing/explode";
import type { MeshInput } from "../../frontend/src/drawing/projection";

/** A box as a mesh (its eight corners are enough here). */
const box = (id: string, [x0, y0, z0]: number[], [x1, y1, z1]: number[]): MeshInput => {
  const v: number[] = [];
  for (const x of [x0!, x1!]) for (const y of [y0!, y1!]) for (const z of [z0!, z1!]) v.push(x, y, z);
  return { id, vertices: v, indices: [], edges: [x0!, y0!, z0!, x1!, y0!, z0!] };
};
const minX = (m: MeshInput) => Math.min(...Array.from(m.vertices).filter((_, i) => i % 3 === 0));

describe("vue éclatée", () => {
  it("deux côtés d'un caisson s'écartent chacun de son côté, de 30 % de la plus grande taille", () => {
    const left = box("g", [0, 0, 0], [18, 560, 720]);
    const right = box("d", [582, 0, 0], [600, 560, 720]);
    const [l, r] = explodeMeshes([left, right], 0.3, [0, -1, 0]);
    expect(minX(l!)).toBeCloseTo(-216, 3);
    expect(minX(r!)).toBeCloseTo(582 + 216, 3);
    // The edges move with their piece.
    expect(r!.edges[0]).toBeCloseTo(582 + 216, 3);
  });

  it("une pièce du milieu vient vers l'œil ; 0 ou une seule pièce : rien ne bouge", () => {
    const shelf = box("e", [18, 0, 300], [582, 540, 318]);
    const sides = [box("g", [0, 0, 0], [18, 560, 720]), box("d", [582, 0, 0], [600, 560, 720])];
    const out = explodeMeshes([...sides, shelf], 0.5, [0, -1, 0]);
    const ys = Array.from(out[2]!.vertices).filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-360, 3);
    expect(explodeMeshes(sides, 0, [0, -1, 0])).toEqual(sides);
    expect(explodeMeshes([shelf], 0.5, [0, -1, 0])).toEqual([shelf]);
  });
});
