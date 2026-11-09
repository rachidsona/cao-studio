/** « Pousser » : chaque flèche va le long de l'axe du sol le plus proche de ce que la vue montre. */
import { describe, expect, it } from "vitest";
import { floorAxis, pushDirection, pushTravel } from "../../frontend/src/app/push-tool";

describe("pousser avec les flèches", () => {
  it("prend l'axe du sol le plus proche, avec son sens", () => {
    expect(floorAxis([0.9, 0.3, 0.2])).toEqual([1, 0, 0]);
    expect(floorAxis([-0.2, -0.7, 0.5])).toEqual([0, -1, 0]);
    expect(floorAxis([0, 0, 1])).toBeNull();
  });

  it("de face, → va vers +X, ↑ vers le fond (+Y), Page↑ monte", () => {
    // A front camera looks along +Y, its right is +X, its up +Z.
    const view = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const;
    expect(pushDirection("right", ...view)).toEqual([1, 0, 0]);
    expect(pushDirection("left", ...view)).toEqual([-1, 0, 0]);
    expect(pushDirection("away", ...view)).toEqual([0, 1, 0]);
    expect(pushDirection("near", ...view)).toEqual([0, -1, 0]);
    expect(pushDirection("up", ...view)).toEqual([0, 0, 1]);
    expect(pushDirection("down", ...view)).toEqual([0, 0, -1]);
  });

  it("vu de dessus, ↑ suit le haut de l'écran ; vue tournée, les flèches tournent avec", () => {
    // Looking down, the screen's up is +Y.
    expect(pushDirection("away", [1, 0, 0], [0, 0, -1], [0, 1, 0])).toEqual([0, 1, 0]);
    // From the right side (looking along −X): its right is +Y.
    expect(pushDirection("right", [0, 1, 0], [-1, 0, 0], [0, 0, 1])).toEqual([0, 1, 0]);
    expect(pushDirection("away", [0, 1, 0], [-1, 0, 0], [0, 0, 1])).toEqual([-1, 0, 0]);
  });
});

describe("pousser jusqu'au contact", () => {
  const box = (x0: number, x1: number, y0 = 0, y1 = 600, z0 = 0, z1 = 800): [[number, number, number], [number, number, number]] => [[x0, y0, z0], [x1, y1, z1]];
  const neighbour = { id: "voisin", box: box(700, 1300) };

  it("s'arrête au côté du caisson voisin, sans y entrer", () => {
    expect(pushTravel(box(0, 600), [neighbour], [1, 0, 0], 250)).toEqual({ travel: 100, stop: "voisin" });
    // Already against it: nothing more.
    expect(pushTravel(box(100, 700), [neighbour], [1, 0, 0], 50)).toEqual({ travel: 0, stop: "voisin" });
    // Away from it, or short of it: the whole step.
    expect(pushTravel(box(0, 600), [neighbour], [-1, 0, 0], 250)).toEqual({ travel: 250, stop: null });
    expect(pushTravel(box(0, 600), [neighbour], [1, 0, 0], 50)).toEqual({ travel: 50, stop: null });
  });

  it("ne bute que sur ce qu'il rencontre : pas sur ce qui passe au-dessus ou à côté, ni sur ce qu'il touche déjà", () => {
    // The worktop over it, touching its top: it slides under it.
    const worktop = { id: "plan", box: box(-1000, 3000, 0, 620, 800, 840) };
    expect(pushTravel(box(0, 600), [worktop], [1, 0, 0], 250).travel).toBe(250);
    // A body it already goes into does not hold it.
    const kick = { id: "plinthe", box: box(0, 600, 550, 570, 0, 100) };
    expect(pushTravel(box(0, 600), [kick], [1, 0, 0], 250).travel).toBe(250);
    // Up, against a wall unit over it.
    const wall = { id: "haut", box: box(0, 600, 0, 350, 1400, 2100) };
    expect(pushTravel(box(0, 600), [wall], [0, 0, 1], 1000)).toEqual({ travel: 600, stop: "haut" });
  });
});
