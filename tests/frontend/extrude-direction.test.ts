/** La « Direction » d'une face tirée : perpendiculaire, selon un axe, ou comme une autre face cliquée. */
import { describe, expect, it } from "vitest";
import { WayChoice } from "../../frontend/src/app/extrude-direction";

describe("direction d'une face tirée", () => {
  it("perpendiculaire par défaut, un axe tourné du côté de la face, une face qui le longe refusée", () => {
    const way = new WayChoice();
    way.set("normal");
    expect(way.for([0, 0, 1])).toBeUndefined();
    way.set("x");
    // The end of a slanted shelf facing −X: along X, out of it.
    expect(way.for([-0.97, 0, 0.25])).toEqual([-1, 0, 0]);
    expect(way.on([0.97, 0, 0.25])).toEqual({ direction: [1, 0, 0] });
    expect(typeof way.for([0, 0, 1])).toBe("string");
    expect(way.on([0, 0, 1])).toEqual({});
  });

  it("comme une autre face : le clic suivant la donne, puis la face tirée va perpendiculairement à elle", () => {
    const way = new WayChoice();
    way.set("face");
    expect(way.aiming).toBe(true);
    expect(way.hint()).toContain("Cliquez la face");
    expect(way.take([0, 1, 0])).toBe(true);
    expect(way.aiming).toBe(false);
    expect(way.take([1, 0, 0])).toBe(false);
    expect(way.for([0.2, -0.98, 0])).toEqual([0, -1, 0]);
    // An extrusion changed keeps the way it has.
    expect(new WayChoice([0, 0, 1]).on([0, 0.5, 0.87])).toEqual({ direction: [0, 0, 1] });
  });
});
