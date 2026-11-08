/** Panneaux sur faces : les faces d'un volume deviennent des panneaux, en onglet à tout angle ou bout à bout. */
import { beforeAll, describe, expect, it } from "vitest";
import { drawPolysides, makeBaseBox, type Shape3D } from "replicad";
import type { PanelingFeature } from "../../frontend/src/document/types";
import { buildPaneling } from "../../frontend/src/features/paneling";
import { buildModifier } from "../../frontend/src/features/modifiers";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** The panels of the faces of `shape` the test keeps (all but its top, by default). */
function panels(shape: Shape3D, joint: PanelingFeature["joint"], keep = (z: number) => z < 0.9): Shape3D[] {
  const faces = shape.faces.filter((f) => f.geomType === "PLANE" && keep(f.normalAt(f.center).z));
  const feature: PanelingFeature = { id: "pn1", type: "paneling", name: "Panneaux 1", target: "b1", faces: faces.map((f) => describeFace(shape, f)), thickness: 10, joint };
  return buildPaneling(feature, () => ({ kind: "solid", shape })).shapes;
}
const volume = (shapes: Shape3D[]) => shapes.reduce((sum, s) => sum + bodyMetrics(s).volume, 0);

describe("panneaux sur faces", () => {
  it("une boîte sans couvercle, en onglets : cinq panneaux, la paroi exacte", () => {
    const made = panels(makeBaseBox(100, 100, 100) as Shape3D, "miter");
    expect(made).toHaveLength(5);
    expect(volume(made)).toBeCloseTo(100 ** 3 - 80 * 80 * 90, 0);
    // Le fond, en onglet sur ses quatre bords, est le plus petit ; les quatre côtés sont pareils.
    const sides = made.map((s) => bodyMetrics(s).volume).sort((a, b) => a - b);
    expect(sides[1]).toBeCloseTo(sides[4]!, 3);
    expect(sides[0]).toBeCloseTo((10 / 3) * (100 ** 2 + 80 ** 2 + 100 * 80), 0);
  });

  it("bout à bout : même paroi, le premier panneau passe", () => {
    const made = panels(makeBaseBox(100, 100, 100) as Shape3D, "butt");
    expect(made).toHaveLength(5);
    expect(volume(made)).toBeCloseTo(100 ** 3 - 80 * 80 * 90, 0);
    const first = bodyMetrics(made[0]!).bbox;
    expect(first[1][0]! - first[0][0]!).toBeCloseTo(100, 3);
  });

  it("le seau à 8 pans évasé de la vidéo : 8 côtés en onglet et un fond", () => {
    const prism = drawPolysides(200, 8).sketchOnPlane("XY").extrude(300) as Shape3D;
    const bucket = buildModifier(
      { id: "md1", type: "modifier", name: "Déformation 1", target: "b0", kind: "face-scale", amount: 0, face: { center: [0, 0, 300], u: [1, 0, 0], v: [0, 1, 0], size: [400, 400], scale: [1.5, 1.5] } },
      () => ({ kind: "solid", shape: prism }),
    ).shape as Shape3D;
    const made = panels(bucket, "miter");
    expect(made).toHaveLength(9);
    // Le fond, l'octogone entier, est le plus gros.
    const sides = made.map((s) => bodyMetrics(s).volume).sort((a, b) => a - b).slice(0, 8);
    // Les huit côtés sont identiques.
    expect(sides[0]).toBeCloseTo(sides[7]!, 0);
    expect(volume(made)).toBeLessThan(bodyMetrics(bucket).volume);
  });

  it("refuse une épaisseur nulle et une liste vide", () => {
    const box = makeBaseBox(100, 100, 100) as Shape3D;
    const base: PanelingFeature = { id: "pn1", type: "paneling", name: "Panneaux 1", target: "b1", faces: [], thickness: 10, joint: "miter" };
    expect(() => buildPaneling(base, () => ({ kind: "solid", shape: box }))).toThrow(/au moins une face/);
    expect(() => buildPaneling({ ...base, thickness: 0 }, () => ({ kind: "solid", shape: box }))).toThrow(/épaisseur/);
  });
});
