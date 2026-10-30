/** Projection d'arêtes de corps dans une esquisse : exacte quand c'est possible, repères fixes à accrocher. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { sketchFrame } from "../../frontend/src/sketcher/frame";
import { projectEdge } from "../../frontend/src/sketcher/projection";

const xy = sketchFrame("XY", 0);
const circleSamples = (z: number, tilt = 0) =>
  Array.from({ length: 9 }, (_, i) => {
    const t = (2 * Math.PI * i) / 8;
    return [10 * Math.cos(t), 10 * Math.sin(t) * Math.cos(tilt), z + 10 * Math.sin(t) * Math.sin(tilt)] as [number, number, number];
  });

describe("projeter une arête", () => {
  it("une ligne devient une ligne fixe ; un point déjà projeté est repris", () => {
    const once = projectEdge(emptySketchGeometry(), { edges: [{ kind: "line", a: [0, 0, 5], b: [20, 0, 5] }], samples: [[0, 0, 5], [20, 0, 5]] }, xy);
    if (typeof once === "string") throw new Error(once);
    expect(once.curves).toEqual([expect.objectContaining({ kind: "line", projected: true, construction: true })]);
    expect(once.points.every((p) => p.fixed)).toBe(true);
    const twice = projectEdge(once, { edges: [{ kind: "line", a: [20, 0, 9], b: [20, 30, 9] }], samples: [[20, 0, 9], [20, 30, 9]] }, xy);
    if (typeof twice === "string") throw new Error(twice);
    expect(twice.points).toHaveLength(3); // (20, 0) shared
  });

  it("un cercle parallèle au plan reste un cercle exact ; incliné, il devient une suite de lignes", () => {
    const flat = projectEdge(emptySketchGeometry(), { edges: [{ kind: "circle", center: [0, 0, 30], radius: 10 }], samples: circleSamples(30) }, xy);
    expect(typeof flat !== "string" && flat.curves.map((c) => c.kind)).toEqual(["circle"]);
    const slanted = projectEdge(emptySketchGeometry(), { edges: [{ kind: "circle", center: [0, 0, 30], radius: 10 }], samples: circleSamples(30, 0.6) }, xy);
    expect(typeof slanted !== "string" && slanted.curves.every((c) => c.kind === "line")).toBe(true);
  });

  it("une arête vue de bout ne se projette pas", () => {
    expect(projectEdge(emptySketchGeometry(), { edges: [{ kind: "line", a: [5, 5, 0], b: [5, 5, 40] }], samples: [[5, 5, 0], [5, 5, 40]] }, xy)).toMatch(/vue de bout/);
  });
});
