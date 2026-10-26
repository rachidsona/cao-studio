/** Extend (Prolonger), as in Fusion: the end nearest the pointer goes to the first curve it meets, and stays on it. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import { applyExtension, findExtension, type Extension } from "../../frontend/src/sketcher/extend";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const pos = (g: SketchGeometry, id: string) => pointPos(g, id).map((v) => Number(v.toFixed(6)));

/** Line l1 a(0,0)–b(5,0), plus the given extra lines (id, from, to). */
function sketch(...lines: [string, [number, number], [number, number]][]): SketchGeometry {
  const g: SketchGeometry = { points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 5, y: 0 }], curves: [{ id: "l1", kind: "line", p1: "a", p2: "b" }], constraints: [] };
  for (const [id, p, q] of lines) {
    g.points.push({ id: `${id}s`, x: p[0], y: p[1] }, { id: `${id}e`, x: q[0], y: q[1] });
    g.curves.push({ id, kind: "line", p1: `${id}s`, p2: `${id}e` });
  }
  return g;
}

describe("prolonger une ligne", () => {
  it("l'extrémité la plus proche du pointeur va jusqu'à la première courbe rencontrée, et y reste liée", () => {
    const g = sketch(["far", [20, -5], [20, 5]], ["near", [10, -5], [10, 5]]);
    const ext = findExtension(g, "l1", [4.5, 0.2]) as Extension;
    expect(ext).toMatchObject({ pointId: "b", target: "near" });
    expect(ext.to.map((v) => Number(v.toFixed(6)))).toEqual([10, 0]);
    expect(ext.preview.lines).toHaveLength(1);
    const next = applyExtension(g, ext);
    expect(pos(next, "b")).toEqual([10, 0]);
    expect(next.constraints).toContainEqual(expect.objectContaining({ kind: "pointOnCurve", point: "b", curve: "near" }));
    const solved = solveSketch(next);
    expect(solved.state).not.toBe("conflicting");
    expect(pos(solved.geometry, "b")).toEqual([10, 0]);
  });

  it("prolongé une 2e fois, le trait traverse la ligne atteinte sans la déplacer ni l'effacer", () => {
    const g = sketch(["near", [10, -5], [10, 5]], ["far", [20, -5], [20, 5]]);
    const once = solveSketch(applyExtension(g, findExtension(g, "l1", [4.5, 0.2]) as Extension)).geometry;
    expect(pos(once, "b")).toEqual([10, 0]);
    const ext = findExtension(once, "l1", [9.5, 0.2]) as Extension;
    expect(ext).toMatchObject({ pointId: "b", target: "far" });
    const twice = applyExtension(once, ext);
    // The end left "near": it is no longer tied to it.
    expect(twice.constraints.filter((c) => c.kind === "pointOnCurve" && c.point === "b").map((c) => (c.kind === "pointOnCurve" ? c.curve : ""))).toEqual(["far"]);
    const solved = solveSketch(twice);
    expect(solved.state).not.toBe("conflicting");
    expect(pos(solved.geometry, "b")).toEqual([20, 0]);
    expect([pos(solved.geometry, "nears"), pos(solved.geometry, "neare")]).toEqual([[10, -5], [10, 5]]); // the line crossed stays put
    expect(solved.geometry.curves.map((c) => c.id)).toEqual(["l1", "near", "far"]);
  });

  it("de l'autre côté, ou si le segment visé n'est pas sur le chemin, rien n'est atteint", () => {
    const g = sketch(["v", [10, 2], [10, 5]]);
    expect(findExtension(g, "l1", [4.5, 0])).toMatch(/Aucune courbe/);
    expect(findExtension(sketch(["v", [10, -5], [10, 5]]), "l1", [0.5, 0])).toMatch(/Aucune courbe/);
  });

  it("atteint aussi un cercle (son premier point sur le chemin)", () => {
    const g: SketchGeometry = { ...sketch(), points: [...sketch().points, { id: "c", x: 20, y: 0 }], curves: [...sketch().curves, { id: "k", kind: "circle", center: "c", radius: 4 }] };
    const ext = findExtension(g, "l1", [5, 0]) as Extension;
    expect(ext.target).toBe("k");
    expect(ext.to.map((v) => Number(v.toFixed(6)))).toEqual([16, 0]);
  });

  it("une extrémité reliée (un coin) se prolonge aussi : elle se détache, l'autre courbe garde le coin", () => {
    // Rectangle (0,0)–(10,5) and a vertical line at x = 20: the bottom side l1 goes through the corner to x = 20.
    const base = addRectangle({ points: [], curves: [], constraints: [] }, { at: [0, 0] }, { at: [10, 5] }).geometry;
    const g: SketchGeometry = { ...base, points: [...base.points, { id: "v1", x: 20, y: -5 }, { id: "v2", x: 20, y: 5 }], curves: [...base.curves, { id: "v", kind: "line", p1: "v1", p2: "v2" }] };
    const ext = findExtension(g, "l1", [9, 0]) as Extension;
    expect(ext).toMatchObject({ target: "v", detach: true });
    const next = applyExtension(g, ext);
    const l1 = next.curves.find((c) => c.id === "l1");
    const l2 = next.curves.find((c) => c.id === "l2");
    if (l1?.kind !== "line" || l2?.kind !== "line") throw new Error("lines expected");
    expect(pos(next, l1.p2)).toEqual([20, 0]);
    expect(l2.p1).not.toBe(l1.p2); // the right side keeps the old corner
    expect(pos(next, l2.p1)).toEqual([10, 0]);
    const solved = solveSketch(next);
    expect(solved.state).not.toBe("conflicting");
    expect(pos(solved.geometry, l1.p2)).toEqual([20, 0]);
  });

  it("un point fixe ne se prolonge pas ; un cercle n'a pas d'extrémité", () => {
    const fixed: SketchGeometry = { ...sketch(["v", [10, -5], [10, 5]]), points: sketch(["v", [10, -5], [10, 5]]).points.map((p) => (p.id === "b" ? { ...p, fixed: true } : p)) };
    expect(findExtension(fixed, "l1", [5, 0])).toMatch(/fixe/);
    const circle: SketchGeometry = { points: [{ id: "c", x: 0, y: 0 }], curves: [{ id: "k", kind: "circle", center: "c", radius: 3 }], constraints: [] };
    expect(findExtension(circle, "k", [3, 0])).toBeNull();
  });
});

describe("prolonger un arc", () => {
  it("l'arc continue sur son cercle jusqu'à la courbe rencontrée", () => {
    // Arc of radius 10 from (10,0) to (0,10), counter-clockwise; a vertical line at x = −6 crosses its circle at y = ±8.
    const g: SketchGeometry = {
      points: [{ id: "o", x: 0, y: 0 }, { id: "s", x: 10, y: 0 }, { id: "e", x: 0, y: 10 }, { id: "v1", x: -6, y: -20 }, { id: "v2", x: -6, y: 20 }],
      curves: [
        { id: "a1", kind: "arc", center: "o", start: "s", end: "e", radius: 10, startAngle: 0, endAngle: Math.PI / 2 },
        { id: "v", kind: "line", p1: "v1", p2: "v2" },
      ],
      constraints: [],
    };
    const ext = findExtension(g, "a1", [1, 9.5]) as Extension;
    expect(ext).toMatchObject({ pointId: "e", target: "v" });
    expect(ext.to.map((v) => Number(v.toFixed(6)))).toEqual([-6, 8]);
    expect(ext.angle?.which).toBe("endAngle");
    const solved = solveSketch(applyExtension(g, ext));
    expect(solved.state).not.toBe("conflicting");
    expect(pos(solved.geometry, "e")).toEqual([-6, 8]);
    expect(pos(solved.geometry, "s")).toEqual([10, 0]); // the other end stays
  });
});
