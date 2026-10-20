/** Offset (Décalage) in sketches: kernel computation, chain extraction and the resulting geometry. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { GeometryError } from "../../frontend/src/geometry/kernel";
import { offsetPaths, type OffsetCurve, type OffsetPath } from "../../frontend/src/geometry/offset";
import { addArc, addCircle, addLine, addRectangle, type Vec2 } from "../../frontend/src/sketcher/edit";
import { addOffsetCurves, connectedChain, offsetPreview, OffsetSelectionError, pathsFromCurves } from "../../frontend/src/sketcher/offset";
import { extractLoops } from "../../frontend/src/sketcher/loops";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { Recomputer } from "../../frontend/src/history/recompute";
import type { CadDocument } from "../../frontend/src/document/types";
import { sketchFrame } from "../../frontend/src/sketcher/frame";
import { projectOutline } from "../../frontend/src/sketcher/projection";
import { allConstruction } from "../../frontend/src/sketcher/offset";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
const square = (size = 10): SketchGeometry => addRectangle(empty(), { at: [0, 0] }, { at: [size, size] }).geometry;

/** Area enclosed by the curves of a closed offset (shoelace, arcs sampled). */
function area(curves: OffsetCurve[]): number {
  const g = addOffsetCurves(empty(), curves).geometry;
  return extractLoops(g).reduce((sum, loop) => sum + loop.area, 0);
}

const bounds = (curves: OffsetCurve[]) => {
  const pts: Vec2[] = curves.flatMap((c) => (c.kind === "line" ? [c.a, c.b] : c.kind === "arc" ? [c.a, c.b, c.mid] : [[c.center[0] - c.radius, c.center[1]], [c.center[0] + c.radius, c.center[1]]] as Vec2[]));
  return { x: [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))], y: [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))] };
};

describe("décalage d'un contour fermé", () => {
  const rect = (): OffsetPath[] => pathsFromCurves(square(), square().curves.map((c) => c.id));

  it("vers l'extérieur avec coins arrondis : 4 lignes et 4 arcs, aire exacte", () => {
    const { curves } = offsetPaths(rect(), 2, "round");
    expect(curves.filter((c) => c.kind === "line")).toHaveLength(4);
    expect(curves.filter((c) => c.kind === "arc")).toHaveLength(4);
    expect(bounds(curves).x).toEqual([-2, 12].map((v) => expect.closeTo(v, 6)));
    expect(area(curves)).toBeCloseTo(100 + 4 * 10 * 2 + Math.PI * 4, 1);
  });

  it("vers l'extérieur avec coins vifs : carré 14 × 14", () => {
    const { curves } = offsetPaths(rect(), 2, "sharp");
    expect(curves).toHaveLength(4);
    expect(area(curves)).toBeCloseTo(196, 6);
  });

  it("vers l'intérieur (distance négative) : carré 6 × 6", () => {
    const { curves } = offsetPaths(rect(), -2, "round");
    expect(curves).toHaveLength(4);
    expect(area(curves)).toBeCloseTo(36, 6);
  });

  it("refuse un décalage qui fait disparaître la forme", () => {
    expect(() => offsetPaths(rect(), -6)).toThrow(/trop grande/);
    expect(() => offsetPaths(rect(), 0)).toThrow(GeometryError);
  });

  it("garde un contour concave correct vers l'intérieur (L, coins vifs)", () => {
    let g = empty();
    const pts: Vec2[] = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
    pts.forEach((p, i) => {
      g = addLine(g, { at: p }, { at: pts[(i + 1) % pts.length] as Vec2 }, { autoAlign: false }).geometry;
    });
    // addLine with `at` creates a point per end; weld the shared corners the way drawing does.
    const welded: SketchGeometry = { ...g, points: [], curves: [], constraints: [] };
    pts.forEach((p, i) => welded.points.push({ id: `v${i}`, x: p[0], y: p[1] }));
    pts.forEach((_, i) => welded.curves.push({ id: `e${i}`, kind: "line", p1: `v${i}`, p2: `v${(i + 1) % pts.length}` }));
    const paths = pathsFromCurves(welded, welded.curves.map((c) => c.id));
    expect(paths).toHaveLength(1);
    const { curves } = offsetPaths(paths, -2, "sharp");
    expect(area(curves)).toBeCloseTo(156, 6);
  });
});

describe("décalage de cercles et d'arcs", () => {
  it("cercle : rayon augmenté ou réduit", () => {
    const circle = addCircle(empty(), { at: [5, 5] }, 5).geometry;
    const paths = pathsFromCurves(circle, circle.curves.map((c) => c.id));
    const out = offsetPaths(paths, 2).curves[0];
    expect(out).toMatchObject({ kind: "circle", radius: expect.closeTo(7, 6) });
    const inner = offsetPaths(paths, -2).curves[0];
    expect(inner).toMatchObject({ kind: "circle", radius: expect.closeTo(3, 6) });
    expect(() => offsetPaths(paths, -6)).toThrow(/disparaître/);
  });

  it("arc : côté gauche du sens de tracé pour une distance positive", () => {
    // Quarter arc from (5,0) to (0,5) around the origin, drawn counter-clockwise.
    const arc = addArc(empty(), { at: [0, 0] }, { at: [5, 0] }, [0, 5]).geometry;
    const paths = pathsFromCurves(arc, arc.curves.map((c) => c.id));
    const left = offsetPaths(paths, 2).curves[0];
    expect(left).toMatchObject({ kind: "arc", radius: expect.closeTo(3, 6) }); // left of a CCW arc is inside
    const right = offsetPaths(paths, -2).curves[0];
    expect(right).toMatchObject({ kind: "arc", radius: expect.closeTo(7, 6) });
  });
});

describe("décalage d'une chaîne ouverte", () => {
  const polyline = (): SketchGeometry => {
    let g = addLine(empty(), { at: [0, 0] }, { at: [10, 0] }, { autoAlign: false });
    const lastId = g.lastPoint;
    g = addLine(g.geometry, { pointId: lastId }, { at: [10, 10] }, { autoAlign: false });
    return g.geometry;
  };

  it("polyligne : un seul côté, raccord arrondi sur le coin extérieur", () => {
    const g = polyline();
    const paths = pathsFromCurves(g, g.curves.map((c) => c.id));
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ kind: "chain", closed: false, start: [0, 0] });
    // Left of (0,0)→(10,0)→(10,10) is the inside of the corner: no arc, two lines meeting at (8, 2).
    const left = offsetPaths(paths, 2).curves;
    expect(left.filter((c) => c.kind === "arc")).toHaveLength(0);
    expect(bounds(left).x).toEqual([expect.closeTo(0, 6), expect.closeTo(8, 6)]);
    // Right side: the outside of the corner gets a rounded join.
    const right = offsetPaths(paths, -2).curves;
    expect(right.filter((c) => c.kind === "arc")).toHaveLength(1);
    expect(bounds(right).y[0]).toBeCloseTo(-2, 6);
  });

  it("segment seul : translation exacte, à gauche du sens p1 → p2", () => {
    const g = addLine(empty(), { at: [0, 0] }, { at: [10, 0] }, { autoAlign: false }).geometry;
    const paths = pathsFromCurves(g, g.curves.map((c) => c.id));
    expect(offsetPaths(paths, 3).curves).toEqual([{ kind: "line", a: [expect.closeTo(0, 9), 3], b: [10, 3] }]);
    expect(offsetPaths(paths, -3).curves[0]).toMatchObject({ a: [expect.closeTo(0, 9), -3] });
  });
});

/** Stadium: two 20 mm lines joined by two half circles of radius 5 (a rounded slot). */
const stadium = (): SketchGeometry => ({
  points: [
    { id: "a", x: 0, y: -5 },
    { id: "b", x: 20, y: -5 },
    { id: "c", x: 20, y: 5 },
    { id: "d", x: 0, y: 5 },
    { id: "o1", x: 20, y: 0 },
    { id: "o2", x: 0, y: 0 },
  ],
  curves: [
    { id: "l1", kind: "line", p1: "a", p2: "b" },
    { id: "a1", kind: "arc", center: "o1", start: "b", end: "c", radius: 5, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 },
    { id: "l2", kind: "line", p1: "c", p2: "d" },
    { id: "a2", kind: "arc", center: "o2", start: "d", end: "a", radius: 5, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2 },
  ],
  constraints: [],
});

describe("contours mixtes lignes et arcs", () => {
  it("rainure : l'aire suit exactement le rayon augmenté ou réduit", () => {
    const g = stadium();
    const paths = pathsFromCurves(g, g.curves.map((c) => c.id));
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ kind: "chain", closed: true });
    // The area comes from a polygon approximation of the arcs: compare within 0.5 %.
    const near = (value: number, exact: number) => expect(Math.abs(value - exact) / exact).toBeLessThan(0.005);
    // Outside by 2: a stadium of radius 7 (arcs stay arcs, no corner to round).
    const outside = offsetPaths(paths, 2).curves;
    expect(outside.filter((c) => c.kind === "arc")).toHaveLength(2);
    near(area(outside), 20 * 14 + Math.PI * 49);
    // Inside by 2: radius 3.
    near(area(offsetPaths(paths, -2).curves), 20 * 6 + Math.PI * 9);
    // Inside by 5 or more: the slot closes up.
    expect(() => offsetPaths(paths, -5.5)).toThrow(GeometryError);
  });

  it("chaîne ouverte ligne + arc : même côté sur toute la chaîne", () => {
    // Half of the stadium: bottom line, right arc, top line (open, drawn counter-clockwise).
    const g = stadium();
    const paths = pathsFromCurves(g, ["l1", "a1", "l2"]);
    expect(paths[0]).toMatchObject({ closed: false });
    const outside = offsetPaths(paths, -2).curves; // right of a counter-clockwise walk = outside
    expect(bounds(outside).y).toEqual([expect.closeTo(-7, 6), expect.closeTo(7, 6)]);
    expect(bounds(outside).x[1]).toBeCloseTo(27, 6);
    const inside = offsetPaths(paths, 2).curves;
    expect(bounds(inside).y).toEqual([expect.closeTo(-3, 6), expect.closeTo(3, 6)]);
    expect(bounds(inside).x[1]).toBeCloseTo(23, 6);
  });

  it("le sens de tracé fixe la gauche : polyligne dessinée à l'envers", () => {
    let g = addLine(empty(), { at: [10, 10] }, { at: [10, 0] }, { autoAlign: false });
    g = addLine(g.geometry, { pointId: g.lastPoint }, { at: [0, 0] }, { autoAlign: false });
    const paths = pathsFromCurves(g.geometry, g.geometry.curves.map((c) => c.id));
    const left = offsetPaths(paths, 2).curves; // travelling down then left: left is the outside (x = 12, y = -2)
    expect(left.filter((c) => c.kind === "arc")).toHaveLength(1);
    expect(bounds(left).x[1]).toBeCloseTo(12, 6);
  });

  it("forme qui se recoupe : jamais de courbe fausse, sinon une erreur claire", () => {
    // Bow-tie (self-intersecting closed path).
    const pts: Vec2[] = [[0, 0], [10, 10], [10, 0], [0, 10]];
    const g: SketchGeometry = { points: pts.map((p, i) => ({ id: `v${i}`, x: p[0], y: p[1] })), curves: [], constraints: [] };
    pts.forEach((_, i) => g.curves.push({ id: `e${i}`, kind: "line", p1: `v${i}`, p2: `v${(i + 1) % 4}` }));
    const paths = pathsFromCurves(g, g.curves.map((c) => c.id));
    for (const d of [1, -1]) {
      try {
        const { curves } = offsetPaths(paths, d);
        expect(curves.length).toBeGreaterThan(0);
      } catch (error) {
        expect(error).toBeInstanceOf(GeometryError);
      }
    }
  });
});

describe("sélection et géométrie résultante", () => {
  it("étend un clic à toute la chaîne connectée, sans traverser un embranchement", () => {
    const g = square();
    const ids = g.curves.map((c) => c.id);
    expect(connectedChain(g, ids[0] as string).sort()).toEqual([...ids].sort());
    // A line leaving one corner makes it a junction: the chain stops there, the branch is left out.
    const branched = addLine(g, { pointId: g.points[0]!.id }, { at: [-5, -5] }, { autoAlign: false }).geometry;
    const chain = connectedChain(branched, ids[1] as string);
    expect(chain.sort()).toEqual([...ids].sort()); // the loop through the junction, without the branch
    expect(chain).not.toContain(branched.curves.at(-1)!.id);
  });

  it("refuse une sélection ramifiée avec un message clair", () => {
    const g = addLine(square(), { pointId: "p1" }, { at: [-5, -5] }, { autoAlign: false }).geometry;
    expect(() => pathsFromCurves(g, g.curves.map((c) => c.id))).toThrow(OffsetSelectionError);
  });

  it("conserve l'original et ajoute des courbes soudées, résolubles et fermées", () => {
    const g = square();
    const before = JSON.stringify(g);
    const paths = pathsFromCurves(g, g.curves.map((c) => c.id));
    const { curves } = offsetPaths(paths, 3, "round");
    const { geometry, created } = addOffsetCurves(g, curves);
    expect(JSON.stringify(g)).toBe(before); // the input is not modified
    expect(geometry.curves).toHaveLength(4 + created.length);
    expect(geometry.curves.slice(0, 4)).toEqual(g.curves);
    // Two nested closed contours: the original and its offset.
    expect(extractLoops(geometry)).toHaveLength(2);
    expect(solveSketch(geometry).state).not.toBe("failed");
  });

  it("le décalage d'une géométrie de construction reste de la construction", () => {
    const g = addCircle(empty(), { at: [0, 0] }, 4, true).geometry;
    const { curves } = offsetPaths(pathsFromCurves(g, ["k1"]), 1);
    expect(addOffsetCurves(g, curves, true).geometry.curves[1]).toMatchObject({ construction: true });
  });

  it("l'aperçu décrit exactement les courbes calculées", () => {
    const { curves } = offsetPaths(pathsFromCurves(square(), ["l1", "l2", "l3", "l4"]), 2, "round");
    const preview = offsetPreview(curves);
    expect(preview.lines).toHaveLength(4);
    expect(preview.arcs).toHaveLength(4);
    for (const arc of preview.arcs) expect(arc.end).toBeGreaterThan(arc.start);
  });
});

describe("décalage des arêtes projetées d'une face", () => {
  /** Top face (z = 10) of an 80 × 50 plate with a Ø10 hole. */
  const topFace: FaceOutline = {
    surface: "PLANE",
    center: [0, 0, 10],
    normal: [0, 0, 1],
    edges: [
      { kind: "line", a: [-40, -25, 10], b: [40, -25, 10] },
      { kind: "line", a: [40, -25, 10], b: [40, 25, 10] },
      { kind: "line", a: [40, 25, 10], b: [-40, 25, 10] },
      { kind: "line", a: [-40, 25, 10], b: [-40, -25, 10] },
      { kind: "circle", center: [0, 0, 10], radius: 5 },
    ],
  };

  it("donne un profil réel (pas de la construction) qu'on peut extruder", () => {
    const projected = projectOutline(topFace, sketchFrame("XY", 10));
    const ids = projected.curves.map((c) => c.id);
    expect(allConstruction(projected, ids)).toBe(false); // projected curves are not "construction" for offset
    const { curves } = offsetPaths(pathsFromCurves(projected, ids), -3, "sharp"); // 3 mm inside the outline
    const { geometry } = addOffsetCurves(projected, curves, allConstruction(projected, ids));
    // The projected outline stays reference-only; the offset forms one region with the hole inside it.
    expect(extractLoops(geometry)).toHaveLength(2);
    const solved = solveSketch(geometry);
    expect(solved.state).not.toBe("failed");
    const doc: CadDocument = {
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [
        { id: "sk", type: "sketch", name: "Retrait", plane: "XY", offset: 10, ...solved.geometry },
        { id: "ex", type: "extrude", name: "Poche", sketch: "sk", distance: 5, operation: "new" },
      ],
    };
    const r = new Recomputer();
    r.recompute(doc);
    const out = r.output("ex");
    if (out?.kind !== "solid") throw new Error("solid expected");
    // Inset rectangle 74 × 44 with the hole offset inward to Ø4 (radius 2), 5 mm thick.
    expect(bodyMetrics(out.shape).volume).toBeCloseTo((74 * 44 - Math.PI * 4) * 5, 3);
    r.dispose();
  });
});
