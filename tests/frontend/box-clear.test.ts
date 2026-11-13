/** Un meuble déplacé ne se pose pas dans un autre : il est remis à côté, au ras. */
import { describe, expect, it } from "vitest";
import { clearOf } from "../../frontend/src/features/box-clear";
import type { Box } from "../../frontend/src/features/smart-align";

/** A column 600 wide, 560 deep, 2150 high, at x = 0. */
const column: Box = [[0, 0, 0], [600, 560, 2150]];
/** Base units 870 high from x = 600 to 2400, wall units over them, a wall behind, a plinth under it all. */
const base: Box = [[600, 0, 0], [2400, 560, 870]];
const wallUnits: Box = [[600, 210, 1400], [2400, 560, 2100]];
const wall: Box = [[-100, 560, 0], [3000, 660, 2500]];
const plinth: Box = [[0, 20, 0], [2400, 38, 150]];
const others = [base, wallUnits, wall, plinth];

describe("un meuble déplacé reste hors des autres", () => {
  it("garde le déplacement quand la place est libre, et ce qu'il touche ne le gêne pas", () => {
    expect(clearOf(column, others, [-300, 0, 0], [0])).toEqual([-300, 0, 0]);
    // Against the wall, on the plinth that runs under it, beside the base units: where it is, it is clear.
    expect(clearOf(column, others, [0, 0, 0], [0])).toEqual([0, 0, 0]);
  });

  it("poussé dans les meubles voisins, il est remis à côté d'eux, du côté le plus proche", () => {
    // 150 mm into the base and wall units: back against their side.
    expect(clearOf(column, others, [150, 0, 0], [0])).toEqual([0, 0, 0]);
    // More than half past their far end: out beyond it; less: back where it comes from.
    expect(clearOf(column, others, [2150, 0, 0], [0])).toEqual([2400, 0, 0]);
    expect(clearOf(column, others, [1700, 0, 0], [0])).toEqual([0, 0, 0]);
  });

  it("une place prise aussi est passée : la suivante", () => {
    // Another column 400 mm from the units: no room for it between them, it stops before that column.
    const other: Box = [[-400, 0, 0], [200, 560, 2150]];
    const far: Box = [[-2000, 0, 0], [-1400, 560, 2150]];
    expect(clearOf(far, [...others, other], [2100, 0, 0], [0])).toEqual([1000, 0, 0]);
    // Between two columns too near each other: no place between them, beyond the nearest.
    const left: Box = [[-700, 0, 0], [400, 560, 2150]];
    const right: Box = [[900, 0, 0], [1500, 560, 2150]];
    expect(clearOf([[2000, 0, 0], [2600, 560, 2150]], [left, right], [-1500, 0, 0], [0])).toEqual([-500, 0, 0]);
  });

  it("serré entre ses voisins et le mur du bout, il reste à sa place plutôt que de sauter derrière le mur", () => {
    const first: Box = [[0, 0, 0], [600, 560, 870]];
    const next: Box = [[600, 0, 0], [1800, 560, 870]];
    const end: Box = [[1800, -500, 0], [1900, 660, 2500]];
    expect(clearOf(first, [next, end, wall], [500, 0, 0], [0])).toEqual([0, 0, 0]);
    expect(clearOf(first, [next, end, wall], [1150, 0, 0], [0])).toEqual([0, 0, 0]);
  });

  it("libre sur le sol, il recule sur l'axe où il y a le moins à reculer", () => {
    const island: Box = [[0, -2000, 0], [600, -1440, 870]];
    // Brought 40 mm into the front of the units and 300 mm into their length: back out of their front.
    expect(clearOf(island, [base], [900, 1480, 0], [0, 1])).toEqual([900, 1440, 0]);
    // No axis to move on: nowhere.
    expect(clearOf(island, [base], [900, 1480, 0], [])).toBeNull();
  });
});
