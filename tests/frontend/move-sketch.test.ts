/** Move in a sketch: real solving with the constraints, never a visual shift; and the move of a whole sketch in 3D. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import { ORIGIN, rectangleAt, type SketchGeometry } from "../../frontend/src/document/sketch";
import type { CadDocument, Feature, SketchFeature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { addCircle, addConstraint, addLine, addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import { basePoint, deltaToPolar, immovable, movablePoints, moveGeometry, movePreview, moveSketchPlane, polarToDelta, withContours } from "../../frontend/src/sketcher/move";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
const pos = (g: SketchGeometry, id: string) => pointPos(g, id).map((v) => Number(v.toFixed(6)));

/** Free rectangle (0,0)–(20,10) with horizontal / vertical sides: points p1..p4, lines l1..l4. */
const rect = () => addRectangle(empty(), { at: [0, 0] }, { at: [20, 10] }).geometry;

describe("sélection à déplacer", () => {
  it("un segment prend ses deux extrémités, un cercle son centre, un point lui-même", () => {
    const g = addCircle(rect(), { at: [50, 50] }, 4).geometry;
    expect(movablePoints(g, new Set(["l1"])).sort()).toEqual(["p1", "p2"]);
    expect(movablePoints(g, new Set(["k1"]))).toHaveLength(1);
    expect(movablePoints(g, new Set(["p3"]))).toEqual(["p3"]);
    // Several elements: each point once.
    expect(movablePoints(g, new Set(["l1", "l2", "p3"])).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("le contour d'un rectangle compte ses quatre côtés, pas une ligne isolée", () => {
    const g = addLine(rect(), { at: [100, 0] }, { at: [120, 0] }).geometry;
    expect([...withContours(g, new Set(["l1"]))].sort()).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("point de base : le point sélectionné, sinon le centre de la sélection", () => {
    const g = rect();
    expect(basePoint(g, new Set(["p3"]), ["p3"])?.pos).toEqual([20, 10]);
    expect(basePoint(g, new Set(["l1", "l2", "l3", "l4"]), ["p1", "p2", "p3", "p4"])?.pos).toEqual([10, 5]);
    expect(basePoint(g, new Set(), [])).toBeNull();
  });

  it("coordonnées polaires et relatives s'équivalent", () => {
    const [dx, dy] = polarToDelta(10, 90);
    expect(dx).toBeCloseTo(0, 9);
    expect(dy).toBeCloseTo(10, 9);
    expect(deltaToPolar([3, 4]).distance).toBeCloseTo(5, 9);
    expect(deltaToPolar([0, 4]).angle).toBeCloseTo(90, 9);
    expect(deltaToPolar([-5, 0]).angle).toBeCloseTo(180, 9);
  });
});

describe("déplacement avec le solveur", () => {
  it("déplace un rectangle entier sans le déformer ni changer ses contraintes", () => {
    const g = rect();
    const out = moveGeometry(g, movablePoints(g, new Set(["l1", "l2", "l3", "l4"])), [7, -3]);
    if (!out.ok) throw new Error(out.reason);
    expect(pos(out.geometry, "p1")).toEqual([7, -3]);
    expect(pos(out.geometry, "p3")).toEqual([27, 7]);
    expect(out.geometry.constraints).toEqual(g.constraints);
    expect(solveSketch(out.geometry).dof).toBe(solveSketch(g).dof);
  });

  it("déplacer un seul coin d'un rectangle contraint étire le rectangle : les contraintes H/V sont respectées", () => {
    const g = rect();
    const out = moveGeometry(g, ["p3"], [5, 4]);
    if (!out.ok) throw new Error(out.reason);
    // p3 is where it was told to go; its neighbours followed to keep the sides horizontal and vertical.
    expect(pos(out.geometry, "p3")).toEqual([25, 14]);
    expect(pos(out.geometry, "p2")[0]).toBeCloseTo(25, 6);
    expect(pos(out.geometry, "p4")[1]).toBeCloseTo(14, 6);
    expect(pos(out.geometry, "p1")).toEqual([0, 0]);
  });

  it("un cercle se déplace par son centre : le rayon est conservé", () => {
    const g = addCircle(empty(), { at: [5, 5] }, 4).geometry;
    const out = moveGeometry(g, movablePoints(g, new Set(["k1"])), [10, 0]);
    if (!out.ok) throw new Error(out.reason);
    expect(pos(out.geometry, "p1")).toEqual([15, 5]);
    expect(out.geometry.curves[0]).toMatchObject({ kind: "circle", radius: 4 });
  });

  it("un déplacement qui contredit une cote est refusé, la contrainte nommée", () => {
    // a is fixed in place, b is at 10 mm from a by a length constraint: b cannot be moved along the line.
    let g: SketchGeometry = { points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }], curves: [{ id: "l1", kind: "line", p1: "a", p2: "b" }], constraints: [] };
    g = addConstraint(g, { kind: "fix", point: "a", x: 0, y: 0 } as never).geometry;
    g = addConstraint(g, { kind: "length", line: "l1", value: 10 } as never).geometry;
    const out = moveGeometry(g, ["b"], [5, 0]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/contredit des contraintes/);
    // Moving the whole line is also refused: a is fixed.
    expect(moveGeometry(g, ["a", "b"], [5, 0]).ok).toBe(false);
  });

  it("refuse l'origine et les points fixes projetés d'un corps", () => {
    const circleAtOrigin: SketchGeometry = { points: [], curves: [{ id: "k1", kind: "circle", center: ORIGIN, radius: 3 }], constraints: [] };
    expect(moveGeometry(circleAtOrigin, movablePoints(circleAtOrigin, new Set(["k1"])), [1, 1])).toMatchObject({ ok: false, reason: expect.stringMatching(/origine/) });
    const projected: SketchGeometry = { points: [{ id: "q1", x: 0, y: 0, fixed: true }], curves: [], constraints: [] };
    expect(immovable(projected, ["q1"])).toMatch(/point fixe/);
    expect(moveGeometry(projected, ["q1"], [1, 0]).ok).toBe(false);
  });

  it("un déplacement nul ne change rien ; aucune sélection est expliquée", () => {
    const g = rect();
    expect(moveGeometry(g, ["p1"], [0, 0])).toMatchObject({ ok: true, unchanged: true });
    expect(moveGeometry(g, [], [1, 1])).toMatchObject({ ok: false, reason: expect.stringMatching(/Sélectionnez/) });
    expect(moveGeometry(g, ["p1"], [Number.NaN, 1]).ok).toBe(false);
  });

  it("l'aperçu ne montre que ce qui change", () => {
    const g = addLine(rect(), { at: [100, 0] }, { at: [120, 0] }).geometry;
    const out = moveGeometry(g, movablePoints(g, new Set(["l1", "l2", "l3", "l4"])), [3, 3]);
    if (!out.ok) throw new Error(out.reason);
    const preview = movePreview(g, out.geometry);
    expect(preview.lines).toHaveLength(4); // the stray line did not move
  });
});

describe("déplacer une esquisse entière en 3D", () => {
  const sketch = (over: Partial<SketchFeature> = {}): SketchFeature => ({ id: "sk", type: "sketch", name: "Esquisse", plane: "XY", offset: 0, ...rectangleAt(0, 0, 40, 20), ...over });

  it("le long de sa normale : le décalage du plan change", () => {
    const moved = moveSketchPlane(sketch(), [0, 0, 12.5]);
    expect(typeof moved).toBe("object");
    expect(moved).toMatchObject({ offset: 12.5 });
    const xz = moveSketchPlane(sketch({ plane: "XZ" }), [0, 4, 0]); // XZ has its normal along −Y
    expect(xz).toMatchObject({ offset: -4 });
  });

  it("dans son plan : tous les points suivent, les cotes d'origine l'interdisent", () => {
    const free: SketchFeature = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, ...rect() };
    const moved = moveSketchPlane(free, [10, -5, 0]);
    if (typeof moved === "string") throw new Error(moved);
    expect(moved.points[0]).toMatchObject({ x: 10, y: -5 });
    expect(moved.offset).toBe(0);
    // The reference plate is tied to the origin by its constraints: refused with a reason, the normal move stays possible.
    expect(moveSketchPlane(sketch(), [10, 0, 0])).toMatch(/liée à l'origine/);
    expect(moveSketchPlane(sketch(), [0, 0, 3])).toMatchObject({ offset: 3 });
  });

  it("agit sur le modèle réel : le corps extrudé se retrouve déplacé", () => {
    const free: SketchFeature = { id: "sk", type: "sketch", name: "E", plane: "XY", offset: 0, ...rect() };
    const doc = (s: SketchFeature): CadDocument => ({
      format: "cao-studio",
      schemaVersion: 2,
      units: "mm",
      parameters: {},
      features: [s, { id: "ex", type: "extrude", name: "Extrusion", sketch: "sk", distance: 5, operation: "new" } as Feature],
    });
    const r = new Recomputer();
    r.recompute(doc(free));
    const moved = moveSketchPlane(free, [30, 0, 8]);
    if (typeof moved === "string") throw new Error(moved);
    const result = r.recompute(doc(moved));
    expect(result.statuses.every((s) => s.state === "ok")).toBe(true);
    const out = r.output("ex");
    if (out?.kind !== "solid") throw new Error("solid expected");
    expect(bodyMetrics(out.shape).bbox).toEqual([[30, 0, 8], [50, 10, 13]]);
    r.dispose();
  });
});
