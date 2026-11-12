/**
 * Aligner, face sur face, sur un meuble entier : la face d'une pièce du caisson cliquée, c'est le caisson qui se pose
 * (son origine, ses façades et son électroménager suivent), tourné par quarts de tour autour de la verticale ; une
 * rotation qui n'en est pas une est refusée, une Répartition entière ne tourne pas.
 */
import { describe, expect, it } from "vitest";
import { quarterTurn, wholeMate } from "../../frontend/src/app/align-whole";
import { createReferencePlate, type CabinetFeature, type CadDocument } from "../../frontend/src/document/types";

const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Bas C3", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" };
const doc = (): CadDocument => ({ ...createReferencePlate(), features: [cabinet] });
const shown = ["c1#0", "c1#1", "c1#2", "c1#3"];
const fresh = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `mv${i + 1}`, name: `Déplacement ${i + 1}` }));

describe("le meuble entier se pose face sur face", () => {
  it("la face d'un côté cliquée : tout le caisson se déplace, par son origine, en un seul réglage", () => {
    const made = wholeMate(doc(), "c1#1", shown, { rotation: null, translate: [250, 0, 0] }, [], fresh);
    expect(made).toEqual([expect.objectContaining({ id: "c1", type: "cabinet", origin: [250, 0, 0] })]);
  });

  it("un quart de tour autour de la verticale : le caisson tourne autour du centre de la face, puis se déplace", () => {
    const made = wholeMate(doc(), "c1#1", shown, { rotation: { dir: [0, 0, 1], angle: 90, center: [600, 280, 360] }, translate: [0, 0, 0] }, [], fresh);
    if (typeof made === "string" || !made) throw new Error(String(made));
    // The origin (0, 0) turned a quarter about (600, 280): (880, -320).
    expect(made[0]).toMatchObject({ id: "c1", rotation: 90, origin: [880, -320, 0] });
  });

  it("une rotation qui n'est pas un quart de tour vertical est refusée ; une pièce seule n'est pas un meuble", () => {
    expect(quarterTurn({ dir: [1, 0, 0], angle: 90, center: [0, 0, 0] })).toMatch(/verticale/);
    expect(quarterTurn({ dir: [0, 0, -1], angle: 45, center: [0, 0, 0] })).toMatch(/quarts de tour/);
    expect(quarterTurn({ dir: [0, 0, -1], angle: 90, center: [0, 0, 0] })).toBe(-90);
    expect(wholeMate(createReferencePlate(), "h1", ["h1"], { rotation: null, translate: [1, 0, 0] }, [], fresh)).toBeNull();
  });
});
