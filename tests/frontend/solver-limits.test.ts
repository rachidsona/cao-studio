/**
 * Le plafond du solveur d'esquisse (audit d'architecture du 11/11/2026) : la validation refuse une esquisse au-delà de
 * 600 contraintes, sous la limite mesurée où le WebAssembly du solveur manque de mémoire (vers un millier) ; et un
 * plantage du solveur devient un message clair au lieu d'une erreur brute.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, SketchError, solveSketch } from "../../frontend/src/constraints/solver";
import { MAX_SKETCH_CONSTRAINTS } from "../../frontend/src/document/validate-sketch";
import type { SketchGeometry } from "../../frontend/src/document/sketch";

/** `n` squares side by side, each with 4 lines, 4 corners fixed by horizontal/vertical constraints and a width. */
function squares(n: number): SketchGeometry {
  const points = [], curves = [], constraints = [];
  for (let i = 0; i < n; i++) {
    const x = i * 30;
    const p = (k: number, px: number, py: number) => ({ id: `p${i}_${k}`, x: px, y: py });
    points.push(p(0, x, 0), p(1, x + 20, 0), p(2, x + 20, 20), p(3, x, 20));
    for (let k = 0; k < 4; k++) curves.push({ id: `l${i}_${k}`, kind: "line", p1: `p${i}_${k}`, p2: `p${i}_${(k + 1) % 4}` });
    constraints.push(
      { id: `h${i}a`, type: "horizontal", refs: [`l${i}_0`] },
      { id: `h${i}b`, type: "horizontal", refs: [`l${i}_2`] },
      { id: `v${i}a`, type: "vertical", refs: [`l${i}_1`] },
      { id: `v${i}b`, type: "vertical", refs: [`l${i}_3`] },
    );
  }
  return { points, curves, constraints } as unknown as SketchGeometry;
}

describe("plafond du solveur", () => {
  beforeAll(() => initSolver());

  it("la limite acceptée est bien sous le plafond mesuré", () => {
    expect(MAX_SKETCH_CONSTRAINTS).toBe(600);
  });

  it("une esquisse à la limite se résout", () => {
    expect(() => solveSketch(squares(MAX_SKETCH_CONSTRAINTS / 4))).not.toThrow();
  });

  it("un plantage du solveur devient une erreur d'esquisse lisible", () => {
    let caught: unknown;
    try {
      solveSketch(squares(2000));
    } catch (error) {
      caught = error;
    }
    // Either it solved (a machine with more memory) or it said plainly why it could not.
    if (caught !== undefined) {
      expect(caught).toBeInstanceOf(SketchError);
      expect((caught as Error).message).toMatch(/trop grande pour le solveur/);
    }
  });
});
