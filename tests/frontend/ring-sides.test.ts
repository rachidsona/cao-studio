/** « Séparer les côtés » : un cadre déjà creux (rectangle, triangle, polygone) coupé en ses côtés, en onglet ou bout à bout. */
import { basicFaceExtrusion, makeBox, makePolygon, measureVolume, Vector, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { ringWalls, splitRing, type P2 } from "../../frontend/src/features/ring-sides";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const area = (poly: P2[]) => Math.abs(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * p[1], 0) / 2);
const regular = (n: number, r: number): P2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
/** A prism of this outline, `h` high, standing on z = 0. */
function prism(poly: P2[], h: number): Shape3D {
  const face = makePolygon(poly.map(([x, y]) => [x, y, 0] as [number, number, number]));
  const out = basicFaceExtrusion(face, new Vector([0, 0, h])) as Shape3D;
  face.delete();
  return out;
}
/** A ring: the outline less the same shape smaller (sides `t` thick), `h` high. */
function ring(outer: P2[], inner: P2[], h: number): Shape3D {
  const [a, b] = [prism(outer, h), prism(inner, h)];
  const out = a.cut(b) as Shape3D;
  a.delete();
  b.delete();
  return out;
}

describe("séparer les côtés d'un cadre", () => {
  it("en onglet, le cadre se partage sans reste ni recouvrement ; bout à bout, les grands côtés traversent", () => {
    const outer: P2[] = [[0, 0], [600, 0], [600, 400], [0, 400]];
    const inner: P2[] = [[18, 18], [582, 18], [582, 382], [18, 382]];
    const miter = ringWalls(outer, inner, "miter") as P2[][];
    expect(miter).toHaveLength(4);
    expect(miter.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(outer) - area(inner), 6);
    const butt = ringWalls(outer, inner, "butt") as P2[][];
    expect(butt.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(outer) - area(inner), 6);
    // The 600 long sides run through (600 × 18), the others stand between them (364 × 18).
    expect(butt.map(area).map(Math.round).sort((a, b) => a - b)).toEqual([6552, 6552, 10800, 10800]);
    expect(ringWalls(outer, [[18, 18], [582, 18], [500, 382], [18, 382]], "miter")).toMatch(/parallèles/);
  });

  it("un cadre de bois de 4 côtés, un triangle et un hexagone deviennent 4, 3 et 6 corps qui font le cadre entier", () => {
    const cases: [P2[], P2[]][] = [
      [[[0, 0], [600, 0], [600, 400], [0, 400]], [[18, 18], [582, 18], [582, 382], [18, 382]]],
      [regular(3, 400), regular(3, 400 - 36)],
      [regular(6, 300), regular(6, 300 - 21)],
    ];
    for (const joint of ["miter", "butt"] as const) {
      for (const [outer, inner] of cases) {
        const body = ring(outer, inner, 720);
        const whole = measureVolume(body);
        const sides = splitRing("Côtés", body, joint);
        expect(sides).toHaveLength(outer.length);
        expect(sides.reduce((s, p) => s + measureVolume(p), 0)).toBeCloseTo(whole, -1);
        for (const s of sides) s.delete();
        body.delete();
      }
    }
  }, 120_000);

  it("refuse un corps plein : il faut le vider d'abord", () => {
    const box = makeBox([0, 0, 0], [600, 400, 720]) as unknown as Shape3D;
    expect(() => splitRing("Côtés", box, "miter")).toThrow(/n'est pas creux/);
    box.delete();
  });
});
