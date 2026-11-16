/** « Centrer » dans l'esquisse : le petit dessin au milieu du grand, et il y reste quand le grand change. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { pointPos } from "../../frontend/src/sketcher/edit";
import { withCentered } from "../../frontend/src/sketcher/center-in";

/** A rectangle from (x0, y0) to (x1, y1), its points and lines named with `k`; its sides horizontal and vertical. */
function rect(g: SketchGeometry, k: string, x0: number, y0: number, x1: number, y1: number): SketchGeometry {
  const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y], i) => ({ id: `${k}p${i}`, x: x!, y: y! }));
  const l = [0, 1, 2, 3].map((i) => ({ id: `${k}l${i}`, kind: "line" as const, p1: `${k}p${i}`, p2: `${k}p${(i + 1) % 4}` }));
  const c = [
    { id: `${k}h0`, kind: "horizontal" as const, line: `${k}l0` }, { id: `${k}h2`, kind: "horizontal" as const, line: `${k}l2` },
    { id: `${k}v1`, kind: "vertical" as const, line: `${k}l1` }, { id: `${k}v3`, kind: "vertical" as const, line: `${k}l3` },
  ];
  return { ...g, points: [...g.points, ...p], curves: [...g.curves, ...l], constraints: [...g.constraints, ...c] } as SketchGeometry;
}

describe("centrer un dessin dans un autre", () => {
  beforeAll(() => initSolver());

  it("un petit rectangle va au milieu du grand, et y reste quand le grand s'élargit", () => {
    let g = rect(rect(emptySketchGeometry(), "a", 0, 0, 1000, 600), "b", 50, 40, 250, 140);
    // Its size held, so it moves rather than stretches.
    g = { ...g, constraints: [...g.constraints, { id: "w", kind: "length", line: "bl0", value: 200 }, { id: "h", kind: "length", line: "bl1", value: 100 }] } as SketchGeometry;
    const made = withCentered(g, ["al0", "bl2"]);
    if (typeof made === "string") throw new Error(made);
    expect(made.inner.sort()).toEqual(["bl0", "bl1", "bl2", "bl3"]);
    const solved = solveSketch(made.geometry);
    expect(solved.state).not.toBe("conflict");
    const mid = (g2: SketchGeometry, a: string, b: string) => [0, 1].map((i) => (pointPos(g2, a)[i]! + pointPos(g2, b)[i]!) / 2);
    expect(mid(solved.geometry, "bp0", "bp2").map((v) => Math.round(v))).toEqual(mid(solved.geometry, "ap0", "ap2").map((v) => Math.round(v)));
    // The large one widened: the small one stays in its middle.
    const wider = { ...solved.geometry, constraints: [...solved.geometry.constraints, { id: "W", kind: "length", line: "al0", value: 1400 }, { id: "fx", kind: "fix", point: "ap0", x: 0, y: 0 }] } as SketchGeometry;
    const again = solveSketch(wider).geometry;
    expect(mid(again, "bp0", "bp2")[0]).toBeCloseTo(700, 3);
  });

  it("un cercle au milieu d'un carré ; un seul dessin choisi est refusé", () => {
    let g = rect(emptySketchGeometry(), "a", 0, 0, 400, 400);
    g = { ...g, points: [...g.points, { id: "c0", x: 30, y: 50 }], curves: [...g.curves, { id: "ci", kind: "circle", center: "c0", radius: 40 }] } as SketchGeometry;
    const made = withCentered(g, ["ci", "al1"]);
    if (typeof made === "string") throw new Error(made);
    const solved = solveSketch(made.geometry).geometry;
    expect(pointPos(solved, "c0").map((v) => Math.round(v))).toEqual([200, 200]);
    expect(withCentered(g, ["al1", "al2"])).toMatch(/deux dessins/);
  });
});
