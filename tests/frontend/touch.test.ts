/** « Jusqu'au corps voisin » : la distance dont une face avance avant de toucher un autre corps (features/touch.ts). */
import { describe, expect, it } from "vitest";
import { gapAlong, type Box } from "../../frontend/src/features/touch";

// The scene of the request: a board on the floor, a back panel it touches, a side panel 82 mm to its left.
const leftPanel: Box = [[0, 0, 0], [18, 400, 600]];
const backPanel: Box = [[18, 382, 0], [400, 400, 600]];
const boardLeftFace: Box = [[100, 0, 0], [100, 382, 50]];

describe("jusqu'au corps voisin", () => {
  it("la face gauche de la planche va jusqu'au côté : 82 mm ; le fond qu'elle touche ne compte pas", () => {
    expect(gapAlong(boardLeftFace, [-1, 0, 0], [leftPanel, backPanel])).toBe(82);
  });

  it("rien devant la face, ou une face inclinée : pas de distance", () => {
    expect(gapAlong(boardLeftFace, [1, 0, 0], [leftPanel, backPanel])).toBeNull();
    expect(gapAlong(boardLeftFace, [-0.7, 0.7, 0], [leftPanel])).toBeNull();
  });

  it("le plus proche des corps en face ; un corps à côté (qui ne recouvre pas la face) est ignoré", () => {
    const far: Box = [[-300, 0, 0], [-200, 400, 600]];
    const beside: Box = [[40, 500, 0], [60, 600, 600]];
    expect(gapAlong(boardLeftFace, [-1, 0, 0], [far, beside, leftPanel])).toBe(82);
  });
});
