/** Poids et stabilité : masses par matière, centre de gravité, basculement tiroirs sortis, fixation murale. */
import { describe, expect, it } from "vitest";
import { partMass, stability, type MassPart } from "../../frontend/src/features/stability";
import type { Vec3 } from "../../frontend/src/document/types";

const box = (lo: Vec3, hi: Vec3): [Vec3, Vec3] => [lo, hi];

describe("poids et stabilité", () => {
  it("pèse une pièce d'après sa matière (aggloméré si elle n'en a pas)", () => {
    // A 2000 × 600 × 18 side: 21.6 dm³, 14 kg in particleboard, 15.1 kg in oak.
    expect(partMass(2000 * 600 * 18, "melamine-white")).toBeCloseTo(14.04, 2);
    expect(partMass(2000 * 600 * 18, "solid-oak")).toBeCloseTo(15.12, 2);
    expect(partMass(2000 * 600 * 18, undefined)).toBeCloseTo(14.04, 2);
  });

  it("garde debout un caisson bas, mais fait basculer un meuble à tiroirs léger et peu profond, tiroirs sortis", () => {
    // A low unit 600 deep (front at y = −600), its mass at its middle (y = −300).
    const body: MassPart = { mass: 30, center: [300, -300, 400] };
    const drawer: MassPart = { mass: 4, center: [300, -320, 600] };
    const footprint = [box([0, -600, 0], [600, 0, 800])];
    const low = stability([body, drawer], [{ parts: [drawer], slide: [0, -450, 0] }], footprint, box([0, -600, 0], [600, 0, 800]), 15);
    expect(low.mass).toBe(34);
    expect(low.tips).toBe(false);
    expect(low.fixToWall).toBe(false);
    // A light, shallow chest (350 deep) with three drawers pulled out 300 mm, 25 kg each: it tips.
    const chest: MassPart = { mass: 12, center: [300, -175, 600] };
    const drawers = [0, 1, 2].map((k): MassPart => ({ mass: 3, center: [300, -180, 300 + 300 * k] }));
    const tall = stability([chest, ...drawers], drawers.map((d) => ({ parts: [d], slide: [0, -300, 0] as Vec3 })), [box([0, -350, 0], [600, 0, 1200])], box([0, -350, 0], [600, 0, 1200]), 25);
    expect(tall.tips).toBe(true);
    expect(tall.margin).toBeLessThan(0);
    expect(tall.fixToWall).toBe(true);
  });
});
