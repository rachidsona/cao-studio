/** Symétrie, rotation et échelle dans l'esquisse : copies liées, arcs retournés, contraintes et cotes qui suivent. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { AXIS_X, AXIS_Y, emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { apply, reflection, rotation, scaling, transformSelection } from "../../frontend/src/sketcher/transform-selection";

// A 200 × 100 rectangle from (100, 0), its bottom horizontal, its width dimensioned; and an arc.
const G: SketchGeometry = {
  ...emptySketchGeometry(),
  points: [
    { id: "p1", x: 100, y: 0 },
    { id: "p2", x: 300, y: 0 },
    { id: "p3", x: 300, y: 100 },
    { id: "c1", x: 500, y: 0 },
    { id: "a1s", x: 600, y: 0 },
    { id: "a1e", x: 500, y: 100 },
  ],
  curves: [
    { id: "l1", kind: "line", p1: "p1", p2: "p2" },
    { id: "l2", kind: "line", p1: "p2", p2: "p3" },
    { id: "arc1", kind: "arc", center: "c1", start: "a1s", end: "a1e", radius: 100, startAngle: 0, endAngle: Math.PI / 2 },
  ],
  constraints: [
    { id: "k1", kind: "horizontal", line: "l1" },
    { id: "k2", kind: "vertical", line: "l2" },
    { id: "k3", kind: "length", line: "l1", value: 200 },
  ],
};
const pos = (g: SketchGeometry, id: string) => {
  const p = g.points.find((q) => q.id === id)!;
  return [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))];
};

describe("symétrie, rotation et échelle dans l'esquisse", () => {
  beforeAll(() => initSolver());

  it("calcule les transformations du plan", () => {
    expect(apply(rotation([0, 0], 90), [1, 0]).map((v) => Number(v.toFixed(9)))).toEqual([0, 1]);
    expect(apply(scaling([10, 10], 2), [20, 10])).toEqual([30, 10]);
    expect(apply(reflection([0, 0], [0, 1]), [3, 4]).map((v) => Number(v.toFixed(9)))).toEqual([-3, 4]);
  });

  it("copie en miroir autour de l'axe Y, la copie liée par des contraintes de symétrie, l'arc retourné", () => {
    const out = transformSelection(G, new Set(["l1", "l2", "arc1"]), reflection([0, 0], [0, 1]), true, AXIS_Y);
    if (!out.ok) throw new Error(out.reason);
    const g = out.geometry;
    expect(g.curves).toHaveLength(6);
    const arc = g.curves.at(-1)!;
    // The mirrored arc starts where the original ended: (−500, 100) → (−600, 0), still counter-clockwise.
    expect(arc.kind === "arc" && [pos(g, arc.start), pos(g, arc.end)]).toEqual([[-500, 100], [-600, 0]]);
    // Its three line points and the arc's two ends symmetric, the arc's radius equal: tied, nothing redundant.
    expect(g.constraints.filter((c) => c.kind === "symmetric")).toHaveLength(5);
    expect(g.constraints.filter((c) => c.kind === "equal")).toEqual([expect.objectContaining({ a: "arc1", b: arc.id })]);
    // The symmetry holds the copy: the original's horizontal is not repeated on it (it would be redundant).
    expect(g.constraints.filter((c) => c.kind === "horizontal")).toHaveLength(1);
    const solved = solveSketch(g);
    expect(solved.state).not.toBe("conflicting");
    expect(solved.state).toBe("ok");
    expect(solved.redundant).toEqual([]);
  });

  it("autour de l'axe où la forme est posée : les points de l'axe sont partagés, le trait de l'axe n'est pas doublé", () => {
    // The rectangle's bottom (l1) lies on the X axis: the copy below shares its two points and that side.
    const out = transformSelection(G, new Set(["l1", "l2"]), reflection([0, 0], [1, 0]), true, AXIS_X);
    if (!out.ok) throw new Error(out.reason);
    const g = out.geometry;
    expect(g.points).toHaveLength(G.points.length + 1);
    expect(g.curves.map((c) => c.id)).toEqual(["l1", "l2", "arc1", "l3"]);
    const copy = g.curves.at(-1)!;
    expect(copy.kind === "line" && [copy.p1, pos(g, copy.p2)]).toEqual(["p2", [300, -100]]);
    // Only the point off the axis is tied by symmetry; the horizontal is not doubled; it solves.
    expect(g.constraints.filter((c) => c.kind === "symmetric")).toHaveLength(1);
    expect(g.constraints.filter((c) => c.kind === "horizontal")).toHaveLength(1);
    expect(solveSketch(g).state).not.toBe("conflicting");
  });

  it("une copie miroir de cercles et d'un arc se résout sans contrainte redondante, et suit l'original", () => {
    const g0: SketchGeometry = {
      ...G,
      points: [...G.points, { id: "h", x: 200, y: 50 }],
      curves: [...G.curves, { id: "hole", kind: "circle", center: "h", radius: 20 }],
      constraints: [...G.constraints, { id: "k4", kind: "radius", curve: "hole", value: 20 }],
    };
    const out = transformSelection(g0, new Set(["l1", "l2", "arc1", "hole"]), reflection([0, 0], [0, 1]), true, AXIS_Y);
    if (!out.ok) throw new Error(out.reason);
    const solved = solveSketch(out.geometry);
    expect(solved.state).toBe("ok");
    expect(solved.redundant).toEqual([]);
    // The hole made bigger: its mirror image follows.
    const bigger = { ...out.geometry, constraints: out.geometry.constraints.map((c) => (c.id === "k4" ? { ...c, value: 30 } : c)) };
    const after = solveSketch(bigger);
    const copy = after.geometry.curves.at(-1)!;
    expect(copy.kind === "circle" && Number(copy.radius.toFixed(6))).toBe(30);
  });

  it("tourne d'un quart de tour sur place : l'horizontale devient verticale, la cote reste", () => {
    const out = transformSelection(G, new Set(["l1", "l2"]), rotation([100, 0], 90), false);
    if (!out.ok) throw new Error(out.reason);
    expect(pos(out.geometry, "p2")).toEqual([100, 200]);
    expect(out.geometry.constraints.find((c) => c.id === "k1")?.kind).toBe("vertical");
    expect(out.geometry.constraints.find((c) => c.id === "k2")?.kind).toBe("horizontal");
    // At 30°, neither holds any more.
    const slanted = transformSelection(G, new Set(["l1", "l2"]), rotation([100, 0], 30), false);
    expect(slanted.ok && slanted.geometry.constraints.map((c) => c.id)).toEqual(["k3"]);
  });

  it("agrandit d'un facteur, les rayons et les cotes avec", () => {
    const out = transformSelection(G, new Set(["l1", "arc1"]), scaling([0, 0], 2), true);
    if (!out.ok) throw new Error(out.reason);
    const len = out.geometry.constraints.filter((c) => c.kind === "length");
    expect(len.map((c) => "value" in c && c.value)).toEqual([200, 400]);
    expect(out.geometry.curves.at(-1)).toMatchObject({ kind: "arc", radius: 200 });
    expect(transformSelection(G, new Set(), scaling([0, 0], 2), true).ok).toBe(false);
  });
});

describe("réseau circulaire dans l'esquisse", () => {
  it("répartit les copies sur un tour, ou de l'original à la dernière sur un angle plus petit", async () => {
    const { polarCopies } = await import("../../frontend/src/sketcher/transform-selection");
    // A circle of radius 10 at (100, 0), 6 times round the origin: every 60°.
    const hole: SketchGeometry = { ...emptySketchGeometry(), points: [{ id: "c", x: 100, y: 0 }], curves: [{ id: "k1", kind: "circle", center: "c", radius: 10 }] };
    const full = polarCopies(hole, new Set(["k1"]), [0, 0], 6, 360);
    if (!full.ok) throw new Error(full.reason);
    expect(full.geometry.curves).toHaveLength(6);
    expect(pos(full.geometry, full.geometry.points[1]!.id)).toEqual([50, 86.60254]);
    // Three over 90°: at 0°, 45° and 90°.
    const quarter = polarCopies(hole, new Set(["k1"]), [0, 0], 3, 90);
    if (!quarter.ok) throw new Error(quarter.reason);
    expect(pos(quarter.geometry, quarter.geometry.points[2]!.id)).toEqual([0, 100]);
    expect(polarCopies(hole, new Set(["k1"]), [0, 0], 1, 360).ok).toBe(false);
  });
});
