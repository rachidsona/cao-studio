/** Polygone et oblong de l'esquisse : forme exacte, liberté attendue, profil fermé extrudable. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { pointPos } from "../../frontend/src/sketcher/edit";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";
import { addPolygon, addSlot } from "../../frontend/src/sketcher/shapes";

beforeAll(() => initSolver());

describe("formes d'esquisse", () => {
  it("un hexagone régulier : six côtés égaux sur un cercle, libre en centre, taille et orientation", () => {
    const { geometry } = addPolygon(emptySketchGeometry(), [0, 0], [10, 0], 6);
    const solved = solveSketch(geometry);
    expect(solved.state).toBe("ok");
    expect(solved.dof).toBe(4);
    const sides = solved.geometry.curves.filter((c) => c.kind === "line" && !c.construction);
    expect(sides).toHaveLength(6);
    const lengths = sides.map((l) => (l.kind === "line" ? Math.hypot(...pointPos(solved.geometry, l.p1).map((v, i) => v - pointPos(solved.geometry, l.p2)[i]!)) : 0));
    lengths.forEach((l) => expect(l).toBeCloseTo(10, 6));
    expect(sketchFaces(extractLoops(solved.geometry))).toHaveLength(1);
  });

  it("un oblong de centre à centre : deux demi-cercles et deux côtés, libre en centres et largeur", () => {
    const slot = addSlot(emptySketchGeometry(), [0, 0], [40, 0], 10);
    if (typeof slot === "string") throw new Error(slot);
    const solved = solveSketch(slot.geometry);
    expect(solved.state).toBe("ok");
    expect(solved.dof).toBe(5);
    const arcs = solved.geometry.curves.filter((c) => c.kind === "arc");
    expect(arcs.map((a) => (a.kind === "arc" ? Number(a.radius.toFixed(6)) : 0))).toEqual([5, 5]);
    const faces = sketchFaces(extractLoops(solved.geometry));
    expect(faces).toHaveLength(1);
    expect(addSlot(emptySketchGeometry(), [0, 0], [0, 0], 10)).toMatch(/confondus/);
  });
});
