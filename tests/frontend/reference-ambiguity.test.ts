/**
 * Une référence de face ou d'arête ne se reporte plus au hasard sur une voisine (audit d'architecture du 11/11/2026) :
 * deux candidates à égalité se départagent par le point gardé en millimètres, et une vraie égalité est refusée.
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { describeFace, pick, resolveFace } from "../../frontend/src/geometry/references";
import { setupKernel } from "./kernel-setup";

describe("choix entre candidates", () => {
  const a = { index: 0, score: 0.010, at: [0, 0, 100] as [number, number, number] };
  const b = { index: 1, score: 0.015, at: [0, 0, 110] as [number, number, number] };

  it("une seule bonne candidate : elle", () => {
    expect(pick([a, { ...b, score: 0.2 }], undefined)).toBe(0);
  });

  it("deux à égalité : celle du point gardé, même si son score est un peu moins bon", () => {
    expect(pick([a, b], [0, 0, 110])).toBe(1);
    expect(pick([a, b], [0, 0, 99])).toBe(0);
  });

  it("égalité qu'aucun point ne départage : refusée", () => {
    expect(pick([a, b], [0, 0, 105])).toBe("tie");
    expect(pick([a, b], undefined)).toBe("tie");
    expect(pick([], [0, 0, 0])).toBeNull();
  });
});

describe("faces de deux trous voisins, sur le vrai noyau", () => {
  beforeAll(setupKernel);

  // A side of 18 × 600 × 720 mm with two Ø5 holes 10 mm apart: their walls are tied in relative position.
  const side = (height = 720): Shape3D => {
    let shape = makeBox([0, 0, 0], [18, 600, height]) as unknown as Shape3D;
    for (const z of [300, 310]) shape = shape.cut(makeCylinder(2.5, 30, [-5, 37, z], [1, 0, 0]) as unknown as Shape3D);
    return shape;
  };

  it("la paroi du trou du haut est retrouvée, pas celle de sa voisine", () => {
    const shape = side();
    const walls = shape.faces.filter((f) => f.geomType === "CYLINDRE");
    expect(walls).toHaveLength(2);
    const upper = walls.reduce((a, b) => (a.center.z > b.center.z ? a : b));
    const ref = describeFace(shape, upper);
    expect(resolveFace(side(), ref).center.z).toBeCloseTo(310, 3);
    // The side made taller, the holes where they were: both walls are near in relative position, the stored point
    // decides.
    expect(resolveFace(side(1000), ref).center.z).toBeCloseTo(310, 3);
  });
});
