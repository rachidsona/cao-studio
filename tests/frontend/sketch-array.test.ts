/** Rectangular pattern inside a sketch: copies of the selected elements over a grid. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import { ORIGIN, type SketchGeometry } from "../../frontend/src/document/sketch";
import { addCircle, addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import { arrayElements, copiedElements, gridOffsets, type SketchGrid } from "../../frontend/src/sketcher/sketch-array";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
const rect = () => addRectangle(empty(), { at: [0, 0] }, { at: [40, 30] });
const grid = (count1: number, count2: number): SketchGrid => ({ step1: [50, 0], count1, step2: [0, 40], count2 });

describe("grille", () => {
  it("les décalages : 3 × 2 sans l'original, rangée par rangée", () => {
    expect(gridOffsets(grid(2, 1))).toEqual([[50, 0], [100, 0], [0, 40], [50, 40], [100, 40]]);
    expect(gridOffsets({ step1: [10, 5], count1: 1, step2: [0, 0], count2: 0 })).toEqual([[10, 5]]);
    expect(gridOffsets(grid(0, 0))).toEqual([]);
  });
});

describe("copie d'un rectangle", () => {
  const { geometry, created } = rect();

  it("quatre côtés choisis : leurs quatre points sont copiés avec eux", () => {
    const { curves, points } = copiedElements(geometry, new Set(created));
    expect(curves).toHaveLength(4);
    expect(points).toHaveLength(4);
  });

  it("3 × 2 : cinq copies, chacune avec ses points, ses côtés et ses contraintes H/V ; l'original ne bouge pas", () => {
    const out = arrayElements(geometry, new Set(created), grid(2, 1));
    if (!out.ok) throw new Error(out.reason);
    expect(out.copies).toBe(5);
    expect(out.geometry.points).toHaveLength(4 * 6);
    expect(out.geometry.curves).toHaveLength(4 * 6);
    expect(out.geometry.constraints).toHaveLength(4 * 6);
    expect(out.preview.lines).toHaveLength(20);
    expect(geometry.points.map((p) => [p.x, p.y])).toEqual([[0, 0], [40, 0], [40, 30], [0, 30]]);
    // The last copy is at (100, 40) from the original.
    const last = out.geometry.points.slice(-4).map((p) => [p.x, p.y]);
    expect(last).toEqual([[100, 40], [140, 40], [140, 70], [100, 70]]);
    // Every id is unique and the sketch still solves.
    const ids = [...out.geometry.points, ...out.geometry.curves, ...out.geometry.constraints].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(solveSketch(out.geometry).state).not.toBe("failed");
  });

  it("un cercle et un point seul : copiés, centre compris ; les côtés non choisis restent", () => {
    const circle = addCircle(geometry, { at: [200, 200] }, 10);
    const withPoint: SketchGeometry = { ...circle.geometry, points: [...circle.geometry.points, { id: "solo", x: 5, y: 5 }] };
    const out = arrayElements(withPoint, new Set([...circle.created, "solo"]), { step1: [30, 0], count1: 1, step2: [0, 0], count2: 0 });
    if (!out.ok) throw new Error(out.reason);
    expect(out.geometry.curves.filter((c) => c.kind === "circle")).toHaveLength(2);
    expect(out.geometry.points.find((p) => p.x === 35 && p.y === 5)).toBeTruthy();
    expect(out.geometry.curves.filter((c) => c.kind === "line")).toHaveLength(4);
  });

  it("une courbe qui passe par l'origine : l'origine est copiée en un vrai point, pas liée", () => {
    const g: SketchGeometry = { points: [{ id: "a", x: 10, y: 0 }], curves: [{ id: "l1", kind: "line", p1: ORIGIN, p2: "a" }], constraints: [] };
    const out = arrayElements(g, new Set(["l1"]), { step1: [0, 20], count1: 1, step2: [0, 0], count2: 0 });
    if (!out.ok) throw new Error(out.reason);
    const copy = out.geometry.curves.find((c) => c.id !== "l1");
    expect(copy && copy.kind === "line" && pointPos(out.geometry, copy.p1)).toEqual([0, 20]);
  });

  it("les contraintes qui touchent l'origine ou une courbe non copiée ne sont pas copiées", () => {
    const g = structuredClone(geometry);
    g.constraints.push({ id: "d1", kind: "distanceX", a: ORIGIN, b: g.points[0]!.id, value: 0 } as never);
    const out = arrayElements(g, new Set(created), grid(1, 0));
    if (!out.ok) throw new Error(out.reason);
    expect(out.geometry.constraints.filter((c) => c.kind === "distanceX")).toHaveLength(1);
  });

  it("des erreurs lisibles : rien de choisi, pas de copie, pas nul, trop de copies", () => {
    const none = arrayElements(geometry, new Set(), grid(1, 0));
    expect(none.ok === false && none.reason).toMatch(/Cliquez/);
    const zero = arrayElements(geometry, new Set(created), grid(0, 0));
    expect(zero.ok === false && zero.reason).toMatch(/quantité/);
    const flat = arrayElements(geometry, new Set(created), { step1: [0, 0], count1: 2, step2: [0, 0], count2: 0 });
    expect(flat.ok === false && flat.reason).toMatch(/nul/);
    const many = arrayElements(geometry, new Set(created), grid(30, 30));
    expect(many.ok === false && many.reason).toMatch(/Trop/);
  });
});
