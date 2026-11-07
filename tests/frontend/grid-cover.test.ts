/** La grille de la vue couvre ce qui est dans le modèle, sans quitter les multiples de son pas. */
import { describe, expect, it } from "vitest";
import { gridCover } from "../../frontend/src/viewport/grid";

describe("la grille", () => {
  it("reste autour de l'origine sans rien à couvrir", () => {
    expect(gridCover(null, 100)).toEqual({ center: [0, 0], cells: 40 });
  });

  it("couvre un plan qui part loin de l'origine, et l'origine", () => {
    const step = 100;
    const area: [number, number, number, number] = [0, -5000, 7000, 600];
    const { center, cells } = gridCover(area, step);
    const half = (cells * step) / 2;
    expect(center[0] - half).toBeLessThanOrEqual(0);
    expect(center[0] + half).toBeGreaterThanOrEqual(7000);
    expect(center[1] - half).toBeLessThanOrEqual(-5000);
    expect(center[1] + half).toBeGreaterThanOrEqual(600);
    expect(cells % 2).toBe(0);
    expect(center.every((c) => Math.abs(c % step) < 1e-9)).toBe(true);
  });

  it("limite les lignes vu de très près", () => {
    expect(gridCover([0, 0, 100000, 100000], 1).cells).toBe(600);
  });
});
