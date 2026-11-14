/** Formes de menuiserie prêtes : posées contraintes et cotées, réglables par leurs cotes, seule leur place reste libre. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, isDimension } from "../../frontend/src/document/sketch";
import { setDimensionValue } from "../../frontend/src/sketcher/edit";
import { defaults, JOINERY_SHAPES, placeJoineryShape, shapeProblem, type JoineryShape } from "../../frontend/src/sketcher/joinery-shapes";

beforeAll(() => initSolver());

const KINDS = Object.keys(JOINERY_SHAPES) as JoineryShape[];
const place = (kind: JoineryShape, values = defaults(kind)) => placeJoineryShape(emptySketchGeometry(), kind, values, [100, 200]);
const xs = (g: ReturnType<typeof place>["geometry"]) => {
  const all = g.points.map((p) => p.x);
  return Math.max(...all) - Math.min(...all);
};

describe("formes de menuiserie prêtes", () => {
  for (const kind of KINDS) {
    it(`${JOINERY_SHAPES[kind].label} : posée, seule sa place reste libre`, () => {
      const { geometry, created } = place(kind);
      expect(created.length).toBeGreaterThan(0);
      const r = solveSketch(geometry);
      expect(r.state).toBe("ok");
      expect(r.dof).toBe(2);
    });
  }

  it("la découpe d'évier : 780 × 480, quatre angles arrondis de 10", () => {
    const { geometry } = place("sink");
    expect(geometry.curves.filter((c) => c.kind === "arc")).toHaveLength(4);
    expect(geometry.constraints.filter((c) => c.kind === "radius").map((c) => (c as { value: number }).value)).toEqual([10, 10, 10, 10]);
    expect(xs(geometry)).toBeCloseTo(780, 6);
  });

  it("la rangée système 32 : 10 trous de 5 à 32 d'entraxe, et l'entraxe se change d'une cote", () => {
    const { geometry } = place("row32");
    const circles = geometry.curves.filter((c) => c.kind === "circle");
    expect(circles).toHaveLength(10);
    expect(xs(geometry)).toBeCloseTo(9 * 32, 6);
    const pitch = geometry.constraints.find((c) => c.kind === "distanceX")!;
    const solved = solveSketch(setDimensionValue(geometry, pitch.id, 37));
    expect(solved.state).toBe("ok");
    expect(xs(solved.geometry)).toBeCloseTo(8 * 32 + 37, 6);
  });

  it("la queue d'aronde : base 30, longueur 18, pente 1:6 — la grande base fait 36", () => {
    const { geometry } = place("dovetail");
    expect(xs(geometry)).toBeCloseTo(36, 6);
    expect(geometry.constraints.filter(isDimension).map((c) => c.kind).sort()).toEqual(["angle", "length", "pointLineDistance"]);
  });

  it("la poignée cuvette : 128 hors tout, 40 de large", () => {
    const { geometry } = place("cupHandle");
    const arcs = geometry.curves.filter((c) => c.kind === "arc");
    const ends = arcs.flatMap((a) => (a.kind === "arc" ? [geometry.points.find((p) => p.id === a.center)!.x - a.radius, geometry.points.find((p) => p.id === a.center)!.x + a.radius] : []));
    expect(Math.max(...ends) - Math.min(...ends)).toBeCloseTo(128, 6);
  });

  it("des tailles impossibles sont dites", () => {
    expect(shapeProblem("sink", { w: 100, h: 50, r: 30 })).toMatch(/rayon/);
    expect(shapeProblem("cupHandle", { l: 30, w: 40 })).toMatch(/longueur/);
    expect(shapeProblem("row32", { n: 2.5, d: 5, p: 32 })).toMatch(/entier/);
    expect(() => place("hob", { w: -1, h: 10 })).toThrow(/positive/);
  });
});

describe("profils de moulure", () => {
  it("chacun est un contour fermé, prêt à balayer le long d'une arête", async () => {
    const { extractLoops, regions: regionsOf } = await import("../../frontend/src/sketcher/loops");
    for (const kind of ["quarterRound", "cove", "halfRound", "chamfer", "ogee"] as JoineryShape[]) {
      const { geometry } = place(kind);
      expect(regionsOf(extractLoops(geometry)), kind).toHaveLength(1);
    }
  });

  it("la doucine : un S de deux quarts de cercle de même rayon, tangents au milieu", () => {
    const { geometry } = place("ogee");
    const arcs = geometry.curves.filter((c) => c.kind === "arc");
    expect(arcs.map((a) => (a.kind === "arc" ? a.radius : 0))).toEqual([15, 15]);
  });
});
