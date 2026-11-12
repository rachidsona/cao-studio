/** Les marbres à grandes veines et les pierres frittées (Dekton) : des motifs qui se raccordent sans couture. */
import { describe, expect, it } from "vitest";
import { APPEARANCES } from "../../frontend/src/appearance/library";
import { sampleMotif } from "../../frontend/src/appearance/textures";

const grid = (pattern: "veined" | "sintered") => {
  const out: number[] = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) out.push(sampleMotif(pattern, x / 64, y / 64)[0]);
  return out;
};

describe("marbres et Dekton", () => {
  it("un marbre veiné : surtout clair, une veine franche ; sans couture d'une dalle à l'autre", () => {
    const mix = grid("veined");
    expect(mix.every((m) => m >= 0 && m <= 1)).toBe(true);
    expect(Math.max(...mix)).toBeGreaterThan(0.8);
    expect(mix.filter((m) => m < 0.3).length / mix.length).toBeGreaterThan(0.6);
    for (const t of [0.1, 0.37, 0.8]) {
      expect(sampleMotif("veined", 0, t)[0]).toBeCloseTo(sampleMotif("veined", 1, t)[0], 6);
      expect(sampleMotif("veined", t, 0)[0]).toBeCloseTo(sampleMotif("veined", t, 1)[0], 6);
    }
  });

  it("une pierre frittée : unie, sans veine", () => {
    const mix = grid("sintered");
    const mean = mix.reduce((a, b) => a + b, 0) / mix.length;
    expect(Math.max(...mix)).toBeLessThan(0.65);
    expect(Math.sqrt(mix.reduce((a, b) => a + (b - mean) ** 2, 0) / mix.length)).toBeLessThan(0.12);
  });

  it("la bibliothèque a les marbres et les teintes Dekton, chacune une fois", () => {
    const ids = APPEARANCES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["marble-statuario", "marble-calacatta-oro", "quartzite-taj-mahal", "dekton-aura", "dekton-entzo", "dekton-laurent", "dekton-kelya", "dekton-sirius", "dekton-kreta"]) expect(ids).toContain(id);
    expect(APPEARANCES.filter((a) => a.category === "sintered").length).toBeGreaterThanOrEqual(12);
  });
});
