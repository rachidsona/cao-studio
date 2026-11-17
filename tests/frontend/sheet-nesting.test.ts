/** Imbrication des pièces mises à plat sur leurs panneaux, par leur contour réel. */
import { describe, expect, it } from "vitest";
import { partsDxf, type FlatEdge, type FlatPart } from "../../frontend/src/io/dxf";
import { nestParts, placedPart } from "../../frontend/src/io/sheet-nesting";

type P2 = [number, number];
const polygon = (name: string, pts: P2[]): FlatPart => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { name, thickness: 18, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), edges: pts.map((a, k): FlatEdge => ({ kind: "line", a, b: pts[(k + 1) % pts.length]! })) };
};
const rect = (name: string, w: number, h: number) => polygon(name, [[0, 0], [w, 0], [w, h], [0, h]]);
const OPTIONS = { sheet: [2800, 2070] as [number, number], gap: 12, margin: 10 };

describe("imbrication sur panneaux", () => {
  it("des pièces qui tiennent sur un panneau y vont toutes, sans se toucher ni sortir du panneau", () => {
    const parts = [rect("A", 1200, 600), rect("B", 1200, 600), rect("C", 800, 500), rect("D", 800, 500), rect("E", 400, 300)];
    const { placements, sheets, tooLarge } = nestParts(parts, OPTIONS);
    expect([sheets, tooLarge, placements.length]).toEqual([1, [], 5]);
    const boxes = placements.map((p) => {
      const laid = placedPart(parts[p.part]!, p);
      const pts = laid.edges.flatMap((e) => (e.kind === "line" ? [e.a, e.b] : []));
      return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))] as [number, number, number, number];
    });
    for (const [x0, y0, x1, y1] of boxes) expect(x0 >= 10 - 1e-6 && y0 >= 10 - 1e-6 && x1 <= 2790 + 1e-6 && y1 <= 2060 + 1e-6).toBe(true);
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const [p, q] = [boxes[a]!, boxes[b]!];
      expect(p[2] + 12 <= q[0] + 1e-6 || q[2] + 12 <= p[0] + 1e-6 || p[3] + 12 <= q[1] + 1e-6 || q[3] + 12 <= p[1] + 1e-6).toBe(true);
    }
  });

  it("par leur contour réel : deux triangles s'emboîtent, plus serrés que leurs boîtes côte à côte", () => {
    const tri = (name: string) => polygon(name, [[0, 0], [1000, 0], [0, 1000]]);
    const parts = [tri("T1"), tri("T2")];
    const { placements } = nestParts(parts, OPTIONS);
    const xs = placements.flatMap((p) => placedPart(parts[p.part]!, p).edges.flatMap((e) => (e.kind === "line" ? [e.a[0], e.b[0]] : [])));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(2000);
  });

  it("une pièce plus grande que le panneau est signalée ; le fil ne laisse que les demi-tours ; le DXF garde les places", () => {
    const parts = [rect("Grande", 3000, 500), rect("Long", 2000, 300)];
    const { tooLarge, placements } = nestParts(parts, { ...OPTIONS, grain: true });
    expect(tooLarge).toEqual([0]);
    expect(placements.every((p) => p.turn === 0 || p.turn === 180)).toBe(true);
    const laid = placements.map((p) => placedPart(parts[p.part]!, p));
    expect(partsDxf(laid, 20, undefined, true)).toContain("LINE");
  });
});
