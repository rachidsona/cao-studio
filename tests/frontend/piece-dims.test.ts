/** Cotes des pièces dans la vue : largeur près du haut, hauteur au milieu, sur la face vers l'œil ; rien par la tranche. */
import { describe, expect, it } from "vitest";
import { pieceDims, viewAxes, type Box } from "../../frontend/src/features/piece-dims";

describe("cotes des pièces", () => {
  it("lit les axes de la vue : de face, on regarde le long de Y, Z monte", () => {
    expect(viewAxes([0.1, -1, 0.2], [0, 0, 1])).toEqual({ view: 1, side: -1, up: 2, across: 0 });
    expect(viewAxes([0, 0, 1], [0, 1, 0])).toEqual({ view: 2, side: 1, up: 1, across: 0 });
  });

  it("une porte vue de face : sa largeur près du haut, sa hauteur un peu à droite du milieu, devant elle", () => {
    const door: Box = [[0, -19, 0], [734, 0, 2528]];
    const [width, height] = pieceDims(door, viewAxes([0, -1, 0], [0, 0, 1]));
    expect(width).toMatchObject({ length: 734, from: [0, -19.5, 2378], to: [734, -19.5, 2378], at: [367, -19.5, 2378] });
    expect(height).toMatchObject({ length: 2528, from: [440.4, -19.5, 0], to: [440.4, -19.5, 2528] });
    // A low band: its width a quarter down.
    expect(pieceDims([[0, -19, 2528], [3064, 0, 2928]], viewAxes([0, -1, 0], [0, 0, 1]))[0]!.from[2]).toBe(2828);
  });

  it("une étagère ou un côté vus par la tranche n'ont que leur longueur, le long de leur tranche", () => {
    const axes = viewAxes([0, -1, 0], [0, 0, 1]);
    expect(pieceDims([[0, -560, 800], [564, 0, 818]], axes)).toEqual([{ from: [0, -560.5, 809], to: [564, -560.5, 809], length: 564, at: [282, -560.5, 809] }]);
    expect(pieceDims([[0, -560, 0], [18, 0, 2528]], axes)).toEqual([{ from: [9, -560.5, 0], to: [9, -560.5, 2528], length: 2528, at: [9, -560.5, 1264] }]);
    // A rod or a hinge (small both ways): nothing.
    expect(pieceDims([[0, -300, 1800], [25, -275, 1825]], axes)).toEqual([]);
  });
});
