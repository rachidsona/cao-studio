/** Un meuble tourné ne se pose pas dans son voisin : le pivot est décalé pour qu'il arrive au ras. */
import { describe, expect, it } from "vitest";
import { clearPivot, turnedBox } from "../../frontend/src/features/turn-clear";
import type { Box } from "../../frontend/src/features/smart-align";

const inside = (a: Box, b: Box) => [0, 1, 2].every((i) => a[0][i]! < b[1][i]! - 1 && a[1][i]! > b[0][i]! + 1);

describe("tourner un meuble sans entrer dans un autre", () => {
  const cabinet: Box = [[0, 0, 0], [600, 560, 870]];
  const center: [number, number, number] = [300, 280, 435];

  it("tourné d'un quart autour de son centre : sa boîte a la largeur et la profondeur échangées", () => {
    expect(turnedBox(cabinet, 90, center)).toEqual([[20, -20, 0], [580, 580, 870]]);
  });

  it("libre : le pivot reste ; dans un voisin : décalé, le meuble arrive au ras de lui, dans un seul tour", () => {
    expect(clearPivot(cabinet, 90, center, [[[2000, 0, 0], [2600, 560, 870]]])).toEqual({ center, moved: false });
    // A column 10 mm in front of where its turned box would reach (it reaches 580, the column starts at 570).
    const column: Box = [[0, 570, 0], [600, 1200, 2150]];
    const turned = clearPivot(cabinet, 90, center, [column])!;
    expect(turned.moved).toBe(true);
    const box = turnedBox(cabinet, 90, turned.center);
    expect(inside(box, column)).toBe(false);
    expect(box[1][1]).toBeCloseTo(570);
    // The plinth it stood on already is no obstacle.
    expect(clearPivot(cabinet, 90, center, [[[0, 0, -10], [600, 560, 20]]])).toEqual({ center, moved: false });
    // A whole turn: nothing to shift.
    expect(clearPivot(cabinet, 360, center, [column])).toEqual({ center, moved: false });
  });
});
