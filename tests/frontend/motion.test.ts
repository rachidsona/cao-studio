/** Motion of boards (door, drawer) and the collision check with the other bodies. */
import { describe, expect, it } from "vitest";
import { collisions, motionRange, movedBox, overlaps, pivotCorners, poseOf, type Box, type Motion } from "../../frontend/src/features/motion";

const DOOR: Box = [[0, 0, 0], [400, 18, 700]];
const hinge = (angle: number): Motion => ({ kind: "hinge", axis: 2, pivot: [0, 0, 350], angle });
const near = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i] as number, 6));

describe("pose d'un mouvement", () => {
  it("charnière à 90° autour de Z par le coin (0, 0) : la porte passe de l'axe X à l'axe Y", () => {
    const o = movedBox(DOOR, hinge(90));
    near(o.center, [-9, 200, 350]);
    near(o.axes[0], [0, 1, 0]);
    near(o.axes[1], [-1, 0, 0]);
    near(poseOf(hinge(90)).translation, [0, 0, 0]);
  });

  it("charnière autour d'un point quelconque : le pivot reste en place", () => {
    const motion: Motion = { kind: "hinge", axis: 2, pivot: [400, 18, 0], angle: 90 };
    const { rotation, translation } = poseOf(motion);
    const turned = [0, 1, 2].map((i) => rotation[i * 3]! * 400 + rotation[i * 3 + 1]! * 18 + rotation[i * 3 + 2]! * 0 + translation[i]!);
    near(turned, [400, 18, 0]);
  });

  it("tiroir : translation le long de l'axe", () => {
    near(poseOf({ kind: "slide", axis: 1, distance: 120 }).translation, [0, 120, 0]);
  });
});

describe("collisions", () => {
  it("une porte ouverte à 90° heurte ce qui est sur son passage, pas ce qui est loin", () => {
    const neighbour = { id: "voisin", box: [[-30, 100, 0], [-10, 300, 700]] as Box };
    const far = { id: "loin", box: [[500, 0, 0], [600, 100, 700]] as Box };
    expect(collisions(DOOR, hinge(90), [neighbour, far])).toEqual(["voisin"]);
  });

  it("une porte fermée qui touche seulement le caisson ne le heurte pas ; 5 mm d'empiètement, si", () => {
    expect(collisions(DOOR, hinge(0), [{ id: "caisson", box: [[0, 18, 0], [400, 578, 700]] }])).toEqual([]);
    expect(collisions(DOOR, hinge(0), [{ id: "caisson", box: [[0, 13, 0], [400, 578, 700]] }])).toEqual(["caisson"]);
  });

  it("un tiroir qui sort ne heurte pas le fond tant qu'il en reste éloigné", () => {
    const drawer: Box = [[18, 50, 100], [582, 500, 250]];
    const back = { id: "fond", box: [[0, 520, 0], [600, 523, 720]] as Box };
    expect(collisions(drawer, { kind: "slide", axis: 1, distance: 10 }, [back])).toEqual([]);
    expect(collisions(drawer, { kind: "slide", axis: 1, distance: 200 }, [back])).toEqual(["fond"]);
  });

  it("une boîte tournée de 45° : les coins empiètent là où la boîte englobante serait trop prudente", () => {
    // A square plate turned by 45° leaves the corners of its own bounding box empty.
    const plate: Box = [[0, 0, 0], [100, 100, 10]];
    const turned = movedBox(plate, { kind: "hinge", axis: 2, pivot: [50, 50, 0], angle: 45 });
    expect(overlaps(turned, [[-20, -20, 0], [-5, -5, 10]])).toBe(false);
    expect(overlaps(turned, [[-20, 40, 0], [-5, 60, 10]])).toBe(true);
  });
});

describe("amplitude et pivots", () => {
  it("un tiroir sort de sa longueur ; une porte s'ouvre de 110° de chaque côté", () => {
    expect(motionRange("slide", [[0, 0, 0], [500, 400, 100]], 1)).toEqual({ min: -400, max: 400, unit: "mm" });
    expect(motionRange("hinge", DOOR, 2)).toEqual({ min: -110, max: 110, unit: "°" });
  });

  it("quatre pivots dans le plan perpendiculaire à l'axe, à mi-hauteur", () => {
    const corners = pivotCorners(DOOR, 2).map((c) => c.pivot);
    expect(corners).toEqual([[0, 0, 350], [0, 18, 350], [400, 0, 350], [400, 18, 350]]);
  });
});
