/** L'accrochage intelligent dans le modèle : un point de face aligné sur des coins, un corps tiré aligné sur les autres. */
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../frontend/src/document/types";
import { alignBox, alignPoint, middleOfRoom, roomAlong, type Box } from "../../frontend/src/features/smart-align";

describe("accrochage intelligent en 3D", () => {
  it("un point d'une face prend le X ou le Y d'un coin proche, jamais la coordonnée hors de la face", () => {
    // A point of the top face (normal +Z) of a body; a corner of another body at x = 600, z = 900.
    const corners: Vec3[] = [[600, 0, 900], [0, 452, 0]];
    const a = alignPoint([603, 300, 720], [0, 0, 1], corners, 5);
    expect(a.pos).toEqual([600, 300, 720]);
    expect(a.guides).toEqual([[[600, 0, 900], [600, 300, 720]]]);
    // In line with both: the X of one, the Y of the other.
    expect(alignPoint([598, 449, 720], [0, 0, 1], corners, 5).pos).toEqual([600, 452, 720]);
    // Nothing near: the point stays.
    expect(alignPoint([300, 300, 720], [0, 0, 1], corners, 5)).toEqual({ pos: [300, 300, 720], guides: [] });
  });

  it("un panneau tiré le long de X s'arrête face contre face, ou au ras d'un autre", () => {
    const panel: Box = [[0, 0, 0], [18, 500, 700]];
    const side: Box = [[400, 0, 0], [418, 500, 700]];
    // Dragged 378 mm: its right face (396) is 4 mm from the other's left face (400) — it comes against it.
    const against = alignBox(panel, [side], [378, 0, 0], [0], 5);
    expect(against.translate).toEqual([382, 0, 0]);
    // Side by side: the guide runs across the face they meet on.
    expect(against.guides).toEqual([[[400, 0, 350], [400, 500, 350]]]);
    // Dragged 403: its left face meets the other's left face — flush.
    expect(alignBox(panel, [side], [403, 0, 0], [0], 5).translate).toEqual([400, 0, 0]);
    // Only along the axes dragged; far from everything, nothing changes.
    expect(alignBox(panel, [side], [378, 3, 0], [0], 5).translate).toEqual([382, 3, 0]);
    expect(alignBox(panel, [side], [200, 0, 0], [0], 5)).toEqual({ translate: [200, 0, 0], guides: [] });
  });

  it("le milieu s'aligne aussi, la face d'abord quand les deux sont aussi près", () => {
    const a: Box = [[0, 0, 0], [100, 100, 100]];
    const b: Box = [[0, 0, 300], [100, 100, 500]];
    // Raised 348: its middle (398) is 2 mm under b's middle (400) — centred on it.
    expect(alignBox(a, [b], [0, 0, 348], [2], 5).translate).toEqual([0, 0, 350]);
    // Raised 252: its middle (302) is 2 above b's bottom (300), its top (352) 2 under c's top (354): as near, the face
    // wins — raised to 254, not 250.
    const c: Box = [[200, 0, 0], [300, 100, 354]];
    expect(alignBox(a, [b, c], [0, 0, 252], [2], 5).translate).toEqual([0, 0, 254]);
  });

  it("le long de son mur, un caisson tiré se tient au milieu de la place libre entre ses voisins", () => {
    // A 600 cabinet between a neighbour ending at x = 0 and a wall from x = 2000; the worktop above does not count.
    const box: Box = [[100, -600, 100], [700, 0, 900]];
    const others: Box[] = [[[-600, -600, 100], [0, 0, 900]], [[2000, -600, 0], [2100, 0, 2500]], [[-600, -600, 900], [3000, 0, 938]]];
    expect(roomAlong(box, others, [0, 0, 0], 0)).toEqual([0, 2000]);
    // Its middle at 1000: moved by 600 it is there; by 590, within the tolerance, it is held there.
    const held = middleOfRoom(box, others, [590, 0, 0], 0, 20);
    expect(held?.translate).toEqual([600, 0, 0]);
    expect(held?.guides).toEqual([[[0, -300, 500], [700, -300, 500]], [[1300, -300, 500], [2000, -300, 500]]]);
    expect(middleOfRoom(box, others, [400, 0, 0], 0, 20)).toBeNull();
    // Nothing on one side: no middle.
    expect(middleOfRoom(box, others.slice(1), [590, 0, 0], 0, 20)).toBeNull();
  });
});
