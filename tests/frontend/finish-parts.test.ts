/** Finitions : joues, fileurs jusqu'aux murs, bandeau jusqu'au plafond, plinthe sous le socle. */
import { describe, expect, it } from "vitest";
import { FINISH_DEFAULTS, finishParts, type Box, type FinishOptions } from "../../frontend/src/features/finish-parts";

// A wardrobe 1000 wide (x 0…1000), 600 deep (front at y = −600), 2000 high, standing on a 100 mm socle: its sides go
// down to the floor, its bottom board is raised.
const LEFT: Box = [[0, -600, 0], [18, 0, 2000]];
const RIGHT: Box = [[982, -600, 0], [1000, 0, 2000]];
const BOTTOM: Box = [[18, -600, 100], [982, 0, 118]];
const TOP: Box = [[18, -600, 1982], [982, 0, 2000]];
const WARDROBE = [LEFT, RIGHT, BOTTOM, TOP];
const options = (change: (o: FinishOptions) => void = () => {}): FinishOptions => {
  const o = structuredClone(FINISH_DEFAULTS);
  change(o);
  return o;
};
const names = (r: { parts: { name: string }[] }) => r.parts.map((p) => p.name);

describe("finitions d'un meuble", () => {
  it("pose une joue de chaque côté, sur toute la profondeur, du sol au-dessus (avec le dépassement)", () => {
    const r = finishParts(WARDROBE, [], options((o) => (o.ends.above = 20)));
    expect(names(r)).toEqual(["Joue gauche", "Joue droite"]);
    expect(r.parts[0]).toMatchObject({ from: [-19, -600, 0], to: [0, 0, 2020] });
    expect(r.parts[1]).toMatchObject({ from: [1000, -600, 0], to: [1019, 0, 2020] });
  });

  it("comble le jour jusqu'aux murs par des fileurs en façade, et jusqu'au plafond par un bandeau", () => {
    // A wall 60 mm to the right of the right end panel, one 400 mm to the left (too far), a ceiling 2300 high.
    const walls: Box[] = [
      [[1079, -700, 0], [1179, 100, 2500]],
      [[-519, -700, 0], [-419, 100, 2500]],
      [[-600, -700, 2300], [1500, 100, 2400]],
    ];
    const r = finishParts(WARDROBE, walls, options());
    expect(names(r)).toEqual(["Joue gauche", "Joue droite", "Fileur droit", "Bandeau haut"]);
    expect(r.parts[2]).toMatchObject({ from: [1019, -600, 0], to: [1079, -581, 2000] });
    expect(r.parts[3]).toMatchObject({ from: [-19, -600, 2000], to: [1019, -581, 2300] });
    expect(r.notes[0]).toContain("400 mm");
  });

  it("met la plinthe en retrait entre les côtés qui descendent au sol, de la hauteur du socle", () => {
    const r = finishParts(WARDROBE, [], options((o) => {
      o.ends.left = o.ends.right = false;
      o.plinth.on = true;
      o.plinth.height = 150;
    }));
    expect(names(r)).toEqual(["Plinthe"]);
    // Between the sides, 50 mm behind the front, as high as the room under the bottom board.
    expect(r.parts[0]).toMatchObject({ from: [18, -550, 0], to: [982, -531, 100] });
    // A furniture standing flat on the floor all along has no room for one.
    const flat = finishParts([[[0, -600, 0], [1000, 0, 2000]]], [], options((o) => (o.plinth.on = true)));
    expect(flat.notes.some((n) => n.includes("socle"))).toBe(true);
    expect(names(flat)).toEqual(["Joue gauche", "Joue droite"]);
  });

  it("suit la face avant choisie : vers +X, la gauche vue de devant est vers −Y", () => {
    const r = finishParts([[[0, 0, 0], [600, 1000, 2000]]], [], options((o) => (o.front = { axis: 0, sign: 1 })));
    expect(r.parts[0]).toMatchObject({ name: "Joue gauche", from: [0, -19, 0], to: [600, 0, 2000] });
    expect(r.parts[1]).toMatchObject({ name: "Joue droite", from: [0, 1000, 0], to: [600, 1019, 2000] });
  });
});

describe("pieds réglables", () => {
  it("pose des pieds sous le dessous relevé, à 50 mm des bords, tous les 800 mm au plus, de la hauteur du socle", () => {
    const r = finishParts(WARDROBE, [], options((o) => {
      o.ends.left = o.ends.right = false;
      o.feet = { on: true };
    }));
    // Bottom 18…982 × −600…0, raised 100 mm: x 68 → 932 (864 mm: 3 rows), y −550 → −50 (2 rows).
    expect(r.parts).toHaveLength(6);
    expect(r.parts.every((p) => p.radius === 15 && p.hardware && p.from[2] === 0 && p.to[2] === 100)).toBe(true);
    expect(r.parts.map((p) => p.from[0])).toEqual([68, 68, 500, 500, 932, 932]);
    // On the floor all along: no room for feet.
    const flat = finishParts([[[0, -600, 0], [1000, 0, 18]], [[0, -600, 18], [18, 0, 800]]], [], options((o) => (o.feet = { on: true })));
    expect(flat.notes.some((n) => n.includes("socle"))).toBe(true);
  });
});
