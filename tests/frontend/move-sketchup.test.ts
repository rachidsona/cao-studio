/**
 * Déplacer à la façon de SketchUp : ce qu'on tape pendant le déplacement (une distance, un vecteur, x5, /5), les
 * flèches qui bloquent un axe, et le suivi de la souris (le point accroché, la face visée, le sol, l'axe bloqué).
 */
import { describe, expect, it } from "vitest";
import { followMove, movedBy } from "../../frontend/src/app/move-follow";
import { arrowAxis, parseTyped } from "../../frontend/src/app/move-keys";

describe("ce qu'on tape", () => {
  it("une distance dans l'unité affichée, un vecteur, des copies au même pas ou réparties", () => {
    expect(parseTyped("25", "cm")).toEqual({ kind: "distance", value: 250 });
    expect(parseTyped("12,5", "mm")).toEqual({ kind: "distance", value: 12.5 });
    expect(parseTyped("-10", "cm")).toEqual({ kind: "distance", value: -100 });
    expect(parseTyped("10;20;0", "cm")).toEqual({ kind: "vector", value: [100, 200, 0] });
    expect(parseTyped("x5", "cm")).toEqual({ kind: "copies", count: 5 });
    expect(parseTyped("*3", "cm")).toEqual({ kind: "copies", count: 3 });
    expect(parseTyped("4x", "cm")).toEqual({ kind: "copies", count: 4 });
    expect(parseTyped("/5", "cm")).toEqual({ kind: "divide", count: 5 });
    expect(parseTyped("/1", "cm")).toBeNull();
    expect(parseTyped("abc", "cm")).toBeNull();
    expect(parseTyped("", "cm")).toBeNull();
  });

  it("les flèches : → X, ← Y, ↑ Z, ↓ libère ; une autre touche n'est pas une flèche", () => {
    expect([arrowAxis("ArrowRight"), arrowAxis("ArrowLeft"), arrowAxis("ArrowUp"), arrowAxis("ArrowDown"), arrowAxis("a")]).toEqual([0, 1, 2, null, undefined]);
  });
});

describe("le suivi de la souris", () => {
  const down = { origin: [0, -1000, 1000] as [number, number, number], direction: [0, Math.SQRT1_2, -Math.SQRT1_2] as [number, number, number] };

  it("jusqu'au point accroché, sinon au point de la face, sinon sur le sol passant par le pivot", () => {
    expect(followMove({ source: [0, 0, 0], ray: down, axis: null, snap: [100, 50, 20], face: [1, 1, 1], step: 1 })).toEqual([100, 50, 20]);
    expect(followMove({ source: [0, 0, 0], ray: down, axis: null, snap: null, face: [30, 40, 0], step: 1 })).toEqual([30, 40, 0]);
    // The ray meets the floor z = 0 at y = 0: the pivot stays where it is.
    const floor = followMove({ source: [0, 0, 0], ray: down, axis: null, snap: null, face: null, step: 1 })!;
    expect(floor.map((c) => Math.abs(c))).toEqual([0, 0, 0]);
  });

  it("l'axe bloqué : le point accroché projeté sur la ligne de l'axe, ou le point de la ligne le plus près du rayon", () => {
    expect(followMove({ source: [0, 0, 0], ray: down, axis: [1, 0, 0], snap: [100, 50, 20], face: null, step: 1 })).toEqual([100, 0, 0]);
    const along = followMove({ source: [0, 0, 0], ray: { origin: [300, -1000, 0], direction: [0, 1, 0] }, axis: [1, 0, 0], snap: null, face: null, step: 10 });
    expect(along).toEqual([300, 0, 0]);
  });

  it("une distance tapée : le long de l'axe bloqué (dans le sens montré) ou du déplacement montré ; sans direction, rien", () => {
    expect(movedBy(250, [0, -10, 0], [0, 1, 0])).toEqual([-0, -250, -0]);
    expect(movedBy(50, [30, 40, 0], null)).toEqual([30, 40, 0]);
    expect(movedBy(50, [0, 0, 0], null)).toBeNull();
  });
});
