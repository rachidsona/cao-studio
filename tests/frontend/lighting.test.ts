/** Éclairage des meubles : rubans dedans, sous les meubles hauts (ou spots), corniche, plinthe ; posés puis remplacés. */
import { describe, expect, it } from "vitest";
import { LIGHTING, addLights, lightPieces, removeLights, type LitElement } from "../../frontend/src/document/lighting";
import { createReferencePlate } from "../../frontend/src/document/types";

// A base unit (600 wide, its front towards −Y, on a 150 plinth) and a wall unit over it.
const base: LitElement = {
  name: "Bas 1", box: [[0, -560, 0], [600, 0, 870]], front: { axis: 1, sign: -1 },
  boards: [
    { name: "Dessous", box: [[18, -557, 150], [582, 0, 168]] },
    { name: "Étagère 1", box: [[18, -557, 501], [582, 0, 519]] },
    { name: "Dessus", box: [[18, -557, 852], [582, 0, 870]] },
  ],
};
const wall: LitElement = {
  name: "Haut 1", box: [[0, -350, 1450], [600, 0, 2150]], front: { axis: 1, sign: -1 },
  boards: [
    { name: "Dessous", box: [[18, -347, 1450], [582, 0, 1468]] },
    { name: "Dessus", box: [[18, -347, 2132], [582, 0, 2150]] },
  ],
};

describe("éclairage des meubles", () => {
  it("dedans : un ruban sous chaque planche sauf la plus basse, près de la façade", () => {
    const pieces = lightPieces([base], { ...LIGHTING, under: "none" });
    expect(pieces.map((p) => p.name)).toEqual(["Ruban LED Bas 1 — sous Étagère 1", "Ruban LED Bas 1 — sous Dessus"]);
    // 30 mm behind the front edge (−557), 12 wide, 8 thick, 20 mm off each side.
    expect(pieces[0]!.box).toEqual([[38, -527, 493], [562, -515, 501]]);
  });

  it("dehors : sous le meuble haut (ruban ou spots), corniche au-dessus, plinthe sous le bas sur socle", () => {
    const s = { ...LIGHTING, inside: false, cornice: true, plinth: true };
    const names = lightPieces([base, wall], s).map((p) => p.name);
    expect(names).toEqual(["Plinthe LED Bas 1", "Ruban LED sous Haut 1", "Corniche LED Haut 1"]);
    const plinth = lightPieces([base], s)[0]!;
    expect(plinth.box[1][2]).toBe(150);
    const spots = lightPieces([{ ...wall, box: [[0, -350, 1450], [1200, 0, 2150]] }], { ...s, under: "spots", cornice: false });
    expect(spots.map((p) => p.kind)).toEqual(["spot", "spot"]);
    expect(spots[0]!.box).toEqual([[270, -300, 1444], [330, -240, 1450]]);
  });

  it("pose les lumières sur le calque Éclairage, allumées et hors débit, puis les remplace", () => {
    const pieces = lightPieces([base, wall], LIGHTING);
    const { doc, bodies } = addLights(createReferencePlate(), pieces, "neutral");
    expect(bodies).toHaveLength(pieces.length);
    expect(doc.layers?.map((l) => l.name)).toContain("Éclairage");
    const info = doc.bodyInfo?.[bodies[0]!];
    expect(info).toMatchObject({ room: true, light: { kind: "strip", color: "neutral" }, appearance: "led-neutral" });
    expect(doc.features.length - createReferencePlate().features.length).toBe(2 * pieces.length);
    const cleared = removeLights(doc);
    expect(cleared.features.map((f) => f.id)).toEqual(createReferencePlate().features.map((f) => f.id));
    expect(Object.values(cleared.bodyInfo ?? {}).some((i) => i.light)).toBe(false);
  });
});
