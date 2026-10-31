/** Cotation automatique : chaînes et hors tout en X et Y, diamètres et rayons, cotes de référence remplacées. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry, type SketchGeometry } from "../../frontend/src/document/sketch";
import { AUTO_LABEL, autoDimensions } from "../../frontend/src/sketcher/auto-dimensions";

// A profile 600 wide: steps at x = 0, 200, 600 (heights 0…300), and a hole of Ø40.
const G: SketchGeometry = {
  ...emptySketchGeometry(),
  points: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 600, y: 0 },
    { id: "c", x: 600, y: 300 },
    { id: "d", x: 200, y: 300 },
    { id: "e", x: 200, y: 150 },
    { id: "f", x: 0, y: 150 },
    { id: "h", x: 400, y: 100 },
  ],
  curves: [
    { id: "l1", kind: "line", p1: "a", p2: "b" },
    { id: "l2", kind: "line", p1: "b", p2: "c" },
    { id: "l3", kind: "line", p1: "c", p2: "d" },
    { id: "l4", kind: "line", p1: "d", p2: "e" },
    { id: "l5", kind: "line", p1: "e", p2: "f" },
    { id: "l6", kind: "line", p1: "f", p2: "a" },
    { id: "k1", kind: "circle", center: "h", radius: 20 },
  ],
  constraints: [],
};

describe("cotation automatique", () => {
  beforeAll(() => initSolver());

  it("pose les chaînes et les hors tout en X et en Y, et le diamètre du trou, en cotes de référence", () => {
    const { geometry, count } = autoDimensions(G);
    const dims = geometry.constraints.map((c) => [c.kind, "value" in c ? c.value : null]);
    expect(dims).toEqual([
      ["distanceX", 200], ["distanceX", 400], ["distanceX", 600],
      ["distanceY", 150], ["distanceY", 150], ["distanceY", 300],
      ["diameter", 40],
    ]);
    expect(count).toBe(7);
    expect(geometry.constraints.every((c) => "driving" in c && c.driving === false && "label" in c && c.label === AUTO_LABEL)).toBe(true);
    // Measured, never imposed: the sketch solves as before.
    expect(solveSketch(geometry).state).not.toBe("conflicting");
  });

  it("relancée, remplace ses cotes au lieu de les doubler ; sur une sélection, ne cote qu'elle", () => {
    const once = autoDimensions(G).geometry;
    expect(autoDimensions(once).geometry.constraints).toHaveLength(7);
    const bottom = autoDimensions(G, new Set(["l1"]));
    expect(bottom.geometry.constraints.map((c) => [c.kind, "value" in c ? c.value : null])).toEqual([["distanceX", 600]]);
  });
});
