/** Réseau « Jusqu'à… » : la dernière copie arrive au point, à l'arête ou à la face cliqués. */
import { describe, expect, it } from "vitest";
import { arrivalOffset } from "../../frontend/src/app/array-tool";
import type { Vec3 } from "../../frontend/src/document/types";

const shelf: [Vec3, Vec3] = [[0, 0, 100], [600, 300, 118]];

describe("réseau jusqu'à un point", () => {
  it("au-delà de ce qui est copié : son côté loin y arrive ; en deçà, son côté près, de l'autre côté", () => {
    // A face 1 m up: the last shelf's top there.
    expect(arrivalOffset(shelf, 2, 1000)).toBe(882);
    // The floor: the last shelf's bottom on it, downwards.
    expect(arrivalOffset(shelf, 2, 0)).toBe(-100);
    // Along X, a side at 2 m.
    expect(arrivalOffset(shelf, 0, 2000)).toBe(1400);
  });
});
