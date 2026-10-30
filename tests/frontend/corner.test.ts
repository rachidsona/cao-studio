/** Congé et chanfrein de coin d'esquisse : forme, contraintes, cotes gardées, esquisse toujours résolue. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { centeredRectangle } from "../../frontend/src/document/sketch";
import { chamferCorner, cornerAt, filletCorner } from "../../frontend/src/sketcher/corner";
import { pointPos } from "../../frontend/src/sketcher/edit";

beforeAll(() => initSolver());

describe("coins d'esquisse", () => {
  it("un congé de 10 sur le coin d'un rectangle : arc tangent aux deux côtés, même liberté, cotes inchangées", () => {
    const g = centeredRectangle(80, 50); // p2 is the corner (40, -25)
    const before = solveSketch(g);
    const out = filletCorner(g, "p2", 10);
    if (typeof out === "string") throw new Error(out);
    const arc = out.curves.find((c) => c.kind === "arc");
    expect(arc && arc.kind === "arc" && arc.radius).toBe(10);
    // The arc's centre is 10 from both sides: (30, −15).
    expect(arc && arc.kind === "arc" && pointPos(out, arc.center).map((v) => Number(v.toFixed(6)))).toEqual([30, -15]);
    expect(out.constraints.filter((c) => c.kind === "perpendicular")).toHaveLength(2);
    const solved = solveSketch(out);
    expect(solved.state).toBe("ok");
    expect(solved.dof).toBe(before.dof);
    // The overall 80 × 50 stays: the lengths became distances from the virtual corner.
    expect(out.constraints.filter((c) => c.kind === "distance").map((c) => ("value" in c ? c.value : 0)).sort()).toEqual([50, 80]);
  });

  it("un chanfrein de 5 : une ligne entre les deux coupes, à 5 du coin sur chaque côté", () => {
    const g = centeredRectangle(80, 50);
    const out = chamferCorner(g, "p2", 5);
    if (typeof out === "string") throw new Error(out);
    expect(out.curves.filter((c) => c.kind === "line")).toHaveLength(5);
    const solved = solveSketch(out);
    expect(solved.state).toBe("ok");
    const chamfer = solved.geometry.curves.at(-1)!;
    const ends = chamfer.kind === "line" ? [chamfer.p1, chamfer.p2].map((id) => pointPos(solved.geometry, id).map((v) => Number(v.toFixed(6)))) : [];
    expect(ends).toEqual([[35, -25], [40, -20]]);
  });

  it("refuse ce qui n'est pas un coin, et une valeur trop grande", () => {
    const g = centeredRectangle(80, 50);
    expect(cornerAt(g, "nope")).toBeNull();
    expect(filletCorner(g, "p2", 60)).toMatch(/Trop grand/);
    expect(chamferCorner(g, "p2", 0)).toMatch(/positive/);
  });
});
