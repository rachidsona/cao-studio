/** Les arêtes entre deux faces d'un même plan (coutures d'une planche) ne sont pas dessinées, et un clic sur une ligne choisit bien son arête. */
import { describe, expect, it } from "vitest";
import { drawnEdgeAt, drawnEdges } from "../../frontend/src/viewport/body-layer";

describe("arêtes dessinées d'un corps", () => {
  // Three edges of two points each (x, y, z per point).
  const edges = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 2, 0, 0, 3, 0, 0]);
  const edgeGroups = [
    { start: 0, count: 2 },
    { start: 2, count: 2 },
    { start: 4, count: 2 },
  ];

  it("sans couture, toutes les arêtes, chacune à sa place", () => {
    const drawn = drawnEdges({ edges, edgeGroups });
    expect(drawn.positions).toBe(edges);
    expect(drawn.groups.map((g) => g.edge)).toEqual([0, 1, 2]);
  });

  it("une couture est retirée du dessin, les autres arêtes restent", () => {
    expect(Array.from(drawnEdges({ edges, edgeGroups, seams: [1] }).positions)).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
  });

  it("après une couture retirée, un clic sur une ligne donne toujours la bonne arête (pas la voisine)", () => {
    const { groups } = drawnEdges({ edges, edgeGroups, seams: [1] });
    // The drawn vertices 0-1 are edge 0; 2-3 are edge 2 (edge 1, the seam, is not drawn).
    expect(drawnEdgeAt(groups, 0)).toBe(0);
    expect(drawnEdgeAt(groups, 2)).toBe(2);
    expect(drawnEdgeAt(groups, 3)).toBe(2);
    expect(drawnEdgeAt(groups, 4)).toBe(-1);
  });
});
