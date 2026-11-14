/** Panneaux sur faces courbes : une face cylindrique devient une planche cintrée, prise dans le volume. */
import { makeBaseBox, makeCylinder, makeSphere, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import type { PanelingFeature } from "../../frontend/src/document/types";
import { cylinderOf } from "../../frontend/src/features/curved-panel";
import { buildPaneling } from "../../frontend/src/features/paneling";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { describeFace } from "../../frontend/src/geometry/references";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const T = 18;
const build = (shape: Shape3D, faces: ReturnType<Shape3D["faces"]["filter"]>, joint: PanelingFeature["joint"] = "miter") => {
  const feature: PanelingFeature = { id: "pn1", type: "paneling", name: "Panneaux 1", target: "b1", faces: faces.map((f) => describeFace(shape, f)), thickness: T, joint };
  return buildPaneling(feature, () => ({ kind: "solid", shape })).shapes;
};
const volume = (shapes: Shape3D[]) => shapes.reduce((sum, s) => sum + bodyMetrics(s).volume, 0);
/** A ring: a drum of radius 500 with a hole of 400, 300 high. */
const ring = () => (makeCylinder(500, 300) as unknown as Shape3D).cut(makeCylinder(400, 400, [0, 0, -50]) as unknown as Shape3D) as Shape3D;
const radiusOf = (f: Shape3D["faces"][number]) => {
  const p = f.pointOnSurface(0.5, 0.5);
  return Math.hypot(p.x, p.y);
};

describe("panneaux sur faces courbes", () => {
  it("lit l'axe, le rayon et le côté de la matière d'une face cylindrique", () => {
    const r = ring();
    const outer = r.faces.find((f) => f.geomType === "CYLINDRE" && radiusOf(f) > 450)!;
    const inner = r.faces.find((f) => f.geomType === "CYLINDRE" && radiusOf(f) < 450)!;
    const o = cylinderOf(outer);
    expect(o.radius).toBeCloseTo(500, 3);
    expect(o.convex).toBe(true);
    expect(Math.abs(o.axis[2])).toBeCloseTo(1, 6);
    expect(Math.hypot(o.centre[0], o.centre[1])).toBeCloseTo(0, 3);
    expect(o.span).toBeNull();
    const i = cylinderOf(inner);
    expect(i.radius).toBeCloseTo(400, 3);
    expect(i.convex).toBe(false);
  });

  it("l'extérieur d'un anneau devient une ceinture cintrée de 18 mm, l'intérieur aussi, prise dans la matière", () => {
    const r = ring();
    const [outer] = build(r, r.faces.filter((f) => f.geomType === "CYLINDRE" && radiusOf(f) > 450));
    expect(bodyMetrics(outer!).volume).toBeCloseTo(Math.PI * (500 ** 2 - 482 ** 2) * 300, -2);
    const [inner] = build(r, r.faces.filter((f) => f.geomType === "CYLINDRE" && radiusOf(f) < 450));
    expect(bodyMetrics(inner!).volume).toBeCloseTo(Math.PI * (418 ** 2 - 400 ** 2) * 300, -2);
  });

  it("toutes les faces d'un anneau, en onglet : les ceintures passent, le dessus et le dessous s'arrêtent contre elles, rien ne se chevauche", () => {
    const r = ring();
    // The curved ones first: they run through.
    const faces = [...r.faces.filter((f) => f.geomType === "CYLINDRE"), ...r.faces.filter((f) => f.geomType === "PLANE")];
    const made = build(r, faces);
    expect(made).toHaveLength(4);
    // The wall of the ring, 18 thick all round, and no part counted twice.
    const wall = Math.PI * (500 ** 2 - 400 ** 2) * 300 - Math.PI * (482 ** 2 - 418 ** 2) * (300 - 2 * T);
    expect(volume(made)).toBeCloseTo(wall, -2);
    const [a, b] = [bodyMetrics(made[2]!).volume, bodyMetrics(made[3]!).volume];
    expect(a).toBeCloseTo(Math.PI * (482 ** 2 - 418 ** 2) * T, -2);
    expect(b).toBeCloseTo(a, 0);
  });

  it("l'arrondi d'un angle : seulement son quart de tour, pas le reste du volume", () => {
    // A box 400 × 300 × 200 with one vertical edge rounded, radius 100.
    const box = (makeBaseBox(400, 300, 200) as unknown as Shape3D).fillet(100, (e) => e.inDirection("Z").containsPoint([200, 150, 100])) as Shape3D;
    const arc = box.faces.filter((f) => f.geomType === "CYLINDRE");
    expect(arc).toHaveLength(1);
    const c = cylinderOf(arc[0]!);
    expect(c.radius).toBeCloseTo(100, 3);
    expect(c.span![1] - c.span![0]).toBeCloseTo(Math.PI / 2, 3);
    const [panel] = build(box, arc);
    // A quarter of a ring of 100 and 82, 200 high.
    expect(bodyMetrics(panel!).volume).toBeCloseTo((Math.PI / 4) * (100 ** 2 - 82 ** 2) * 200, -1);
  });

  it("le trou d'une planche mince, ses deux faces en panneaux d'abord : il ne reste rien du sien, le message le dit", () => {
    // A board 10 thick with a hole of radius 5; panels of 5 on both faces fill its thickness.
    const board = (makeBaseBox(80, 50, 10) as unknown as Shape3D).cut(makeCylinder(5, 20, [0, 0, -5]) as unknown as Shape3D) as Shape3D;
    const feature: PanelingFeature = { id: "pn1", type: "paneling", name: "Panneaux 1", target: "b1", faces: board.faces.map((f) => describeFace(board, f)), thickness: 5, joint: "miter" };
    expect(() => buildPaneling(feature, () => ({ kind: "solid", shape: board }))).toThrow(/il ne reste rien du panneau 7/);
    expect(buildPaneling({ ...feature, thickness: 2 }, () => ({ kind: "solid", shape: board })).shapes).toHaveLength(7);
  });

  it("une sphère n'en fait pas : le message le dit", () => {
    const ball = makeSphere(300) as unknown as Shape3D;
    expect(() => build(ball, ball.faces)).toThrow(/planes ou cylindriques/);
  });
});
