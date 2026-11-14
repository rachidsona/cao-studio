/** Cotes de rayon, de diamètre, d'angle et en chaîne dans l'esquisse. */
import { beforeAll, describe, expect, it } from "vitest";
import { classify, COMMANDS } from "../../frontend/src/constraints/catalog";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { chainDimensions, pointsOnSide } from "../../frontend/src/sketcher/chain-dims";
import { addCircle, addConstraint, addLine, addRectangle, pointPos } from "../../frontend/src/sketcher/edit";

beforeAll(() => initSolver());

/** A side of 600 × 2000 with two shelves resting on its right side, at 400 and 900. */
function cabinet(): { g: SketchGeometry; right: string } {
  let g = addRectangle(emptySketchGeometry(), { at: [0, 0] }, { at: [600, 2000] }).geometry;
  const right = g.curves.find((c) => c.kind === "line" && pointPos(g, c.p1)[0] === 600 && pointPos(g, c.p2)[0] === 600)!.id;
  for (const y of [400, 900]) g = addLine(g, { at: [0, y] }, { at: [600, y] }).geometry;
  return { g, right };
}
const command = (id: string) => COMMANDS.find((c) => c.id === id)!;

describe("cotes en chaîne", () => {
  it("un côté seul : ses points, d'un bout à l'autre", () => {
    const { g, right } = cabinet();
    const ys = pointsOnSide(g, right).map((id) => pointPos(g, id)[1]);
    expect(ys).toEqual([0, 400, 900, 2000]);
    // In a row clear of the drawing.
    const dims = chainDimensions(g, { points: [], lines: [right], circles: [], arcs: [] });
    expect(dims.map((d) => [d.kind, (d as unknown as { value: number }).value])).toEqual([
      ["distanceY", 400],
      ["distanceY", 500],
      ["distanceY", 1100],
    ]);
    expect(dims.every((d) => (d as { driving?: boolean }).driving !== false)).toBe(true);
  });

  it("la hauteur déjà cotée : la dernière cote de la chaîne est de référence, l'esquisse reste juste", () => {
    const { g: base, right } = cabinet();
    const g = addConstraint(base, { kind: "length", line: right, value: 2000 } as never).geometry;
    const dims = chainDimensions(g, { points: [], lines: [right], circles: [], arcs: [] });
    expect(dims.map((d) => (d as { driving?: boolean }).driving)).toEqual([undefined, undefined, false]);
    let all = g;
    for (const d of dims) all = addConstraint(all, d).geometry;
    expect(solveSketch(all).state).toBe("ok");
  });

  it("plusieurs éléments : les centres des cercles le long de l'axe où ils s'étalent", () => {
    let g = emptySketchGeometry();
    for (const [x, y] of [[700, 37], [100, 40], [300, 37]] as [number, number][]) g = addCircle(g, { at: [x, y] }, 2.5).geometry;
    const circles = g.curves.map((c) => c.id);
    const dims = chainDimensions(g, { points: [], lines: [], circles, arcs: [] });
    expect(dims.map((d) => [d.kind, (d as unknown as { value: number }).value])).toEqual([
      ["distanceX", 200],
      ["distanceX", 400],
    ]);
    // Three clicked circles make the command apply (it waits for them).
    expect(command("dimChain").applies(classify(g, circles))).toBe(true);
    expect(command("dimChain").applies(classify(g, circles.slice(0, 2)))).toBe(false);
  });
});

describe("cotes de rayon, de diamètre et d'angle", () => {
  it("un cercle coté en rayon, un arc en diamètre", () => {
    const g = addCircle(emptySketchGeometry(), { at: [0, 0] }, 40).geometry;
    const sel = classify(g, [g.curves[0]!.id]);
    expect(command("dimRadius").build(sel, g)).toEqual([{ kind: "radius", curve: g.curves[0]!.id, value: 40 }]);
    expect(command("dimDiameter").build(sel, g)).toEqual([{ kind: "diameter", curve: g.curves[0]!.id, value: 80 }]);
  });

  it("l'angle de deux lignes ; deux parallèles sont refusées", () => {
    let g = addLine(emptySketchGeometry(), { at: [0, 0] }, { at: [100, 0] }).geometry;
    g = addLine(g, { at: [0, 0] }, { at: [50, 50] }, { autoAlign: false }).geometry;
    g = addLine(g, { at: [0, 20] }, { at: [100, 20] }).geometry;
    const [h, slant, parallel] = g.curves.map((c) => c.id) as [string, string, string];
    const [angle] = command("dimAngle").build(classify(g, [h, slant]), g) as { kind: string; value: number }[];
    expect(angle!.kind).toBe("angle");
    expect(Math.abs(angle!.value)).toBeCloseTo(45, 6);
    expect(() => command("dimAngle").build(classify(g, [h, parallel]), g)).toThrow(/parallèles/);
  });
});
