/** D'autres façons de tracer : rectangle par le centre ou trois points, cercle par deux ou trois points, arc par trois points ou tangent. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { circleThrough, tangentCircle } from "../../frontend/src/sketcher/draw-variants";
import { findCurve, pointPos, type Vec2 } from "../../frontend/src/sketcher/edit";
import { DrawingTool, type ToolName } from "../../frontend/src/sketcher/tools";
import { constrained, typedFields, withTypedDimensions } from "../../frontend/src/sketcher/typed-dims";

beforeAll(() => initSolver());

/** Clicks the tool at these places on `g`; the geometry it commits. */
function draw(name: Exclude<ToolName, "select">, at: Vec2[], g: SketchGeometry = emptySketchGeometry(), first?: string): { geometry: SketchGeometry; created: string[] } {
  const tool = new DrawingTool(name);
  let out: { geometry: SketchGeometry; created: string[] } | null = null;
  at.forEach((pos, i) => {
    const r = tool.click(g, i === 0 && first ? { pos, pointId: first } : { pos });
    if (r.kind === "commit") out = r;
  });
  if (!out) throw new Error("rien de posé");
  return out;
}
const near = (p: Vec2, q: Vec2, digits = 6) => {
  expect(p[0]).toBeCloseTo(q[0], digits);
  expect(p[1]).toBeCloseTo(q[1], digits);
};
/** The geometry solved stays as drawn: its relations hold. */
const solved = (g: SketchGeometry) => {
  const r = solveSketch(g);
  expect(r.state).toBe("ok");
  return r;
};

describe("autres façons de tracer", () => {
  it("rectangle par le centre : ses coins symétriques autour du centre, ses côtés d'aplomb", () => {
    const { geometry, created } = draw("rectangle-center", [[100, 50], [160, 90]]);
    expect(created).toHaveLength(4);
    const xs = geometry.points.map((p) => p.x).sort((a, b) => a - b);
    const ys = geometry.points.map((p) => p.y).sort((a, b) => a - b);
    expect([xs[0], xs.at(-1)]).toEqual([40, 160]);
    expect([ys[0], ys.at(-1)]).toEqual([10, 90]);
    expect(geometry.constraints.some((c) => c.kind === "symmetric")).toBe(true);
    solved(geometry);
    // Typed: 300 × 200 from the centre puts the corner 150, 100 away.
    expect(typedFields("rectangle-center")).toEqual(["w", "h"]);
    near(constrained("rectangle-center", { w: 300, h: 200 }, [0, 0], [10, -10]), [150, -100]);
    const sized = withTypedDimensions(geometry, created, "rectangle-center", { w: 300, h: 200 });
    expect(sized.constraints.filter((c) => c.kind === "length").map((c) => "value" in c && c.value).sort()).toEqual([200, 300]);
  });

  it("rectangle par trois points : penché, d'équerre, de la largeur cliquée, d'un côté ou de l'autre", () => {
    const { geometry } = draw("rectangle-3pt", [[0, 0], [30, 40], [-80, 60]]);
    const lines = geometry.curves.filter((c) => c.kind === "line");
    expect(lines).toHaveLength(4);
    const [a, b, c] = geometry.points.map((p): Vec2 => [p.x, p.y]);
    near(a!, [0, 0]);
    near(b!, [30, 40]);
    // The width: the distance of (−80, 60) from the side, 100.
    expect(Math.hypot(c![0] - b![0], c![1] - b![1])).toBeCloseTo(100, 6);
    expect((c![0] - b![0]) * 30 + (c![1] - b![1]) * 40).toBeCloseTo(0, 6);
    expect(geometry.constraints.map((k) => k.kind).sort()).toEqual(["parallel", "parallel", "perpendicular"]);
    solved(geometry);
    // In a line: no width.
    expect(() => draw("rectangle-3pt", [[0, 0], [30, 40], [60, 80]])).toThrow(/largeur/);
  });

  it("cercle par deux points : un diamètre ; par trois points : celui qui passe par eux, et ils restent dessus", () => {
    const two = draw("circle-2pt", [[0, 0], [60, 80]]);
    const circle = findCurve(two.geometry, two.created[0]!);
    expect(circle?.kind === "circle" && circle.radius).toBeCloseTo(50, 6);
    near(pointPos(two.geometry, circle!.kind === "circle" ? circle!.center : ""), [30, 40]);
    solved(two.geometry);
    expect(typedFields("circle-2pt")).toEqual(["c"]);
    near(constrained("circle-2pt", { c: 100 }, [0, 0], [3, 4]), [60, 80]);
    const three = draw("circle-3pt", [[100, 0], [0, 100], [-100, 0]]);
    const c3 = findCurve(three.geometry, three.created[0]!);
    expect(c3?.kind === "circle" && c3.radius).toBeCloseTo(100, 6);
    expect(three.geometry.constraints.filter((c) => c.kind === "pointOnCurve")).toHaveLength(3);
    solved(three.geometry);
    expect(() => draw("circle-3pt", [[0, 0], [10, 0], [20, 0]])).toThrow(/en ligne/);
    expect(circleThrough([0, 0], [10, 0], [20, 0])).toBeNull();
  });

  it("arc par trois points : du départ à la fin, du côté du point de passage", () => {
    const up = draw("arc-3pt", [[-100, 0], [100, 0], [0, 100]]);
    const arc = findCurve(up.geometry, up.created[0]!);
    expect(arc?.kind).toBe("arc");
    if (arc?.kind !== "arc") return;
    expect(arc.radius).toBeCloseTo(100, 6);
    // Counter-clockwise from (100, 0) to (−100, 0): over the top.
    expect(Math.sin((arc.startAngle + arc.endAngle) / 2)).toBeGreaterThan(0.9);
    solved(up.geometry);
    const down = draw("arc-3pt", [[-100, 0], [100, 0], [0, -100]]);
    const arc2 = findCurve(down.geometry, down.created[0]!);
    if (arc2?.kind !== "arc") throw new Error("pas un arc");
    expect(Math.sin((arc2.startAngle + arc2.endAngle) / 2)).toBeLessThan(-0.9);
  });

  it("arc tangent : il prolonge le trait sans cassure, et reste tangent", () => {
    const line = draw("line", [[0, 0], [100, 0]]);
    const end = line.geometry.points.find((p) => p.x === 100)!.id;
    const { geometry, created } = draw("arc-tangent", [[100, 0], [200, 100]], line.geometry, end);
    const arc = findCurve(geometry, created[0]!);
    if (arc?.kind !== "arc") throw new Error("pas un arc");
    // A quarter round of radius 100, centred above the end of the line.
    expect(arc.radius).toBeCloseTo(100, 6);
    near(pointPos(geometry, arc.center), [100, 100]);
    // Kept tangent: a radius to the start, square to the line.
    expect(geometry.constraints.some((c) => c.kind === "perpendicular")).toBe(true);
    solved(geometry);
    // Straight ahead: a line, not an arc. Not from the end of something: refused.
    expect(tangentCircle([0, 0], [1, 0], [50, 0])).toBeNull();
    expect(() => draw("arc-tangent", [[500, 500], [600, 600]], line.geometry)).toThrow(/bout d'un trait/);
    // Going on from that arc: a second one, in line with its radius.
    const arcEnd = pointPos(geometry, arc.end);
    near(arcEnd, [200, 100]);
    const again = draw("arc-tangent", [arcEnd, [300, 200]], geometry, arc.end);
    const second = findCurve(again.geometry, again.created[0]!);
    if (second?.kind !== "arc") throw new Error("pas un arc");
    near(pointPos(again.geometry, second.center), [300, 100]);
    solved(again.geometry);
  });
});
