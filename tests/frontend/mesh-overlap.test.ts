/** Deux pièces façonnées se chevauchent-elles vraiment, au-delà de leurs boîtes ? */
import { describe, expect, it } from "vitest";
import { insideMesh, meshesOverlap, type SolidMesh } from "../../frontend/src/features/mesh-overlap";

type V = [number, number, number];
/** Boxes as one mesh (apart from each other): 8 corners and 12 triangles each, faces outwards. */
function boxes(...list: [V, V][]): SolidMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [a, b] of list) {
    const base = vertices.length / 3;
    for (let i = 0; i < 8; i++) vertices.push(i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]);
    for (const [p, q, r, s] of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) indices.push(base + p!, base + q!, base + r!, base + p!, base + r!, base + s!);
  }
  return { vertices, indices };
}
const box = (m: SolidMesh): [V, V] => {
  const v = Array.from(m.vertices);
  const axis = (k: number) => v.filter((_, i) => i % 3 === k);
  return [[0, 1, 2].map((k) => Math.min(...axis(k))) as V, [0, 1, 2].map((k) => Math.max(...axis(k))) as V];
};
const common = (a: SolidMesh, b: SolidMesh) => {
  const [[la, ha], [lb, hb]] = [box(a), box(b)];
  return [[0, 1, 2].map((i) => Math.max(la[i]!, lb[i]!)), [0, 1, 2].map((i) => Math.min(ha[i]!, hb[i]!))] as const;
};

describe("chevauchement réel de pièces façonnées", () => {
  // A seat going round a corner (an L: two blocks), its box taking in the corner it leaves free.
  const seat = boxes([[0, 0, 0], [100, 40, 10]], [[0, 60, 0], [40, 100, 10]]);
  it("un point dedans ou dehors", () => {
    expect(insideMesh(seat, [50, 20, 5])).toBe(true);
    expect(insideMesh(seat, [70, 70, 5])).toBe(false);
  });

  it("une pièce dans le coin laissé libre : les boîtes se recouvrent, pas les pièces", () => {
    const arm = boxes([[60, 60, 0], [90, 90, 10]]);
    const [low, high] = common(seat, arm);
    expect(meshesOverlap(seat, arm, low, high)).toBe(false);
  });

  it("une pièce qui entre dans l'assise : elles se chevauchent", () => {
    const post = boxes([[20, 10, 0], [30, 30, 10]]);
    const [low, high] = common(seat, post);
    expect(meshesOverlap(seat, post, low, high)).toBe(true);
  });
});
