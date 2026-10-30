/** Choisir une arête : la distance à l'écran entre le pointeur et un trait (en pixels). */
import { describe, expect, it } from "vitest";
import { pixelDistanceToSegment } from "../../frontend/src/viewport/edge-geometry";

describe("distance du pointeur à un trait de l'écran", () => {
  it("à côté d'un trait vertical : l'écart horizontal", () => {
    expect(pixelDistanceToSegment([103, 50], [100, 0], [100, 200])).toBeCloseTo(3, 9);
  });

  it("au-delà d'un bout : la distance à ce bout", () => {
    expect(pixelDistanceToSegment([100, 210], [100, 0], [100, 200])).toBeCloseTo(10, 9);
    expect(pixelDistanceToSegment([-3, -4], [0, 0], [10, 0])).toBeCloseTo(5, 9);
  });

  it("deux traits serrés (les faces d'un côté double) : le plus proche du pointeur l'emporte", () => {
    const pointer: [number, number] = [101, 80];
    const left = pixelDistanceToSegment(pointer, [100, 0], [100, 200]);
    const right = pixelDistanceToSegment(pointer, [104, 0], [104, 200]);
    expect(left).toBeLessThan(right);
  });

  it("un trait réduit à un point (vu de bout)", () => {
    expect(pixelDistanceToSegment([3, 4], [0, 0], [0, 0])).toBeCloseTo(5, 9);
  });
});
