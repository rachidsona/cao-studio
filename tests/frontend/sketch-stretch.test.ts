/** Étirer dans l'esquisse : les points pris bougent, les autres restent, les cotes qui traversent prennent la nouvelle mesure. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, ORIGIN } from "../../frontend/src/document/sketch";
import { addConstraint, addLine, addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import { stretchGeometry } from "../../frontend/src/sketcher/move";

beforeAll(() => initSolver());

/** A cabinet side seen from the front: 600 × 720 from the origin, its width and height dimensioned, a shelf at 300. */
function cabinet() {
  let g = addRectangle(emptySketchGeometry(), { pointId: ORIGIN }, { at: [600, 720] }).geometry;
  const line = (y0: number, y1: number, x: number) => g.curves.find((c) => c.kind === "line" && [c.p1, c.p2].every((p) => pointPos(g, p)[0] === x) && Math.min(pointPos(g, c.p1)[1], pointPos(g, c.p2)[1]) === y0 && Math.max(pointPos(g, c.p1)[1], pointPos(g, c.p2)[1]) === y1)!.id;
  const bottom = g.curves.find((c) => c.kind === "line" && pointPos(g, c.p1)[1] === 0 && pointPos(g, c.p2)[1] === 0)!.id;
  g = addConstraint(g, { kind: "length", line: bottom, value: 600 } as never).geometry;
  g = addConstraint(g, { kind: "length", line: line(0, 720, 0), value: 720 } as never).geometry;
  g = addLine(g, { at: [0, 300] }, { at: [600, 300] }).geometry;
  return g;
}

describe("étirer", () => {
  it("le côté droit tiré de 150 : la largeur cotée devient 750, le côté gauche ne bouge pas, l'étagère s'allonge", () => {
    const g = cabinet();
    const right = g.points.filter((p) => p.x === 600).map((p) => p.id);
    expect(right).toHaveLength(3);
    const out = stretchGeometry(g, right, [150, 0]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const widths = out.geometry.constraints.filter((c) => c.kind === "length").map((c) => (c as { value: number }).value).sort((a, b) => a - b);
    expect(widths).toEqual([720, 750]);
    for (const p of out.geometry.points) {
      const before = g.points.find((q) => q.id === p.id)!;
      expect(p.x).toBeCloseTo(before.x === 600 ? 750 : before.x, 6);
      expect(p.y).toBeCloseTo(before.y, 6);
    }
    expect(solveSketch(out.geometry).state).toBe("ok");
  });

  it("rien de pris : il le dit", () => {
    const out = stretchGeometry(cabinet(), [], [10, 0]);
    expect(out.ok).toBe(false);
  });
});

describe("copies au déplacement", () => {
  it("« 5 », « x5 », « *5 » : à la suite ; « /5 » : réparties ; le reste n'est pas compris", async () => {
    const { parseCopies, copyOffsets } = await import("../../frontend/src/sketcher/move");
    expect(parseCopies("x5")).toEqual({ count: 5, spread: false });
    expect(parseCopies("5")).toEqual({ count: 5, spread: false });
    expect(parseCopies("*3")).toEqual({ count: 3, spread: false });
    expect(parseCopies(" / 4 ")).toEqual({ count: 4, spread: true });
    expect(parseCopies("")).toEqual({ count: 0, spread: false });
    expect(parseCopies("abc")).toBeNull();
    expect(copyOffsets([100, 0], 3, false)).toEqual([[100, 0], [200, 0], [300, 0]]);
    expect(copyOffsets([100, 0], 4, true)).toEqual([[25, 0], [50, 0], [75, 0], [100, 0]]);
  });
});
