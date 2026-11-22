/** La niche d'un corps aménagé suit ses parois, même en biais. */
import { describe, expect, it } from "vitest";
import { linesBetweenWalls, nicheOutline, type WallLine } from "../../frontend/src/sketcher/niche-outline";

const opening: [number, number, number, number] = [18, 18, 582, 382];
/** Inner faces of a frame: its left one leaning (u from 18 at the bottom to 68 at the top), the others square. */
const lean = Math.hypot(364, 50);
const walls: WallLine[] = [
  { p: [18, 18], n: [364 / lean, -50 / lean] },
  { p: [582, 0], n: [-1, 0] },
  { p: [0, 18], n: [0, 1] },
  { p: [0, 382], n: [0, -1] },
];
/** Its corners, rounded, in order of u then v (wherever the polygon starts). */
const round = (polygon: [number, number][] | null) => polygon?.map(([u, v]) => [Math.round(u), Math.round(v)]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);

describe("la forme d'une niche entre les parois", () => {
  it("toute l'ouverture : un trapèze, son côté gauche le long de la paroi penchée", () => {
    expect(round(nicheOutline({ x0: 18, y0: 18, x1: 582, y1: 382 }, opening, walls))).toEqual([[18, 18], [68, 382], [582, 18], [582, 382]]);
  });

  it("une niche entre deux étagères garde ses bords d'étagère, et suit la paroi à gauche", () => {
    expect(round(nicheOutline({ x0: 18, y0: 200, x1: 582, y1: 290 }, opening, walls))).toEqual([[43, 200], [55, 290], [582, 200], [582, 290]]);
  });

  it("une niche loin des parois reste un rectangle ; sans paroi pour l'arrêter aussi", () => {
    expect(nicheOutline({ x0: 100, y0: 100, x1: 200, y1: 200 }, opening, walls)).toBeNull();
    expect(nicheOutline({ x0: 18, y0: 18, x1: 582, y1: 382 }, opening, walls.slice(1))).toBeNull();
  });

  it("le tracé : les traits sur le bord de l'ouverture partent, une étagère va jusqu'à la paroi penchée, une cloison reste", () => {
    const curves = [
      { id: "bord", points: [[18, 18], [18, 382]] as [number, number][] },
      { id: "dehors", points: [[0, 0], [600, 0]] as [number, number][] },
      { id: "étagère", points: [[18, 200], [582, 200]] as [number, number][] },
      { id: "cloison", points: [[300, 200], [300, 382]] as [number, number][] },
    ];
    const drawn = linesBetweenWalls(curves, opening, walls).map((c) => ({ id: c.id, points: round(c.points) }));
    expect(drawn).toEqual([
      { id: "étagère", points: [[43, 200], [582, 200]] },
      { id: "cloison", points: [[300, 200], [300, 382]] },
    ]);
  });
});
