/** Constraint solver tests against the real planegcs WASM module. */
import { beforeAll, describe, expect, it } from "vitest";
import { centeredRectangle, ORIGIN, type SketchGeometry } from "../../frontend/src/document/sketch";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";

const point = (g: SketchGeometry, id: string) => {
  const p = g.points.find((q) => q.id === id);
  if (!p) throw new Error(id);
  return [Number(p.x.toFixed(9)), Number(p.y.toFixed(9))];
};

function withDimension(g: SketchGeometry, id: string, value: number): SketchGeometry {
  return { ...g, constraints: g.constraints.map((c) => (c.id === id && "value" in c ? { ...c, value } : c)) };
}

describe("solveur de contraintes (planegcs)", () => {
  beforeAll(() => initSolver());

  it("résout un rectangle entièrement contraint", () => {
    const result = solveSketch(centeredRectangle(80, 50));
    expect(result).toMatchObject({ state: "ok", dof: 0, conflicting: [], redundant: [] });
    expect(point(result.geometry, "p1")).toEqual([-40, -25]);
    expect(point(result.geometry, "p3")).toEqual([40, 25]);
  });

  it("recalcule l'esquisse quand une cote change", () => {
    const result = solveSketch(withDimension(centeredRectangle(80, 50), "d2", 60));
    expect(result.state).toBe("ok");
    expect(point(result.geometry, "p1")).toEqual([-40, -30]);
    expect(point(result.geometry, "p3")).toEqual([40, 30]);
  });

  it("compte les degrés de liberté d'une esquisse sous-contrainte", () => {
    const g = centeredRectangle(80, 50);
    g.constraints = g.constraints.filter((c) => c.kind !== "symmetric" && c.id !== "d1");
    const result = solveSketch(g);
    expect(result.state).toBe("ok");
    expect(result.dof).toBe(3); // position X/Y + longueur
  });

  it("signale une contrainte redondante", () => {
    const g = centeredRectangle(80, 50);
    g.constraints.push({ id: "par", kind: "parallel", a: "l1", b: "l3" });
    const result = solveSketch(g);
    expect(result.state).toBe("redundant");
    expect(result.redundant).toContain("par");
  });

  it("signale des cotes en conflit", () => {
    const g = centeredRectangle(80, 50);
    g.constraints.push({ id: "d3", kind: "distance", a: "p1", b: "p2", value: 60 });
    const result = solveSketch(g);
    expect(result.state).toBe("conflicting");
    expect(result.conflicting).toEqual(expect.arrayContaining(["d1", "d3"]));
  });

  it("applique des distances horizontale et verticale signées", () => {
    const g: SketchGeometry = {
      points: [{ id: "a", x: 3, y: 4 }],
      curves: [],
      constraints: [
        { id: "dx", kind: "distanceX", a: ORIGIN, b: "a", value: -12 },
        { id: "dy", kind: "distanceY", a: ORIGIN, b: "a", value: 7.5 },
      ],
    };
    const result = solveSketch(g);
    expect(result).toMatchObject({ state: "ok", dof: 0 });
    expect(point(result.geometry, "a")).toEqual([-12, 7.5]);
  });

  it("résout tangence, égalité et diamètre", () => {
    const g: SketchGeometry = {
      points: [
        { id: "c", x: 0, y: 0 },
        { id: "p", x: -20, y: 8 },
        { id: "q", x: 20, y: 9 },
      ],
      curves: [
        { id: "k", kind: "circle", center: "c", radius: 4 },
        { id: "l", kind: "line", p1: "p", p2: "q" },
      ],
      constraints: [
        { id: "o", kind: "coincident", a: "c", b: ORIGIN },
        { id: "t", kind: "tangent", a: "l", b: "k" },
        { id: "h", kind: "horizontal", line: "l" },
        { id: "d", kind: "diameter", curve: "k", value: 10 },
      ],
    };
    const result = solveSketch(g);
    expect(result.state).toBe("ok");
    expect(result.geometry.curves[0]).toMatchObject({ radius: 5 });
    expect(Math.abs(point(result.geometry, "p")[1] as number)).toBeCloseTo(5, 9);
  });

  it("résout un arc et met à jour ses angles", () => {
    const g: SketchGeometry = {
      points: [
        { id: "c", x: 0, y: 0 },
        { id: "s", x: 10, y: 0 },
        { id: "e", x: 0, y: 10 },
      ],
      curves: [{ id: "a", kind: "arc", center: "c", start: "s", end: "e", radius: 10, startAngle: 0, endAngle: Math.PI / 2 }],
      constraints: [
        { id: "o", kind: "coincident", a: "c", b: ORIGIN },
        { id: "r", kind: "radius", curve: "a", value: 15 },
      ],
    };
    const result = solveSketch(g);
    expect(result.state).toBe("ok");
    expect(result.geometry.curves[0]).toMatchObject({ radius: 15 });
    const [sx, sy] = point(result.geometry, "s") as [number, number];
    expect(Math.hypot(sx, sy)).toBeCloseTo(15, 9);
  });

  it("déplace un point sans violer les contraintes (glisser)", () => {
    const g = centeredRectangle(80, 50);
    g.constraints = g.constraints.filter((c) => c.kind !== "symmetric");
    const result = solveSketch(g, { drag: { point: "p1", x: -100, y: -100 }, diagnose: false });
    const [x1, y1] = point(result.geometry, "p1") as [number, number];
    const [x3, y3] = point(result.geometry, "p3") as [number, number];
    expect(x3 - x1).toBeCloseTo(80, 6);
    expect(y3 - y1).toBeCloseTo(50, 6);
    expect(x1).toBeLessThan(-40);
  });

  it("refuse une tangence entre deux lignes avec un message explicite", () => {
    const g = centeredRectangle(80, 50);
    g.constraints.push({ id: "t", kind: "tangent", a: "l1", b: "l2" });
    expect(() => solveSketch(g)).toThrow(/tangence/);
  });
});
