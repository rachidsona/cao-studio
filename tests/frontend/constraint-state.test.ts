/** L'état des contraintes trait par trait (blanc figé, bleu libre) et « Contraindre tout ». */
import { beforeAll, describe, expect, it } from "vitest";
import { fixedCurves, fullyDefine } from "../../frontend/src/constraints/constraint-state";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, ORIGIN } from "../../frontend/src/document/sketch";
import { addCircle, addConstraint, addRectangle, pointPos } from "../../frontend/src/sketcher/edit";

beforeAll(() => initSolver());

const dof = (g: Parameters<typeof solveSketch>[0]) => solveSketch(g).dof;

describe("état des contraintes", () => {
  it("un rectangle sans cote : aucun trait figé", () => {
    const g = addRectangle(emptySketchGeometry(), { at: [10, 10] }, { at: [110, 60] }).geometry;
    expect(fixedCurves(g, dof(g))).toEqual(new Set());
  });

  it("un rectangle posé sur l'origine, sa largeur cotée : seul le bas est figé", () => {
    let g = addRectangle(emptySketchGeometry(), { pointId: ORIGIN }, { at: [100, 50] }).geometry;
    const bottom = g.curves.find((c) => c.kind === "line" && pointPos(g, c.p1)[1] === 0 && pointPos(g, c.p2)[1] === 0)!.id;
    g = addConstraint(g, { kind: "length", line: bottom, value: 100 } as never).geometry;
    expect(fixedCurves(g, dof(g))).toEqual(new Set([bottom]));
  });

  it("« Contraindre tout » fige le rectangle sans le bouger, puis tous ses traits sont figés", () => {
    const g = addRectangle(emptySketchGeometry(), { at: [10, 10] }, { at: [110, 60] }).geometry;
    const { geometry, count, dof: left } = fullyDefine(g);
    expect(left).toBe(0);
    expect(count).toBe(4);
    const solved = solveSketch(geometry);
    expect(solved.state).toBe("ok");
    expect(solved.dof).toBe(0);
    expect(solved.geometry.points.map((p) => [p.x, p.y])).toEqual(g.points.map((p) => [p.x, p.y]));
    expect(fixedCurves(geometry, 0)).toEqual(new Set(g.curves.map((c) => c.id)));
    // Lengths first: the width and the height, then the corner's place.
    expect(geometry.constraints.filter((c) => c.kind === "length")).toHaveLength(2);
  });

  it("un cercle libre : son diamètre et la place de son centre ; une esquisse déjà figée ne change pas", () => {
    const g = addCircle(emptySketchGeometry(), { at: [30, -20] }, 8).geometry;
    const { geometry, count } = fullyDefine(g);
    expect(count).toBe(3);
    expect(geometry.constraints.map((c) => c.kind).sort()).toEqual(["diameter", "distanceX", "distanceY"]);
    expect(fullyDefine(geometry).count).toBe(0);
  });
});
