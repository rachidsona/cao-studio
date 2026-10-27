/** Couper (Break) in the sketch: a curve is cut into pieces at the crossings round the pointer, nothing is removed. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { applyBreak, findBreak, type Break } from "../../frontend/src/sketcher/break";
import { pointPos } from "../../frontend/src/sketcher/edit";
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
    constraints: [
      { id: "k1", kind: "horizontal", line: "h" },
      { id: "k2", kind: "length", line: "h", value: 100 } as SketchGeometry["constraints"][number],
    ],
  };
}

const breakAt = (g: SketchGeometry, id: string, at: [number, number]): Break => {
  const b = findBreak(g, id, at);
  if (!b || typeof b === "string") throw new Error(String(b));
  return b;
};
const round = (p: [number, number]) => p.map((v) => Number(v.toFixed(6)));
const lineEnds = (g: SketchGeometry, id: string) => {
  const c = g.curves.find((x) => x.id === id);
  return c?.kind === "line" ? [round(pointPos(g, c.p1)), round(pointPos(g, c.p2))] : null;
};

describe("couper (Break)", () => {
  it("entre deux croisements : la ligne devient trois lignes qui se suivent, rien n'est supprimé", () => {
    const g = hash();
    const cut = breakAt(g, "h", [50, 50]);
    expect(cut.marks.map(round)).toEqual([[30, 50], [70, 50]]);
    expect(cut.preview.lines).toEqual([[[30, 50], [70, 50]]]);
    const out = applyBreak(g, cut);
    const pieces = out.curves.filter((c) => c.id !== "v1" && c.id !== "v2");
    expect(pieces).toHaveLength(3);
    expect(pieces.map((c) => lineEnds(out, c.id))).toEqual([
      [[0, 50], [30, 50]],
      [[30, 50], [70, 50]],
      [[70, 50], [100, 50]],
    ]);
    // Each piece stays horizontal; the length of the whole line no longer applies.
    expect(out.constraints.filter((c) => c.kind === "horizontal")).toHaveLength(3);
    expect(out.constraints.some((c) => c.kind === "length")).toBe(false);
    // The cut points are kept on the lines that cross.
    expect(out.constraints.filter((c) => c.kind === "pointOnCurve").map((c) => (c.kind === "pointOnCurve" ? c.curve : "")).sort()).toEqual(["v1", "v2"]);
    expect(solveSketch(out).state).not.toBe("failed");
  });

  it("d'un côté sans croisement : la ligne devient deux lignes", () => {
    const g = hash();
    const cut = breakAt(g, "h", [10, 50]);
    expect(cut.marks.map(round)).toEqual([[30, 50]]);
    const out = applyBreak(g, cut);
    expect(out.curves.filter((c) => c.id !== "v1" && c.id !== "v2").map((c) => lineEnds(out, c.id))).toEqual([
      [[0, 50], [30, 50]],
      [[30, 50], [100, 50]],
    ]);
  });

  it("une courbe que rien ne croise ne se coupe pas", () => {
    const g: SketchGeometry = { points: [{ id: "p1", x: 0, y: 0 }, { id: "p2", x: 10, y: 0 }], curves: [{ id: "l", kind: "line", p1: "p1", p2: "p2" }], constraints: [] };
    expect(findBreak(g, "l", [5, 0])).toMatch(/pas d'endroit/);
  });

  it("un cercle croisé deux fois devient deux arcs qui font le tour", () => {
    const g: SketchGeometry = {
      points: [{ id: "c", x: 0, y: 0 }, { id: "p1", x: -20, y: 0 }, { id: "p2", x: 20, y: 0 }],
      curves: [
        { id: "o", kind: "circle", center: "c", radius: 10 },
        { id: "l", kind: "line", p1: "p1", p2: "p2" },
      ],
      constraints: [{ id: "k1", kind: "diameter", curve: "o", value: 20 } as SketchGeometry["constraints"][number]],
    };
    const out = applyBreak(g, breakAt(g, "o", [0, 10]));
    const arcs = out.curves.filter((c) => c.kind === "arc");
    expect(arcs).toHaveLength(2);
    expect(out.curves.some((c) => c.kind === "circle")).toBe(false);
    const sweep = (c: (typeof arcs)[number]) => (c.kind === "arc" ? c.endAngle - c.startAngle : 0);
    // The upper half (under the pointer) and the lower half, together the whole circle.
    expect(arcs.map(sweep).map((s) => Number(s.toFixed(6)))).toEqual([Number(Math.PI.toFixed(6)), Number(Math.PI.toFixed(6))]);
    expect(arcs[0]?.kind === "arc" && round(pointPos(out, arcs[0].start))).toEqual([10, 0]);
    // The two halves repeat each other's rules: not reported to the user as redundant.
    expect(solveSketch(out).state).toBe("ok");
  });
});
