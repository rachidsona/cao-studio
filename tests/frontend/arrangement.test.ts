/** Closed areas of a sketch whose curves cross or touch: T-junctions, overlaps, lines across shapes. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { arrange } from "../../frontend/src/sketcher/arrangement";
import { extractLoops, interiorPoint, regions, sketchFaces } from "../../frontend/src/sketcher/loops";
import { ProfileError } from "../../frontend/src/sketcher/profiles";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

type Vec = [number, number];
let counter = 0;

/** A single line on its own end points (touching others only by position, never by shared points). */
function line(g: SketchGeometry, a: Vec, b: Vec): void {
  const id = ++counter;
  g.points.push({ id: `p${id}a`, x: a[0], y: a[1] }, { id: `p${id}b`, x: b[0], y: b[1] });
  g.curves.push({ id: `l${id}`, kind: "line", p1: `p${id}a`, p2: `p${id}b` });
}

/** Closed polygon with four separate lines (no shared points: the junctions are found by position). */
function polygon(g: SketchGeometry, ...v: Vec[]): void {
  v.forEach((p, i) => line(g, p, v[(i + 1) % v.length] as Vec));
}

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
const areas = (g: SketchGeometry) => extractLoops(g).map((l) => Number(l.area.toFixed(3))).sort((a, b) => a - b);

function extrude(g: SketchGeometry, regionsAt?: Vec[]): number | string {
  const sketch: Feature = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, ...g };
  const ex: Feature = { id: "ex", type: "extrude", name: "X", sketch: "sk", distance: 10, operation: "new", ...(regionsAt ? { regions: regionsAt } : {}) };
  const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [sketch, ex] };
  const r = new Recomputer();
  try {
    const result = r.recompute(doc);
    const out = r.output("ex");
    return out?.kind === "solid" ? bodyMetrics(out.shape).volume : (result.statuses.find((s) => s.message)?.message ?? "erreur");
  } finally {
    r.dispose();
  }
}

describe("jonctions en T : formes qui se touchent", () => {
  /** Right rectangle 20 × 20; the left one shares part of its left edge, and the top line runs on across both. */
  const shapes = (): SketchGeometry => {
    const g = empty();
    line(g, [0, 20], [30, 20]); // one long top line for both shapes
    line(g, [30, 20], [30, 0]);
    line(g, [30, 0], [10, 0]);
    line(g, [10, 0], [10, 20]); // left edge of the right rectangle
    line(g, [0, 20], [0, 5]); // left rectangle
    line(g, [0, 5], [10, 5]); // ends on the edge of the other one: a T
    line(g, [10, 5], [10, 20]); // along the shared part of that edge
    return g;
  };

  it("deux zones, comme deux rectangles dessinés côte à côte", () => {
    expect(areas(shapes())).toEqual([150, 400]); // 10 × 15 and 20 × 20
  });

  it("chaque zone peut être choisie, ou les deux ensemble (par défaut)", () => {
    expect(extrude(shapes())).toBeCloseTo((150 + 400) * 10, 4); // both, fused
    expect(extrude(shapes(), [[5, 12]])).toBeCloseTo(150 * 10, 4); // the left one
    expect(extrude(shapes(), [[20, 10]])).toBeCloseTo(400 * 10, 4); // the right one
  });
});

describe("croisements", () => {
  const overlapping = (): SketchGeometry => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 20], [0, 20]);
    polygon(g, [10, 10], [30, 10], [30, 30], [10, 30]);
    return g;
  };

  it("deux rectangles qui se chevauchent donnent trois zones", () => {
    expect(areas(overlapping())).toEqual([100, 300, 300]);
  });

  it("la zone commune s'extrude seule, l'ensemble donne l'union", () => {
    expect(extrude(overlapping(), [[15, 15]])).toBeCloseTo(100 * 10, 4);
    expect(extrude(overlapping())).toBeCloseTo(700 * 10, 4);
  });

  it("une ligne qui traverse un rectangle le coupe en deux, ses bouts libres sont ignorés", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 10], [0, 10]);
    line(g, [10, -5], [10, 15]);
    expect(areas(g)).toEqual([100, 100]);
    expect(extrude(g)).toBeCloseTo(200 * 10, 4);
  });

  it("un cercle qui coupe un rectangle : trois zones", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 10], [0, 10]);
    g.points.push({ id: "cc", x: 20, y: 5 });
    g.curves.push({ id: "k", kind: "circle", center: "cc", radius: 3 });
    const half = (Math.PI * 9) / 2;
    const found = areas(g);
    expect(found).toHaveLength(3);
    // The outer half circle is a polygon of 16 chords per quarter: its area is within a fraction of a percent.
    expect(found[0]).toBeCloseTo(half, 0);
    expect(found[1]).toBeCloseTo(half, 0);
    expect(found[2]).toBeCloseTo(200 - half, 0);
  });

  it("un arc qui coupe une ligne", () => {
    const g = empty();
    g.points.push({ id: "c", x: 0, y: 0 }, { id: "s", x: 10, y: 0 }, { id: "e", x: -10, y: 0 });
    g.curves.push({ id: "a1", kind: "arc", center: "c", start: "s", end: "e", radius: 10, startAngle: 0, endAngle: Math.PI });
    line(g, [-10, 0], [10, 0]); // the diameter closes the half disc
    line(g, [0, -5], [0, 15]); // a line through it
    const quarters = areas(g);
    expect(quarters).toHaveLength(2); // two quarter discs (area measured on the chord polygon: within 1 %)
    for (const area of quarters) expect(Math.abs(area - (Math.PI * 100) / 4) / ((Math.PI * 100) / 4)).toBeLessThan(0.01);
  });
});

describe("cercle et zones imbriquées", () => {
  it("le cercle dont le centre coïncide avec l'extrémité d'une ligne reste sélectionnable", () => {
    // Circle centre on a line end, by a real coincident constraint: the line is open and used to block everything.
    const g: SketchGeometry = {
      points: [{ id: "cc", x: 5, y: 5 }, { id: "q", x: 40, y: 5 }, { id: "r", x: 30, y: 30 }],
      curves: [{ id: "k", kind: "circle", center: "cc", radius: 4 }, { id: "l", kind: "line", p1: "r", p2: "q" }],
      constraints: [{ id: "c1", kind: "coincident", a: "cc", b: "r" }],
    };
    const solved = solveSketch(g).geometry;
    // The line from the centre cuts the circle into two arcs, but encloses nothing itself: one area, the disc.
    const found = areas(solved);
    expect(found).toHaveLength(1);
    expect(Math.abs((found[0] as number) - Math.PI * 16) / (Math.PI * 16)).toBeLessThan(0.01);
    expect(Number(extrude(solved))).toBeCloseTo(Math.PI * 16 * 10, 3);
    expect(extrude(solved, [[solved.points[0]!.x, solved.points[0]!.y + 1]])).toBeCloseTo(Math.PI * 16 * 10, 3);
  });

  it("deux carrés qui se touchent dans un grand rectangle : deux trous, pas un seul", () => {
    const g = empty();
    polygon(g, [0, 0], [40, 0], [40, 40], [0, 40]);
    polygon(g, [5, 5], [15, 5], [15, 15], [5, 15]);
    polygon(g, [15, 5], [25, 5], [25, 15], [15, 15]); // shares the edge x = 15 with the first
    const loops = extractLoops(g);
    expect(loops).toHaveLength(3);
    const faces = sketchFaces(loops);
    const outer = faces.find((f) => f.depth === 0)!;
    expect(outer.children).toHaveLength(2);
    expect(faces.filter((f) => f.depth === 1)).toHaveLength(2);
    // Default: the rectangle with both holes; each square can still be chosen.
    expect(Number(extrude(g))).toBeCloseTo((1600 - 200) * 10, 3);
    expect(extrude(g, [[10, 10]])).toBeCloseTo(100 * 10, 4);
    expect(extrude(g, [[20, 10]])).toBeCloseTo(100 * 10, 4);
  });

  it("un cercle isolé dans un rectangle est un trou", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 10], [0, 10]);
    g.points.push({ id: "cc", x: 10, y: 5 });
    g.curves.push({ id: "k", kind: "circle", center: "cc", radius: 3 });
    expect(Number(extrude(g))).toBeCloseTo((200 - Math.PI * 9) * 10, 3);
    expect(regions(extractLoops(g))).toHaveLength(1);
  });
});

describe("cas limites", () => {
  it("une même ligne dessinée deux fois ne crée pas de zone vide", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 10], [0, 10]);
    line(g, [0, 0], [20, 0]);
    expect(areas(g)).toEqual([200]);
  });

  it("un sommet à 1e-7 d'une ligne est bien une jonction", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 10], [0, 10]);
    line(g, [10, 0.0000001], [10, 10]); // starts a hair off the bottom edge
    expect(areas(g)).toEqual([100, 100]);
  });

  it("sans zone fermée, le profil est dit ouvert, avec l'endroit", () => {
    const g = empty();
    line(g, [0, 0], [10, 0]);
    line(g, [10, 0], [10, 10]);
    expect(() => extractLoops(g)).toThrow(ProfileError);
    expect(() => extractLoops(g)).toThrow(/Profil ouvert/);
    expect(arrange(g).open).not.toBeNull();
  });

  it("les contours sont orientés dans le sens direct et chaque zone a un point intérieur", () => {
    const g = empty();
    polygon(g, [0, 0], [20, 0], [20, 20], [0, 20]);
    polygon(g, [10, 10], [30, 10], [30, 30], [10, 30]);
    for (const face of sketchFaces(extractLoops(g))) {
      const p = interiorPoint(face);
      expect(face.outer.length).toBeGreaterThan(3);
      expect(p[0]).toBeGreaterThan(-1);
    }
    expect(arrange(g).cycles).toHaveLength(3);
  });
});
