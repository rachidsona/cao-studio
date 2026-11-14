/** Relevé de pièce : murs par longueurs et angles (même pas d'équerre), ouvertures, obstacles, heurts d'un meuble. */
import { describe, expect, it } from "vitest";
import { roomProblems } from "../../frontend/src/document/fabrication-check";
import { closingGap, roomClashes, roomPieces, wallFrames, type RoomInput } from "../../frontend/src/features/room-plan";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const ROOM: RoomInput = {
  walls: [
    { length: 3000, angle: 90 },
    { length: 2000, angle: 90 },
    { length: 3000, angle: 90 },
    { length: 2000, angle: 90 },
  ],
  height: 2500,
  thickness: 200,
  obstacles: [],
};
const close = (p: number[], q: number[]) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i]!, 6));

describe("relevé de pièce", () => {
  it("pose les murs en tournant à droite, la pièce vers −Y, et les relie d'onglet à l'extérieur", () => {
    const f = wallFrames(ROOM);
    close(f[0]!.start, [0, 0]);
    close(f[0]!.end, [3000, 0]);
    close(f[1]!.end, [3000, -2000]);
    close(f[2]!.end, [0, -2000]);
    // Wall A outward towards +Y; its outer corners meet those of D and B.
    close(f[0]!.n, [0, 1]);
    close(f[0]!.outline[3]!, [-200, 200]);
    close(f[0]!.outline[2]!, [3200, 200]);
    expect(closingGap(ROOM)).toBeCloseTo(0, 6);
    // Out of square: an angle of 92° at the first corner opens the room, and the survey no longer closes.
    expect(closingGap({ ...ROOM, walls: [{ length: 3000, angle: 92 }, ...ROOM.walls.slice(1)] })).toBeGreaterThan(50);
  });

  it("fait un corps par mur et par obstacle, les fenêtres et portes en ouvertures", () => {
    const { pieces, openings } = roomPieces({
      ...ROOM,
      obstacles: [
        { kind: "window", wall: 0, at: 800, width: 1200, height: 1350, sill: 900 },
        { kind: "socket", wall: 1, at: 500, height: 300 },
        { kind: "beam", wall: 0, depth: 300, drop: 250 },
        { kind: "slope", wall: 2, knee: 1000, depth: 1500 },
      ],
    });
    expect(pieces.map((p) => p.name)).toEqual(["Mur A", "Mur B", "Mur C", "Mur D", "Prise 1 (mur B)", "Retombée 1 (mur A)", "Rampant 1 (mur C)"]);
    expect(openings).toHaveLength(1);
    expect(openings[0]!.wall).toBe(0);
    // The window drawn on the outer face of wall A (y = 200 + 1), pushed through.
    close(openings[0]!.prism.origin, [800, 201, 0]);
    expect(openings[0]!.prism.length).toBe(202);
  });

  it("dit ce que heurte un meuble et la prise qu'il cache", () => {
    const room: RoomInput = { ...ROOM, obstacles: [{ kind: "beam", wall: 0, depth: 300, drop: 250 }, { kind: "slope", wall: 2, knee: 1000, depth: 1500 }, { kind: "socket", wall: 0, at: 500, height: 300 }] };
    // A wardrobe against wall A, 600 deep, 2400 high: under the ceiling but into the drop (2250), over the socket.
    const wardrobe: [[number, number, number], [number, number, number]] = [[100, -600, 0], [1100, 0, 2400]];
    expect(roomClashes(room, wardrobe)).toEqual({ hits: ["la retombée du mur A"], hidden: ["la prise du mur A à 500 mm"] });
    // Into the wall itself.
    expect(roomClashes(room, [[100, -600, 0], [1100, 50, 2000]]).hits).toContain("le mur A");
    // Against wall C under the slope: 1000 at the wall, 2500 at 1500 mm — a 1200 high unit 400 deep hits it, 900 does not.
    expect(roomClashes(room, [[1000, -2000, 0], [2000, -1600, 1200]]).hits).toEqual(["le rampant du mur C"]);
    expect(roomClashes(room, [[1000, -2000, 0], [2000, -1600, 900]]).hits).toEqual([]);
    const problems = roomProblems([room], [{ id: "b1", name: "Armoire", box: wardrobe, boxLike: true }]);
    expect(problems.map((p) => p.severity)).toEqual(["error", "warning"]);
  });

  it("une pièce relevée est un document valide", () => {
    const doc = { ...createReferencePlate(), features: [{ id: "pc1", type: "room" as const, name: "Pièce 1", ...ROOM, obstacles: [{ kind: "door" as const, wall: 3, at: 200, width: 830, height: 2040 }] }] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(() => parseDocument({ ...doc, features: [{ ...doc.features[0], walls: [{ length: -1, angle: 90 }] }] })).toThrow();
  });
});

describe("mur en faux aplomb", () => {
  it("son avancée entre le sol, la mi-hauteur et le haut ; un meuble contre lui le heurte en haut", async () => {
    const { wallLean } = await import("../../frontend/src/features/room-plan");
    const wall = { length: 3000, angle: 90, plumb: { mid: 8, high: 20 } };
    expect(wallLean(wall, 2500, 0)).toBe(0);
    expect(wallLean(wall, 2500, 625)).toBeCloseTo(4);
    expect(wallLean(wall, 2500, 1250)).toBeCloseTo(8);
    expect(wallLean(wall, 2500, 2500)).toBeCloseTo(20);
    // Wall A along +X at y = 0, the room on −Y: a cabinet 10 mm from it, 2 m high, runs into its top.
    const leaning: RoomInput = { ...ROOM, walls: ROOM.walls.map((w, i) => (i === 0 ? wall : w)) };
    expect(roomClashes(leaning, [[500, -600, 0], [1100, -10, 2000]]).hits).toEqual(["le mur A (faux aplomb)"]);
    expect(roomClashes(ROOM, [[500, -600, 0], [1100, -10, 2000]]).hits).toEqual([]);
    expect(roomPieces(leaning).leans.map((l) => l.mode)).toEqual(["join"]);
    expect(() => parseDocument({ ...createReferencePlate(), features: [{ id: "rm1", type: "room", name: "Pièce", ...leaning }] })).not.toThrow();
    expect(() => parseDocument({ ...createReferencePlate(), features: [{ id: "rm1", type: "room", name: "Pièce", ...ROOM, walls: [{ length: 3000, angle: 90, plumb: { mid: "8" } }] }] })).toThrow(/murs invalides/);
  });
});
