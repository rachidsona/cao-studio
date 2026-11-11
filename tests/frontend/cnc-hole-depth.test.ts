/**
 * La CNC lit la profondeur d'un trou dans le document (audit d'architecture du 11/11/2026) : celle de l'usinage dont
 * l'axe passe par le cercle de la face, au même diamètre ; à défaut seulement, elle la mesure sur le maillage.
 */
import { describe, expect, it } from "vitest";
import { documentedHoleDepth, type DrilledHole } from "../../frontend/src/io/dxf";

// A side 18 mm thick in X, a row of Ø5 holes 12 mm deep from x = 0 toward +x, and a Ø8 dowel through.
const holes: DrilledHole[] = [
  { at: [0, 37, 100], dir: [1, 0, 0], diameter: 5, depth: 12 },
  { at: [0, 37, 132], dir: [1, 0, 0], diameter: 5, depth: 12 },
  { at: [0, 300, 50], dir: [1, 0, 0], diameter: 8, depth: 30 },
];

describe("profondeur des trous pour la CNC", () => {
  it("vient de l'usinage du document, vu de la face d'entrée", () => {
    expect(documentedHoleDepth(holes, [0, 37, 132], 2.5, 18)).toBe(12);
  });

  it("le fond d'un trou borgne vu de l'autre face donne la même profondeur", () => {
    expect(documentedHoleDepth(holes, [12, 37, 100], 2.5, 18)).toBe(12);
  });

  it("un trou plus profond que la planche la traverse", () => {
    expect(documentedHoleDepth(holes, [0, 300, 50], 4, 18)).toBe(18);
  });

  it("un autre diamètre ou un cercle hors de l'axe n'est pas décrit : le maillage décidera", () => {
    expect(documentedHoleDepth(holes, [0, 37, 100], 4, 18)).toBeNull();
    expect(documentedHoleDepth(holes, [0, 40, 100], 2.5, 18)).toBeNull();
  });
});
