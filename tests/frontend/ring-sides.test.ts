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
  it("en haut et en bas au choix : le dessus passe et le dessous entre les côtés, ou un bout en onglet", () => {
    const outer: P2[] = [[0, 0], [600, 0], [600, 400], [0, 400]];
    const inner: P2[] = [[18, 18], [582, 18], [582, 382], [18, 382]];
    const ringArea = area(outer) - area(inner);
    const walls = (top: "miter" | "sides" | "boards", bottom: "miter" | "sides" | "boards") => ringWalls(outer, inner, "butt", 0, { up: [0, 1], corners: { top, bottom } }) as P2[][];
    // The top over the sides (600 × 18), the bottom between them (564 × 18), the sides up to the top (382 × 18).
    const over = walls("boards", "sides");
    expect(over.map(area).map(Math.round).sort((a, b) => a - b)).toEqual([6876, 6876, 10152, 10800]);
    // The bottom under the sides, the top between them: the same, upside down.
    expect(walls("sides", "boards").map(area).map(Math.round).sort((a, b) => a - b)).toEqual([6876, 6876, 10152, 10800]);
    // Mitred at the top, the sides passing at the bottom: nothing lost, nothing shared.
    for (const [top, bottom] of [["miter", "sides"], ["miter", "boards"], ["sides", "miter"], ["boards", "miter"]] as const) {
      expect(walls(top, bottom).reduce((s, w) => s + area(w), 0)).toBeCloseTo(ringArea, 6);
    }
    // All mitred, all the sides passing: as « En onglet », as « les côtés passent ».
    expect(walls("miter", "miter").map(area).map(Math.round).sort()).toEqual((ringWalls(outer, inner, "miter") as P2[][]).map(area).map(Math.round).sort());
    expect(walls("sides", "sides").map(area).map(Math.round).sort((a, b) => a - b)).toEqual([7200, 7200, 10152, 10152]);
  });

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
    // A hole of fewer corners (a triangle in a rectangle): the split follows the outline, one wall a side, nothing lost.
    const triangle: P2[] = [[18, 18], [582, 18], [300, 382]];
    for (const joint of ["miter", "butt"] as const) {
      const walls = ringWalls(outer, triangle, joint) as P2[][];
      expect(walls).toHaveLength(4);
      expect(walls.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(outer) - area(triangle), 6);
    }
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

  it("un panneau trop mince pour s'ouvrir dessus et dessous s'ouvre d'office par ses deux grandes faces", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    // A side board: 18 thick (x), 2000 long (y), 700 high (z) — its top only 18 wide.
    const board = { points: [[0, 0], [18, 0], [18, 2000], [0, 2000]].map(([x, y], i) => ({ id: `b${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `b${i}`, p2: `b${(i + 1) % 4}` })), constraints: [] };
    const doc = { ...createReferencePlate(), features: [
      { id: "sk1", type: "sketch", name: "Panneau", plane: "XY", offset: 0, ...board },
      { id: "ex1", type: "extrude", name: "Panneau", sketch: "sk1", distance: 700, operation: "new" },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "miter", frame: true },
    ] };
    const r = new Recomputer();
    const made = r.recompute(doc as never);
    expect(made.statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const out = r.output("sh1");
    expect(out?.kind === "solids" ? out.shapes.length : 0).toBe(4);
    // A frame round a hole through the board: every piece 18 thick along x.
    for (const p of out?.kind === "solids" ? out.shapes : []) {
      const b = p.boundingBox.bounds;
      expect(Math.round(b[1][0] - b[0][0])).toBe(18);
    }
    r.dispose();
  }, 120_000);

  it("un côté en onglet, mince (ses bouts coupés à 45°), s'ouvre aussi d'office par ses deux grandes faces", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    // A box 80 × 50 × 10 split into mitred sides 1.9 thick; then one side split again, its sides 1 thick.
    const pts = [[60, -25], [140, -25], [140, 25], [60, 25]];
    const sk = { id: "sk2", type: "sketch", name: "Boîte", plane: "XY", offset: 0, points: pts.map(([x, y], i) => ({ id: `p${i}`, x, y })), curves: [0, 1, 2, 3].map((i) => ({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${(i + 1) % 4}` })), constraints: [] };
    const doc = { ...createReferencePlate(), features: [sk,
      { id: "ex2", type: "extrude", name: "Boîte", sketch: "sk2", distance: 10, operation: "new" },
      { id: "sh6", type: "shell", name: "Côtés séparés 6", target: "ex2", faces: [], thickness: 1.9, sides: "separate", joint: "miter", frame: true },
      { id: "sh10", type: "shell", name: "Côtés séparés 10", target: "sh6#0", faces: [], thickness: 1, sides: "separate", joint: "miter", frame: true },
    ] };
    const r = new Recomputer();
    const made = r.recompute(doc as never);
    expect(made.statuses.find((s) => s.id === "sh10")?.state).toBe("ok");
    const out = r.output("sh10");
    expect(out?.kind === "solids" ? out.shapes.length : 0).toBe(4);
    r.dispose();
  }, 120_000);

  it("la face à vider choisie : ouvert devant et derrière (le long de y), les côtés font toute la profondeur", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { centeredRectangle } = await import("../../frontend/src/document/sketch");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    const doc = (open?: number[]) => ({
      ...createReferencePlate(),
      features: [
        { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, ...centeredRectangle(600, 400) },
        { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 720, operation: "new" },
        { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", joint: "butt", frame: true, ...(open ? { open } : {}) },
      ],
    });
    const r = new Recomputer();
    const made = r.recompute(doc([0, -1, 0]) as never);
    expect(made.statuses.find((s) => s.id === "sh1")?.state).toBe("ok");
    const out = r.output("sh1");
    const pieces = out?.kind === "solids" ? out.shapes : [];
    expect(pieces).toHaveLength(4);
    // Every side through the whole 400 along y; 600 × 720 less the opening 564 × 684, by 400.
    for (const p of pieces) {
      const b = p.boundingBox.bounds;
      expect(Math.round(b[1][1] - b[0][1])).toBe(400);
    }
    expect(pieces.reduce((s, p) => s + measureVolume(p), 0)).toBeCloseTo((600 * 720 - 564 * 684) * 400, -2);
    // A way with no face square to it: said.
    const wrong = r.recompute(doc([0.6, 0.8, 0]) as never);
    expect(wrong.statuses.find((s) => s.id === "sh1")?.message).toMatch(/face choisie/);
    r.dispose();
  }, 120_000);

  it("un contour à encoches et coins arrondis, vidé : le trou n'a pas autant de coins, la séparation suit la forme", async () => {
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const { createReferencePlate } = await import("../../frontend/src/document/types");
    // As in « can »: a plate 2220 × 850 with a notch at the right and a step at the top, three corners rounded (r 50).
    const P = [["a", 2220, 0], ["b", 2220, 220], ["c", 2170, 220], ["d", 2170, 800], ["e", 280, 800], ["f", 280, 850], ["g", 0, 850]] as const;
    const ids = ["origin", ...P.map((p) => p[0])];
    const sketch = { id: "sk1", type: "sketch", name: "Contour", plane: "XY", offset: 0, points: P.map(([id, x, y]) => ({ id, x, y })), curves: ids.map((p, i) => ({ id: `l${i}`, kind: "line", p1: p, p2: ids[(i + 1) % ids.length] })), constraints: [] };
    const edge = (x: number, y: number) => ({ type: "LINE", mid: [x, y, 25], rel: [x / 2220, y / 850, 0.5], dir: [0, 0, 1], length: 50 });
    const features = (joint: "miter" | "butt") => [
      sketch,
      { id: "ex1", type: "extrude", name: "Plaque", sketch: "sk1", distance: 50, operation: "new" },
      { id: "f1", type: "fillet", name: "Congé 1", target: "ex1", edges: [edge(2220, 0)], radius: 50 },
      { id: "f2", type: "fillet", name: "Congé 2", target: "f1", edges: [edge(0, 0)], radius: 50 },
      { id: "f3", type: "fillet", name: "Congé 3", target: "f2", edges: [edge(0, 850)], radius: 50 },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "f3", faces: [], thickness: 20, sides: "separate", joint, frame: true },
    ];
    const totals: number[] = [];
    for (const joint of ["miter", "butt"] as const) {
      const r = new Recomputer();
      const result = r.recompute({ ...createReferencePlate(), features: features(joint) } as never);
      expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
      const out = r.output("sh1");
      const parts = out?.kind === "solids" ? out.shapes : [];
      // One piece a side of the outline: 8 straight sides and 3 rounded corners.
      expect(parts).toHaveLength(11);
      totals.push(parts.reduce((s, p) => s + measureVolume(p), 0));
      r.dispose();
    }
    // The same matter either way, none lost or doubled.
    expect(totals[0]).toBeCloseTo(totals[1]!, -1);
  }, 120_000);
});
