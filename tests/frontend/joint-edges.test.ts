/** Arêtes cachées (comme Curic Hidden) : les joints à fleur entre pièces effacés, les vrais angles gardés. */
import { describe, expect, it } from "vitest";
import type { DrawnEdges } from "../../frontend/src/viewport/body-layer";
import { hideJoints, isBoxBody, type Box } from "../../frontend/src/viewport/joint-edges";

/** The 12 edges of a box, one drawn group per edge. */
function boxEdges(b: Box): DrawnEdges {
  const c = (k: number) => [b[k & 1 ? 1 : 0][0], b[k & 2 ? 1 : 0][1], b[k & 4 ? 1 : 0][2]];
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return { positions: new Float32Array(pairs.flatMap(([i, j]) => [...c(i!), ...c(j!)])), groups: pairs.map((_, i) => ({ start: i * 2, count: 2, edge: i })) };
}
const segments = (d: DrawnEdges) => Array.from({ length: d.positions.length / 6 }, (_, k) => Array.from(d.positions.slice(k * 6, k * 6 + 6)));

describe("arêtes cachées", () => {
  const a: Box = [[0, 0, 0], [100, 50, 19]];

  it("deux planches côte à côte, à fleur : les quatre arêtes du joint s'effacent, le reste reste", () => {
    const b: Box = [[100, 0, 0], [200, 50, 19]];
    const out = hideJoints(boxEdges(a), a, [b]);
    expect(segments(out)).toHaveLength(8);
    expect(segments(out).some((s) => s[0] === 100 && s[3] === 100)).toBe(false);
    // The picking map follows: every group still names its own edge.
    expect(out.groups.map((g) => g.edge)).not.toContain(5);
  });

  it("une planche plus haute à côté : son coin rentrant reste dessiné, la planche basse garde son dessus", () => {
    const b: Box = [[100, 0, 0], [200, 50, 40]];
    // Bottom joint (z = 0) hidden on both; the top edge of A at x = 100 is a real corner against B's side.
    const left = segments(hideJoints(boxEdges(a), a, [b]));
    expect(left.some((s) => s[0] === 100 && s[2] === 19 && s[3] === 100 && s[5] === 19)).toBe(true);
    expect(left.some((s) => s[0] === 100 && s[2] === 0 && s[5] === 0 && s[3] === 100)).toBe(false);
  });

  it("une arête plus longue que le joint est coupée : seule sa partie le long du voisin s'efface", () => {
    // B stacked on A, half as deep: A's top edges along X at y = 0 hidden, from x 0 to 100; the edges along Y split.
    const b: Box = [[0, 0, 19], [100, 25, 40]];
    const out = segments(hideJoints(boxEdges(a), a, [b]));
    const alongY = out.filter((s) => s[2] === 19 && s[5] === 19 && s[0] === s[3] && s[0] === 0);
    expect(alongY).toEqual([[0, 25, 19, 0, 50, 19]]);
  });

  it("deux corps qui ne se touchent que par une arête gardent toutes les leurs", () => {
    const b: Box = [[100, 50, 0], [200, 100, 19]];
    expect(segments(hideJoints(boxEdges(a), a, [b]))).toHaveLength(12);
  });

  it("seuls les corps en boîte comptent", () => {
    expect(isBoxBody(a, 100 * 50 * 19)).toBe(true);
    expect(isBoxBody(a, 100 * 50 * 19 * 0.8)).toBe(false);
  });
});
