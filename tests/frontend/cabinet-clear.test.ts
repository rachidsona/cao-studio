/** Un caisson ne traverse pas un mur, et agrandi contre un mur ou un voisin il est décalé au ras, ou sa cote refusée. */
import { describe, expect, it } from "vitest";
import { cabinetKeptClear, keepInRoom, leavesRoom, roomKeepOuts, wallKeepOuts } from "../../frontend/src/document/cabinet-clear";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { createReferencePlate, type CabinetFeature, type CadDocument, type RoomFeature } from "../../frontend/src/document/types";
import { clearOf } from "../../frontend/src/features/box-clear";
import type { Box } from "../../frontend/src/features/smart-align";

// A room 3 × 2,5 m: wall A along x at y = 0, the room towards −y; walls 200 thick.
const room: RoomFeature = {
  id: "pc1", type: "room", name: "Pièce 1", height: 2500, thickness: 200,
  walls: [{ length: 3000, angle: 90 }, { length: 2500, angle: 90 }, { length: 3000, angle: 90 }, { length: 2500, angle: 90 }],
  obstacles: [],
};
const cabinet = (id: string, x: number, y = -560, width = 600): CabinetFeature => ({ id, type: "cabinet", name: `Bas ${id}`, origin: [x, y, 0], width, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" });
const docOf = (...cabinets: CabinetFeature[]): CadDocument => ({ ...createReferencePlate(), features: [room, ...cabinets] });

describe("les murs, et ce qui est derrière eux", () => {
  it("chaque mur d'équerre est profond vers le dehors : A vers +y, B vers +x, C vers −y, D vers −x", () => {
    const walls = wallKeepOuts(docOf());
    expect(walls.map((w) => w.name)).toEqual(["le mur A", "le mur B", "le mur C", "le mur D"]);
    const [a, b, c, d] = walls.map((w) => w.box);
    expect([a![0][1], a![1][1] > 1e5]).toEqual([0, true]);
    expect([b![0][0], b![1][0] > 1e5]).toEqual([3000, true]);
    expect([c![1][1], c![0][1] < -1e5]).toEqual([-2500, true]);
    expect([d![1][0], d![0][0] < -1e5]).toEqual([0, true]);
  });

  it("un caisson tiré bien au-delà du mur s'arrête à son ras : il ne passe pas de l'autre côté", () => {
    const box = cabinetBox(cabinet("cb1", 1200));
    const wallD: Box = [[-200, -2700, 0], [0, 200, 2500]];
    // The wall as a plain box: brought 2 m to the left, beyond it, nothing stops it.
    expect(clearOf(box, [wallD], [-2000, 0, 0], [0])).toEqual([-2000, 0, 0]);
    // With what lies behind it: flush against its room face.
    expect(clearOf(box, roomKeepOuts(docOf()), [-2000, 0, 0], [0])).toEqual([-1200, 0, 0]);
    expect(clearOf(box, roomKeepOuts(docOf()), [-5000, 0, 0], [0])).toEqual([-1200, 0, 0]);
    // Inside the room it goes where it is brought.
    expect(clearOf(box, roomKeepOuts(docOf()), [-700, 0, 0], [0])).toEqual([-700, 0, 0]);
  });

  it("un mur hors d'équerre n'a pas de profondeur (sa boîte seule le garde)", () => {
    const skew: RoomFeature = { ...room, walls: [{ length: 3000, angle: 85 }, { length: 2500, angle: 95 }, { length: 3000, angle: 85 }, { length: 2500, angle: 95 }] };
    expect(wallKeepOuts({ ...createReferencePlate(), features: [skew] }).map((w) => w.name)).toEqual(["le mur A", "le mur C"]);
  });
});

describe("un caisson agrandi à la main", () => {
  it("au milieu de la pièce : comme demandé", () => {
    const wide = { ...cabinet("cb1", 1200), width: 900 };
    expect(cabinetKeptClear(docOf(cabinet("cb1", 1200)), wide)).toBe(wide);
  });

  it("contre le mur B, élargi de 20 cm : décalé d'autant, au ras du mur", () => {
    const kept = cabinetKeptClear(docOf(cabinet("cb1", 2400)), { ...cabinet("cb1", 2400), width: 800 });
    expect(kept).toMatchObject({ width: 800, origin: [2200, -560, 0] });
  });

  it("serré entre le mur et un voisin : la cote est refusée, avec le mur qu'il toucherait", () => {
    const kept = cabinetKeptClear(docOf(cabinet("cb1", 2400), cabinet("cb2", 1800)), { ...cabinet("cb1", 2400), width: 800 });
    expect(kept).toMatch(/Bas cb1.*le mur B.*pas la place/);
  });

  it("élargi dans son voisin de droite : décalé à gauche s'il y a la place ; plus profond contre le mur du fond : avancé", () => {
    const pair = docOf(cabinet("cb1", 600), cabinet("cb2", 1200));
    expect(cabinetKeptClear(pair, { ...cabinet("cb1", 600), width: 700 })).toMatchObject({ origin: [500, -560, 0] });
    expect(cabinetKeptClear(docOf(cabinet("cb1", 600)), { ...cabinet("cb1", 600), depth: 660 })).toMatchObject({ depth: 660, origin: [600, -660, 0] });
  });

  it("déjà dans un mur avant (une cuisine plus grande que sa pièce) : ce mur ne le gêne pas", () => {
    const inWall = cabinet("cb1", 2600);
    const next = { ...inWall, height: 900 };
    expect(cabinetKeptClear(docOf(inWall), next)).toBe(next);
  });
});

describe("une pièce hors d'équerre : rien ne passe derrière un mur de biais", () => {
  // Wall B leans out: the room is wider at the back (wall A) than at the front (wall C).
  const skew: RoomFeature = { ...room, walls: [{ length: 3000, angle: 85 }, { length: 2500, angle: 95 }, { length: 3000, angle: 85 }, { length: 2500, angle: 95 }] };
  const doc: CadDocument = { ...createReferencePlate(), features: [skew] };
  const box = cabinetBox(cabinet("cb1", 1200));

  it("tiré loin vers le mur de biais : il s'arrête à son ras, dans la pièce", () => {
    const move = keepInRoom(doc, box, [5000, 0, 0]);
    expect(move[0]).toBeGreaterThan(1000);
    expect(move[0]).toBeLessThan(2000);
    expect(leavesRoom(doc, box, [[box[0][0] + move[0], box[0][1], 0], [box[1][0] + move[0], box[1][1], 870]])).toBe(false);
    // One millimetre more and a corner is out.
    expect(leavesRoom(doc, box, [[box[0][0] + move[0] + 2, box[0][1], 0], [box[1][0] + move[0] + 2, box[1][1], 870]])).toBe(true);
  });

  it("un déplacement qui reste dans la pièce est gardé tel quel ; ce qui n'est dans aucune pièce est libre", () => {
    expect(keepInRoom(doc, box, [300, -200, 0])).toEqual([300, -200, 0]);
    const outside = cabinetBox(cabinet("cb9", 9000, 5000));
    expect(keepInRoom(doc, outside, [-20000, 0, 0])).toEqual([-20000, 0, 0]);
  });

  it("agrandi contre le mur de biais : la cote est refusée plutôt que de le faire sortir", () => {
    const against = { ...cabinet("cb1", 1200), origin: [1200 + keepInRoom(doc, box, [5000, 0, 0])[0], -560, 0] as [number, number, number] };
    expect(cabinetKeptClear({ ...doc, features: [skew, against] }, { ...against, width: 900 })).toMatch(/sortirait de la pièce/);
  });
});

