/** Barre d'outils flottante : elle reste dans la vue, et sa place relue du navigateur est vérifiée. */
import { describe, expect, it } from "vitest";
import { clampInside, readPlacement } from "../../frontend/src/ui/movable";

describe("barre déplaçable", () => {
  it("reste entièrement dans la vue", () => {
    expect(clampInside([300, 150], [46, 344], [900, 700])).toEqual([300, 150]);
    expect(clampInside([5000, 5000], [46, 344], [900, 700])).toEqual([854, 356]);
    expect(clampInside([-40, -10], [46, 344], [900, 700])).toEqual([0, 0]);
    // Larger than the view: pinned to its top-left corner.
    expect(clampInside([100, 100], [1000, 50], [900, 700])).toEqual([0, 100]);
  });

  it("reprend sa place d'origine quand rien n'est retenu", () => {
    expect(readPlacement("cao.favorites.place.model")).toEqual({ x: null, y: null, horizontal: false });
  });
});
