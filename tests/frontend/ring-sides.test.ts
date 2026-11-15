/** « Séparer les côtés » : un cadre déjà creux (rectangle, triangle, polygone) coupé en ses côtés, en onglet ou bout à bout. */
import { basicFaceExtrusion, drawRoundedRectangle, makeBox, makePolygon, measureVolume, Vector, type Shape3D } from "replicad";
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
    // A wall of uneven thickness (a hole not parallel to the outline): each corner with its corner, nothing lost.
    const uneven: P2[] = [[18, 18], [582, 30], [560, 382], [25, 370]];
    for (const joint of ["miter", "butt"] as const) {
      const walls = ringWalls(outer, uneven, joint) as P2[][];
      expect(walls.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(outer) - area(uneven), 6);
    }
    expect(ringWalls(outer, [[18, 18], [582, 18], [300, 382]], "miter")).toMatch(/même nombre de côtés/);
  });

  it("bout à bout, on choisit qui passe : les côtés (debout) ou le dessus et le dessous, comme dans une Répartition", () => {
    const outer: P2[] = [[0, 0], [600, 0], [600, 400], [0, 400]];
    const inner: P2[] = [[18, 18], [582, 18], [582, 382], [18, 382]];
    const height = (w: P2[]) => Math.round(Math.max(...w.map((p) => p[1])) - Math.min(...w.map((p) => p[1])));
    const width = (w: P2[]) => Math.round(Math.max(...w.map((p) => p[0])) - Math.min(...w.map((p) => p[0])));
    // Up is y: the sides (18 wide) go the whole 400; the top and the bottom stop between them (564).
    const sides = ringWalls(outer, inner, "butt", 0, { mode: "sides", up: [0, 1] }) as P2[][];
    expect(sides.filter((w) => width(w) === 18).map(height)).toEqual([400, 400]);
    expect(sides.filter((w) => height(w) === 18).map(width)).toEqual([564, 564]);
    // The top and the bottom pass: 600 long, the sides 364 between them — here as the longest ones would.
    const boards = ringWalls(outer, inner, "butt", 0, { mode: "boards", up: [0, 1] }) as P2[][];
    expect(boards.filter((w) => height(w) === 18).map(width)).toEqual([600, 600]);
    expect(boards.filter((w) => width(w) === 18).map(height)).toEqual([364, 364]);
    // Nothing lost either way.
    for (const walls of [sides, boards]) expect(walls.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(outer) - area(inner), 6);
  });

  it("dans le noyau, un cadre debout (vu de face) : les côtés passent sur toute la hauteur", () => {
    // Its axis along y: a frame 600 wide, 720 high, 400 deep, standing.
    const outer: P2[] = [[0, 0], [600, 0], [600, 720], [0, 720]];
    const inner: P2[] = [[18, 18], [582, 18], [582, 702], [18, 702]];
    const flat = ring(outer, inner, 400);
    const standing = flat.rotate(90, [0, 0, 0], [1, 0, 0]) as Shape3D;
    const parts = splitRing("Côtés", standing, "butt", "sides");
    const heights = parts.map((p) => {
      const b = p.boundingBox.bounds;
      return [Math.round(b[1][0] - b[0][0]), Math.round(b[1][2] - b[0][2])];
    });
    // The two sides 18 wide go the whole 720 up; the top and the bottom fit between them (564).
    expect(heights.filter(([w]) => w === 18).map(([, h]) => h)).toEqual([720, 720]);
    expect(heights.filter(([, h]) => h === 18).map(([w]) => w)).toEqual([564, 564]);
    for (const p of parts) p.delete();
    // The top and the bottom passing instead, though the sides are the longer: 600 across, the sides 684 between.
    const across = splitRing("Côtés", standing, "butt", "boards").map((p) => {
      const b = p.boundingBox.bounds;
      p.delete();
      return [Math.round(b[1][0] - b[0][0]), Math.round(b[1][2] - b[0][2])];
    });
    expect(across.filter(([, h]) => h === 18).map(([w]) => w)).toEqual([600, 600]);
    expect(across.filter(([w]) => w === 18).map(([, h]) => h)).toEqual([684, 684]);
  }, 120_000);

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

  it("un cadre aux coins arrondis : ses côtés droits et ses coins courbes, chacun un corps, rien de perdu", () => {
    const solid = (w: number, h: number, r: number) => drawRoundedRectangle(w, h, r).sketchOnPlane("XY").extrude(500) as Shape3D;
    const [a, b] = [solid(600, 400, 60), solid(564, 364, 42)];
    const body = a.cut(b) as Shape3D;
    for (const joint of ["miter", "butt"] as const) {
      const sides = splitRing("Côtés", body, joint);
      expect(sides).toHaveLength(8);
      expect(sides.reduce((s, p) => s + measureVolume(p), 0)).toBeCloseTo(measureVolume(body), -1);
      for (const s of sides) s.delete();
    }
    for (const s of [a, b, body]) s.delete();
  }, 120_000);

  it("refuse un corps plein : il faut le vider d'abord", () => {
    const box = makeBox([0, 0, 0], [600, 400, 720]) as unknown as Shape3D;
    expect(() => splitRing("Côtés", box, "miter")).toThrow(/n'est pas creux/);
    box.delete();
  });
});

describe("séparer les côtés d'un corps plein", () => {
  it("un pavé plein est vidé dessus et dessous, puis séparé en ses 4 côtés à la bonne épaisseur", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { centeredRectangle } = await import("../../frontend/src/document/sketch");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    const doc = (sketch: object) => ({
      ...createReferencePlate(),
      features: [
        { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...sketch },
        { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
        { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true },
      ],
    });
    const r = new Recomputer();
    const box = r.recompute(doc(centeredRectangle(600, 400)) as never);
    expect(box.statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const out = r.output("sh1");
    expect(out?.kind === "solids" ? out.shapes.length : 0).toBe(4);
    // The sides 18 mm thick: 2 × 600 + 2 × 364, by 18 by 720.
    const volume = out?.kind === "solids" ? out.shapes.reduce((s, p) => s + measureVolume(p), 0) : 0;
    expect(volume).toBeCloseTo((2 * 600 + 2 * 364) * 18 * 720, -2);
    r.dispose();
  }, 120_000);
});
