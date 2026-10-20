/** Sketcher logic: drawing tools, snapping, constraint commands and edits. */
import { beforeAll, describe, expect, it } from "vitest";
import { classify, COMMANDS } from "../../frontend/src/constraints/catalog";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { centeredRectangle, emptySketchGeometry, ORIGIN, type SketchGeometry } from "../../frontend/src/document/sketch";
import { addConstraint, measure, removeEntities } from "../../frontend/src/sketcher/edit";
import { hitTest, snap, toggleTarget } from "../../frontend/src/sketcher/hit";
import { extractLoops } from "../../frontend/src/sketcher/profiles";
import { DrawingTool } from "../../frontend/src/sketcher/tools";

const TOL = 0.5;

function clickAll(tool: DrawingTool, start: SketchGeometry, clicks: [number, number][]): SketchGeometry {
  let g = start;
  for (const p of clicks) {
    const result = tool.click(g, snap(g, p, TOL));
    if (result.kind === "commit") g = result.geometry;
  }
  return g;
}

function command(id: string) {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
}

describe("outils de dessin", () => {
  beforeAll(() => initSolver());

  it("trace une polyligne fermée qui partage ses sommets", () => {
    const tool = new DrawingTool("line");
    const g = clickAll(tool, emptySketchGeometry(), [
      [5, 5],
      [35, 5.2],
      [20, 25],
      [5.1, 5.1], // snaps back onto the first point: closes the chain
    ]);
    expect(g.points).toHaveLength(3);
    expect(g.curves).toHaveLength(3);
    // The nearly horizontal first segment received a horizontal constraint.
    expect(g.constraints).toEqual([expect.objectContaining({ kind: "horizontal", line: "l1" })]);
    expect(extractLoops(g)).toHaveLength(1);
    expect(tool.step).toBe("Cliquez le premier point");
  });

  it("trace un rectangle avec ses contraintes horizontales et verticales", () => {
    const g = clickAll(new DrawingTool("rectangle"), emptySketchGeometry(), [
      [-10, -5],
      [20, 15],
    ]);
    expect(g.curves).toHaveLength(4);
    expect(g.constraints.map((c) => c.kind).sort()).toEqual(["horizontal", "horizontal", "vertical", "vertical"]);
    const solved = solveSketch(g);
    expect(solved).toMatchObject({ state: "ok", dof: 4 });
  });

  it("accroche le centre d'un cercle à l'origine", () => {
    const g = clickAll(new DrawingTool("circle"), emptySketchGeometry(), [
      [0.2, -0.1],
      [6, 0],
    ]);
    expect(g.points).toHaveLength(0);
    expect(g.curves[0]).toMatchObject({ kind: "circle", center: ORIGIN, radius: 6 });
  });

  it("trace un arc antihoraire et place un point sur une courbe accrochée", () => {
    let g = centeredRectangle(80, 50);
    g = clickAll(new DrawingTool("arc"), g, [
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    const arc = g.curves.find((c) => c.kind === "arc");
    expect(arc).toMatchObject({ radius: 10, startAngle: 0 });
    expect(arc?.kind === "arc" && arc.endAngle).toBeCloseTo(Math.PI / 2, 9);

    g = clickAll(new DrawingTool("line"), g, [
      [5, -25.2], // on l1 (bottom edge), away from the Y axis
      [0, -40],
    ]);
    expect(g.constraints).toContainEqual(expect.objectContaining({ kind: "pointOnCurve", curve: "l1" }));
  });
});

describe("contraintes et cotes", () => {
  beforeAll(() => initSolver());

  it("propose les commandes adaptées à la sélection", () => {
    const g = centeredRectangle(80, 50);
    const available = (ids: string[]) => COMMANDS.filter((c) => c.applies(classify(g, ids))).map((c) => c.id);
    expect(available(["l1", "l3"])).toEqual(["horizontal", "vertical", "parallel", "perpendicular", "equal", "dimension"]);
    expect(available(["p1", "p3"])).toEqual(["coincident", "fix", "dimension", "dimensionX", "dimensionY"]);
    expect(available(["p1", "p2", "l2"])).toEqual(["symmetric"]);
    expect(available(["p1", "l2"])).toEqual(["pointOnCurve", "midpoint", "dimension"]);
  });

  it("crée une cote avec la valeur mesurée puis la pilote", () => {
    let g = clickAll(new DrawingTool("circle"), emptySketchGeometry(), [
      [0, 0],
      [4, 0],
    ]);
    const [dim] = command("dimension").build(classify(g, ["k1"]), g);
    expect(dim).toMatchObject({ kind: "diameter", curve: "k1", value: 8 });
    g = addConstraint(g, { ...dim, value: 12 } as never).geometry;
    const solved = solveSketch(g);
    expect(solved).toMatchObject({ state: "ok", dof: 0 });
    expect(solved.geometry.curves[0]).toMatchObject({ radius: 6 });
  });

  it("mesure un angle orienté entre deux lignes", () => {
    const g: SketchGeometry = {
      points: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 10, y: 0 },
        { id: "c", x: 10, y: 10 },
      ],
      curves: [
        { id: "l1", kind: "line", p1: "a", p2: "b" },
        { id: "l2", kind: "line", p1: "a", p2: "c" },
      ],
      constraints: [],
    };
    expect(measure(g, { id: "x", kind: "angle", a: "l1", b: "l2", value: 0 })).toBeCloseTo(45, 9);
    expect(measure(g, { id: "x", kind: "angle", a: "l2", b: "l1", value: 0 })).toBeCloseTo(-45, 9);
    const withAngle = addConstraint(g, { kind: "angle", a: "l1", b: "l2", value: 30 } as never).geometry;
    const solved = solveSketch(withAngle).geometry;
    expect(measure(solved, { id: "x", kind: "angle", a: "l1", b: "l2", value: 0 })).toBeCloseTo(30, 6);
  });

  it("supprime une ligne avec ses contraintes et ses points orphelins", () => {
    const g = removeEntities(centeredRectangle(80, 50), ["l1"]);
    expect(g.curves.map((c) => c.id)).toEqual(["l2", "l3", "l4"]);
    expect(g.constraints.some((c) => "line" in c && c.line === "l1")).toBe(false);
    expect(g.points).toHaveLength(4); // p1/p2 still used by l4/l2

    const g2 = removeEntities(centeredRectangle(80, 50), ["p1"]);
    expect(g2.curves.map((c) => c.id)).toEqual(["l2", "l3"]);
    expect(g2.points.map((p) => p.id)).toEqual(["p2", "p3", "p4"]);
  });

  it("sélectionne d'abord les points, puis les courbes et les axes", () => {
    const g = centeredRectangle(80, 50);
    expect(hitTest(g, [-39.9, -25.1], 0.5).map((h) => h.id)).toEqual(["p1", "l1", "l4"]);
    expect(hitTest(g, [10, 0.2], 0.5).map((h) => h.id)).toEqual(["axisX"]);
  });

  it("désélectionne l'élément déjà choisi même si une ligne voisine est plus proche", () => {
    // Two parallel lines 2 mm apart: a click between them hits both.
    const g: SketchGeometry = {
      points: [
        { id: "a", x: 10, y: 10 },
        { id: "b", x: 60, y: 10 },
        { id: "c", x: 10, y: 12 },
        { id: "d", x: 60, y: 12 },
      ],
      curves: [
        { id: "l1", kind: "line", p1: "a", p2: "b" },
        { id: "l2", kind: "line", p1: "c", p2: "d" },
      ],
      constraints: [],
    };
    const hits = hitTest(g, [35, 11.2], 3); // nearer to l2
    expect(hits.map((h) => h.id)).toEqual(["l2", "l1"]);
    expect(toggleTarget(hits, new Set())?.id).toBe("l2");
    expect(toggleTarget(hits, new Set(["l1"]))?.id).toBe("l1");
  });
});
