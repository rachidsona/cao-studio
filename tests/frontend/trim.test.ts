/** Couper (Trim) in the sketch: the part of a curve between the crossings under the pointer goes. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { pointPos } from "../../frontend/src/sketcher/edit";
import { applyTrim, findTrim, type Trim } from "../../frontend/src/sketcher/trim";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A horizontal line h at y = 50 crossed by two vertical lines v1 (x = 30) and v2 (x = 70). */
function hash(): SketchGeometry {
  return {
    points: [
      { id: "h1", x: 0, y: 50 }, { id: "h2", x: 100, y: 50 },
      { id: "a1", x: 30, y: 0 }, { id: "a2", x: 30, y: 100 },
      { id: "b1", x: 70, y: 0 }, { id: "b2", x: 70, y: 100 },
    ],
    curves: [
      { id: "h", kind: "line", p1: "h1", p2: "h2" },
      { id: "v1", kind: "line", p1: "a1", p2: "a2" },
      { id: "v2", kind: "line", p1: "b1", p2: "b2" },
    ],
    constraints: [{ id: "k1", kind: "horizontal", line: "h" }],
  };
}

const trimAt = (g: SketchGeometry, id: string, at: [number, number]): Trim => {
  const t = findTrim(g, id, at);
  if (!t || typeof t === "string") throw new Error(String(t));
  return t;
};
const ends = (g: SketchGeometry, id: string) => {
  const c = g.curves.find((x) => x.id === id);
  return c?.kind === "line" ? [pointPos(g, c.p1), pointPos(g, c.p2)].map((p) => p.map((v) => Number(v.toFixed(6)))) : null;
};

describe("couper une ligne", () => {
  it("entre deux croisements : la ligne devient deux lignes, aux croisements, tenues sur les lignes qui coupent", () => {
    const g = hash();
    const trim = trimAt(g, "h", [50, 50]);
    expect(trim.preview.lines).toEqual([[[30, 50], [70, 50]]]);
    const out = applyTrim(g, trim);
    const lines = out.curves.filter((c) => c.kind === "line" && c.id !== "v1" && c.id !== "v2");
    expect(lines).toHaveLength(2);
    expect(ends(out, "h")).toEqual([[0, 50], [30, 50]]);
    const twin = lines.find((c) => c.id !== "h")!;
    expect(ends(out, twin.id)).toEqual([[70, 50], [100, 50]]);
    const onCurve = out.constraints.filter((c) => c.kind === "pointOnCurve").map((c) => (c.kind === "pointOnCurve" ? c.curve : ""));
    expect(onCurve.sort()).toEqual(["v1", "v2"]);
    // The horizontal constraint holds for both pieces; the sketch still solves.
    expect(out.constraints.filter((c) => c.kind === "horizontal")).toHaveLength(2);
    expect(solveSketch(out).state).not.toBe("failed");
  });

  it("d'un côté sans croisement : la ligne est raccourcie jusqu'au croisement", () => {
    const g = hash();
    const out = applyTrim(g, trimAt(g, "h", [10, 50]));
    expect(ends(out, "h")).toEqual([[30, 50], [100, 50]]);
    expect(out.curves).toHaveLength(3);
    // The end that was cut away is gone with its point.
    expect(out.points.find((p) => p.id === "h1")).toBeUndefined();
  });

  it("sans aucun croisement : la ligne entière est supprimée, avec ses points et ses contraintes", () => {
    const g = hash();
    const out = applyTrim(g, trimAt(g, "v1", [30, 10]));
    // v1 crosses h at (30, 50): trimming at y = 10 only removes the part below the crossing.
    expect(ends(out, "v1")).toEqual([[30, 50], [30, 100]]);
    const alone: SketchGeometry = { points: [{ id: "p", x: 0, y: 0 }, { id: "q", x: 5, y: 0 }], curves: [{ id: "l", kind: "line", p1: "p", p2: "q" }], constraints: [{ id: "c", kind: "horizontal", line: "l" }] };
    const gone = applyTrim(alone, trimAt(alone, "l", [2, 0]));
    expect(gone.curves).toHaveLength(0);
    expect(gone.points).toHaveLength(0);
    expect(gone.constraints).toHaveLength(0);
  });

  it("une cote de longueur est retirée (sa valeur n'est plus celle de la ligne) ; un point sur la partie coupée n'est plus tenu sur elle", () => {
    const g = hash();
    g.constraints.push({ id: "d", kind: "length", line: "h", value: 100 } as never);
    g.points.push({ id: "m", x: 50, y: 50 });
    g.constraints.push({ id: "poc", kind: "pointOnCurve", point: "m", curve: "h" } as never);
    const out = applyTrim(g, trimAt(g, "h", [50, 50]));
    expect(out.constraints.some((c) => c.id === "d")).toBe(false);
    expect(out.constraints.some((c) => c.id === "poc")).toBe(false);
  });

  it("une coupe à un point existant le réutilise comme extrémité, sans contrainte de plus", () => {
    const g = hash();
    g.points.push({ id: "x", x: 30, y: 50 });
    g.curves.push({ id: "stub", kind: "line", p1: "x", p2: "a1" });
    const out = applyTrim(g, trimAt(g, "h", [10, 50]));
    const h = out.curves.find((c) => c.id === "h");
    expect(h?.kind === "line" && h.p1).toBe("x");
  });

  it("les courbes de construction et projetées ne se coupent pas", () => {
    const g = hash();
    (g.curves[0] as { construction?: boolean }).construction = true;
    expect(findTrim(g, "h", [50, 50])).toBeNull();
    const projected = hash();
    (projected.curves[0] as { projected?: boolean }).projected = true;
    expect(findTrim(projected, "h", [50, 50])).toMatch(/projetée/);
  });
});

describe("couper un arc et un cercle", () => {
  it("un arc coupé au milieu devient deux arcs", () => {
    const g: SketchGeometry = {
      points: [{ id: "c", x: 0, y: 0 }, { id: "s", x: 100, y: 0 }, { id: "e", x: -100, y: 0 }, { id: "p", x: 70.7107, y: -10 }, { id: "q", x: 70.7107, y: 10 }, { id: "r", x: -70.7107, y: -10 }, { id: "u", x: -70.7107, y: 10 }],
      curves: [
        { id: "arc", kind: "arc", center: "c", start: "s", end: "e", radius: 100, startAngle: 0, endAngle: Math.PI },
        { id: "x1", kind: "line", p1: "p", p2: "q" },
        { id: "x2", kind: "line", p1: "r", p2: "u" },
      ],
      constraints: [],
    };
    // Make the two cutting lines really cross the arc: x = ±70.7107 at height 70.7107 (angle 45° and 135°).
    g.points.find((p) => p.id === "p")!.y = 60;
    g.points.find((p) => p.id === "q")!.y = 80;
    g.points.find((p) => p.id === "r")!.y = 60;
    g.points.find((p) => p.id === "u")!.y = 80;
    const trim = trimAt(g, "arc", [0, 100]);
    const out = applyTrim(g, trim);
    const arcs = out.curves.filter((c) => c.kind === "arc");
    expect(arcs).toHaveLength(2);
    const [first, second] = arcs as Extract<(typeof arcs)[number], { kind: "arc" }>[];
    expect(first!.endAngle).toBeCloseTo(Math.PI / 4, 3);
    expect(second!.startAngle).toBeCloseTo((3 * Math.PI) / 4, 3);
  });

  it("un cercle coupé entre deux croisements devient l'arc qui reste ; avec un seul croisement, une raison", () => {
    const g: SketchGeometry = {
      points: [{ id: "c", x: 0, y: 0 }, { id: "p", x: -200, y: 0 }, { id: "q", x: 200, y: 0 }, { id: "r", x: 0, y: -200 }],
      curves: [{ id: "ring", kind: "circle", center: "c", radius: 100 }, { id: "bar", kind: "line", p1: "p", p2: "q" }],
      constraints: [],
    };
    // The bar crosses the circle at (-100, 0) and (100, 0): cutting above it removes the upper half.
    const out = applyTrim(g, trimAt(g, "ring", [0, 100]));
    const ring = out.curves.find((c) => c.id === "ring");
    expect(ring?.kind).toBe("arc");
    if (ring?.kind === "arc") {
      expect(ring.startAngle).toBeCloseTo(Math.PI, 6);
      expect(ring.endAngle).toBeCloseTo(2 * Math.PI, 6);
    }
    const one = structuredClone(g);
    one.points.find((p) => p.id === "p")!.x = 0;
    one.points.find((p) => p.id === "p")!.y = 0;
    one.points.find((p) => p.id === "q")!.x = 0;
    one.points.find((p) => p.id === "q")!.y = 300;
    expect(findTrim(one, "ring", [0, 100])).toMatch(/entre deux croisements/);
  });

  it("un cercle sans croisement est supprimé en entier", () => {
    const g: SketchGeometry = { points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "ring", kind: "circle", center: "c", radius: 10 }], constraints: [] };
    const out = applyTrim(g, trimAt(g, "ring", [10, 0]));
    expect(out.curves).toHaveLength(0);
    expect(out.points).toHaveLength(0);
  });
});
