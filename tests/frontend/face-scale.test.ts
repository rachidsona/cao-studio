/** Agrandir une face depuis son centre, comme l'échelle centrée de SketchUp : le calcul et le solide du noyau. */
import { beforeAll, describe, expect, it } from "vitest";
import { drawPolysides, makeBaseBox, makeCylinder, type Shape3D } from "replicad";
import type { FaceScale, ModifierFeature, Vec3 } from "../../frontend/src/document/types";
import { draggedScale, faceFrame, handlePoint, scaledPoint } from "../../frontend/src/features/face-scale";
import { buildModifier } from "../../frontend/src/features/modifiers";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const top = (size: number, height: number, scale: [number, number]): FaceScale => ({ center: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], size: [size, size], scale });
const scaled = (shape: unknown, face: FaceScale): Shape3D => {
  const feature: ModifierFeature = { id: "md1", type: "modifier", name: "Déformation 1", target: "b1", kind: "face-scale", amount: 0, face };
  return buildModifier(feature, () => ({ kind: "solid", shape: shape as Shape3D })).shape as Shape3D;
};

describe("cadre d'une face", () => {
  it("se pose sur les axes du modèle, centré sur la face", () => {
    const f = faceFrame([0, 0, 1], [[0, 0, 5], [100, 0, 5], [100, 40, 5], [0, 40, 5]]);
    expect(f).toMatchObject({ center: [50, 20, 5], u: [1, 0, 0], v: [0, 1, 0], size: [100, 40], scale: [1, 1] });
  });

  it("prend toute la largeur d'un cercle", () => {
    const f = faceFrame([0, 0, 1], [], [{ center: [10, 20, 30], radius: 50 }]);
    expect(f.center).toEqual([10, 20, 30]);
    expect(f.size).toEqual([100, 100]);
  });

  it("une face debout : le long du modèle, puis vers le haut", () => {
    const f = faceFrame([0, -1, 0], [[0, 0, 0], [100, 0, 0], [100, 0, 50], [0, 0, 50]]);
    expect(f.u).toEqual([1, 0, 0]);
    expect(Math.abs(f.v[2])).toBe(1);
    expect(f.size).toEqual([100, 50]);
  });
});

describe("échelle de la face", () => {
  const face = top(100, 10, [1.5, 1.5]);

  it("écarte du centre les points de la face, et d'elle seule", () => {
    expect(scaledPoint(face, [50, 50, 10])).toEqual([75, 75, 10]);
    expect(scaledPoint(face, [0, 0, 10])).toEqual([0, 0, 10]);
    expect(scaledPoint(face, [50, 50, 0])).toBeNull();
    expect(scaledPoint(face, [80, 0, 10])).toBeNull();
  });

  it("un coin tire les deux sens, le milieu d'un côté un seul", () => {
    const f = top(100, 10, [1, 1]);
    expect(draggedScale(f, [1, 1], [75, 75, 10])).toEqual([1.5, 1.5]);
    expect(draggedScale(f, [-1, -1], [-25, -25, 10])).toEqual([0.5, 0.5]);
    expect(draggedScale(f, [1, 0], [100, 30, 10])).toEqual([2, 1]);
    expect(draggedScale(f, [0, -1], [30, -75, 10])).toEqual([1, 1.5]);
  });

  it("ne passe jamais de l'autre côté du centre", () => {
    expect(draggedScale(top(100, 10, [1, 1]), [1, 1], [-300, -300, 10])).toEqual([0.05, 0.05]);
  });

  it("le cadre suit l'échelle", () => {
    expect(handlePoint(face, [1, 1])).toEqual([75, 75, 10] as Vec3);
    expect(handlePoint(face, [0, -1])).toEqual([0, -75, 10] as Vec3);
  });
});

describe("dans le noyau", () => {
  it("le dessus d'un cube agrandi : un tronc de pyramide, le dessous à sa place", () => {
    const [s, h, k] = [100, 200, 1.5];
    const shape = scaled(makeBaseBox(s, s, h), top(s, h, [k, k]));
    const m = bodyMetrics(shape);
    expect(m.bbox[0]![2]).toBeCloseTo(0, 6);
    expect(m.bbox[1]![2]).toBeCloseTo(h, 6);
    expect(m.bbox[1]![0]).toBeCloseTo(75, 6);
    expect(m.volume).toBeCloseTo((h / 3) * (s * s + (s * k) ** 2 + s * s * k), 1);
    // Les côtés restent des faces planes : 6 faces, pas des facettes.
    expect(shape.faces).toHaveLength(6);
  });

  it("un prisme à 8 pans fait un seau à 8 pans, comme dans la vidéo", () => {
    const shape = drawPolysides(200, 8).sketchOnPlane("XY").extrude(300) as Shape3D;
    const before = bodyMetrics(shape);
    const outlineSize = before.bbox[1]![0]! - before.bbox[0]![0]!;
    const made = scaled(shape, { ...top(outlineSize, 300, [1.5, 1.5]), size: [outlineSize, before.bbox[1]![1]! - before.bbox[0]![1]!] });
    expect(made.faces).toHaveLength(10);
    expect(bodyMetrics(made).bbox[1]![0]).toBeCloseTo(before.bbox[1]![0]! * 1.5, 3);
  });

  it("un cylindre fait un tronc de cône à facettes, solide", () => {
    const made = scaled(makeCylinder(50, 100, [0, 0, 0], [0, 0, 1]), top(100, 100, [1.5, 1.5]));
    const m = bodyMetrics(made);
    expect(m.bbox[1]![0]).toBeCloseTo(75, 1);
    expect(m.volume).toBeGreaterThan(Math.PI * 2500 * 100);
  });

  it("dit quand la face n'est plus sur le corps", () => {
    expect(() => scaled(makeBaseBox(100, 100, 50), top(100, 200, [1.5, 1.5]))).toThrow(/n'est plus sur le corps/);
  });
});
