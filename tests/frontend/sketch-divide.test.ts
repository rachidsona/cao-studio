/** Lines spread at equal distances inside a rectangle of the sketch. */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { addRectangle, pointPos } from "../../frontend/src/sketcher/edit";
import { divideRectangle, equalCuts, gapAnnotations, openingCuts, openingSpans, rectangleAround, rectangleOfCurve, rectanglesOf, spreadAxis } from "../../frontend/src/sketcher/sketch-divide";
import type { CadDocument, Feature } from "../../frontend/src/document/types";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });
/** A rectangle 400 × 300 from (0, 0), and a vertical seed line at x = 50 across it. */
function sketch() {
  const { geometry, created } = addRectangle(empty(), { at: [0, 0] }, { at: [400, 300] });
  const g = structuredClone(geometry);
  g.points.push({ id: "s1", x: 50, y: 0 }, { id: "s2", x: 50, y: 300 });
  g.curves.push({ id: "seed", kind: "line", p1: "s1", p2: "s2" });
  return { g, sides: created };
}

describe("rectangle", () => {
  it("les quatre côtés sont reconnus, par côté", () => {
    const { g, sides } = sketch();
    const r = rectangleOfCurve(g, sides[0] as string)!;
    expect([r.min, r.max]).toEqual([[0, 0], [400, 300]]);
    expect(new Set(Object.values(r.sides))).toEqual(new Set(sides));
    expect(rectangleOfCurve(g, "seed")).toBeNull();
    expect(rectanglesOf(g)).toHaveLength(1);
  });

  it("le plus petit rectangle qui contient la sélection ; aucun s'il n'y en a pas", () => {
    const { g } = sketch();
    expect(rectangleAround(g, new Set(["seed"]))?.max).toEqual([400, 300]);
    const outside = structuredClone(g);
    outside.points.push({ id: "o1", x: 900, y: 0 }, { id: "o2", x: 900, y: 50 });
    outside.curves.push({ id: "far", kind: "line", p1: "o1", p2: "o2" });
    expect(rectangleAround(outside, new Set(["far"]))).toBeNull();
  });

  it("le sens de répartition : une ligne verticale se répartit en X, une horizontale en Y", () => {
    const { g } = sketch();
    expect(spreadAxis(g, new Set(["seed"]))).toBe(0);
    const h = structuredClone(g);
    h.points.push({ id: "h1", x: 0, y: 20 }, { id: "h2", x: 400, y: 20 });
    h.curves.push({ id: "hl", kind: "line", p1: "h1", p2: "h2" });
    expect(spreadAxis(h, new Set(["hl"]))).toBe(1);
  });
});

describe("répartition à égale distance", () => {
  it("n lignes font n + 1 espaces égaux", () => {
    expect(equalCuts(0, 400, 3)).toEqual([100, 200, 300]);
    expect(equalCuts(10, 20, 1)).toEqual([15]);
  });

  it("3 lignes verticales dans 400 mm : à 100, 200 et 300, d'un côté à l'autre, accrochées aux côtés", () => {
    const { g } = sketch();
    const rect = rectangleAround(g, new Set(["seed"]))!;
    const out = divideRectangle(g, new Set(["seed"]), rect, { count: 3, axis: 0, attach: true });
    if (!out.ok) throw new Error(out.reason);
    expect(out.copies).toBe(3);
    const added = out.geometry.curves.slice(g.curves.length);
    expect(added).toHaveLength(3);
    const ends = added.map((c) => (c.kind === "line" ? [pointPos(out.geometry, c.p1), pointPos(out.geometry, c.p2)] : null));
    expect(ends).toEqual([[[100, 0], [100, 300]], [[200, 0], [200, 300]], [[300, 0], [300, 300]]]);
    // Each copy: two point-on-curve constraints on the sides and a vertical one.
    const added2 = out.geometry.constraints.slice(g.constraints.length).map((c) => c.kind);
    expect(added2.filter((k) => k === "pointOnCurve")).toHaveLength(6);
    expect(added2.filter((k) => k === "vertical")).toHaveLength(3);
    expect(out.preview.lines).toHaveLength(3);
    expect(solveSketch(out.geometry).state).not.toBe("failed");
  });

  it("les copies suivent le rectangle quand on l'élargit (points sur les côtés)", () => {
    const { g, sides } = sketch();
    const rect = rectangleAround(g, new Set(["seed"]))!;
    const out = divideRectangle(g, new Set(["seed"]), rect, { count: 1, axis: 0, attach: true });
    if (!out.ok) throw new Error(out.reason);
    // Drag the rectangle's top-left corner up by 100 (as with the mouse): its top side goes up, the copy's top end follows.
    const top = out.geometry.curves.find((c) => c.id === rect.sides.top);
    if (top?.kind !== "line") throw new Error("top side expected");
    const corner = [top.p1, top.p2].map((id) => ({ id, p: pointPos(out.geometry, id) })).sort((a, b) => a.p[0] - b.p[0])[0]!;
    void sides;
    const solved = solveSketch(out.geometry, { drag: { point: corner.id, x: corner.p[0], y: 400 }, diagnose: false });
    expect(solved.state).not.toBe("failed");
    const copy = solved.geometry.curves.at(-1);
    expect(copy?.kind === "line" && pointPos(solved.geometry, copy.p2)[1]).toBeCloseTo(400, 3);
  });

  it("sans « accrocher » ou pour autre chose qu'une ligne droite : des copies simples, centrées sur chaque coupe", () => {
    const { g } = sketch();
    const rect = rectangleAround(g, new Set(["seed"]))!;
    const out = divideRectangle(g, new Set(["seed"]), rect, { count: 3, axis: 0, attach: false });
    if (!out.ok) throw new Error(out.reason);
    const xs = out.geometry.points.slice(g.points.length).map((p) => p.x);
    expect(xs).toEqual([100, 100, 200, 200, 300, 300]);
  });

  it("des erreurs lisibles : rien de choisi, zéro ligne", () => {
    const { g } = sketch();
    const rect = rectangleAround(g, new Set(["seed"]))!;
    const none = divideRectangle(g, new Set(), rect, { count: 2, axis: 0, attach: true });
    expect(none.ok === false && none.reason).toMatch(/Cliquez/);
    const zero = divideRectangle(g, new Set(["seed"]), rect, { count: 0, axis: 0, attach: true });
    expect(zero.ok === false && zero.reason).toMatch(/au moins/);
  });
});

describe("mesures entre les lignes réparties", () => {
  const rect = { sides: { left: "l", right: "r", bottom: "b", top: "t" }, min: [0, 0] as [number, number], max: [400, 300] as [number, number] };

  it("n lignes donnent n + 1 cotes, une par espace, au bord bas, dessinées vers l'intérieur", () => {
    const notes = gapAnnotations(rect, 0, 3, "mm");
    expect(notes.map((a) => a.value)).toEqual([100, 100, 100, 100]);
    expect(new Set(notes.map((a) => a.key)).size).toBe(4);
    const first = notes[0]!.shape;
    expect(first).toMatchObject({ kind: "linear", p1: [0, 0], p2: [100, 0], normal: [0, 1] });
    expect(notes.every((a) => a.role === "preview")).toBe(true);
  });

  it("des lignes horizontales (répartition en Y) : les cotes sont sur le bord gauche, normale vers la droite", () => {
    const notes = gapAnnotations(rect, 1, 2, "mm");
    expect(notes.map((a) => a.value)).toEqual([100, 100, 100]);
    expect(notes[2]!.shape).toMatchObject({ p1: [0, 200], p2: [0, 300], normal: [1, 0] });
  });

  it("des espaces inégaux ne le sont jamais : la somme des cotes est la taille du rectangle", () => {
    const notes = gapAnnotations(rect, 0, 7, "mm");
    expect(notes.reduce((s, a) => s + a.value, 0)).toBeCloseTo(400, 9);
    expect(notes).toHaveLength(8);
  });
});

describe("ouvertures égales entre les panneaux", () => {
  const near = (a: number[], b: number[], digits = 6) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i] as number, digits));

  it("panneaux de 18 dans le contour, 1900 mm, 2 lignes : trois ouvertures de 609,333 mm", () => {
    const board = { thickness: 18, align: "inside" as const };
    near(openingCuts(0, 1900, 2, board)!, [636.333333, 1263.666667]);
    const spans = openingSpans(0, 1900, 2, board);
    near(spans.map(([a, b]) => b - a), [609.333333, 609.333333, 609.333333]);
    near(spans[0] as number[], [18, 627.333333]);
    near(spans[2] as number[], [1272.666667, 1882]);
  });

  it("centrés sur le contour : les lignes sont à égale distance ; hors du contour : les ouvertures restent égales", () => {
    near(openingCuts(0, 1800, 2, { thickness: 18, align: "center" })!, [600, 1200]);
    const outside = openingSpans(0, 1800, 2, { thickness: 18, align: "outside" });
    const widths = outside.map(([a, b]) => b - a);
    near(widths, [widths[0]!, widths[0]!, widths[0]!]);
    expect(outside[0]![0]).toBe(0);
    expect(outside[2]![1]).toBe(1800);
  });

  it("trop épais : pas d'ouverture, une erreur lisible", () => {
    expect(openingCuts(0, 40, 2, { thickness: 18, align: "inside" })).toBeNull();
    const { g } = sketch();
    const rect = rectangleAround(g, new Set(["seed"]))!;
    const out = divideRectangle(g, new Set(["seed"]), rect, { count: 3, axis: 0, attach: true, board: { thickness: 150, align: "inside" } });
    expect(out.ok === false && out.reason).toMatch(/trop épais/);
  });

  it("les cotes d'aperçu sont les ouvertures, toutes égales", () => {
    const rect = { sides: { left: "l", right: "r", bottom: "b", top: "t" }, min: [0, 0] as [number, number], max: [1900, 2500] as [number, number] };
    const notes = gapAnnotations(rect, 0, 2, "mm", { thickness: 18, align: "inside" });
    near(notes.map((a) => a.value), [609.333333, 609.333333, 609.333333]);
    expect(notes[0]!.shape).toMatchObject({ p1: [18, 0] });
  });

  it("de bout en bout : les panneaux faits depuis ce squelette laissent trois ouvertures égales (0,9 cm d'écart avant)", () => {
    const { geometry, created } = addRectangle(empty(), { at: [0, 0] }, { at: [1900, 2500] });
    const left = created[3] as string;
    const rect = rectangleAround(geometry, new Set([left]))!;
    const build = (board: { thickness: number; align: "inside" } | null): number[] => {
      const out = divideRectangle(geometry, new Set([left]), rect, { count: 2, axis: 0, attach: true, board });
      if (!out.ok) throw new Error(out.reason);
      const doc: CadDocument = {
        format: "cao-studio",
        schemaVersion: 2,
        units: "mm",
        parameters: {},
        features: [
          { id: "sk", type: "sketch", name: "Squelette", plane: "XY", offset: 0, ...out.geometry },
          { id: "pn", type: "panels", name: "Panneaux", sketch: "sk", thickness: 18, depth: 100, align: "inside", through: "vertical" },
        ] as Feature[],
      };
      const r = new Recomputer();
      expect(r.recompute(doc).statuses.every((st) => st.state === "ok")).toBe(true);
      const solids = r.output("pn");
      if (solids?.kind !== "solids") throw new Error("solids expected");
      const boxes = solids.shapes.map((shape) => bodyMetrics(shape).bbox).filter(([lo, hi]) => hi[0] - lo[0] < 19 && hi[1] - lo[1] > 2000);
      boxes.sort((a, b) => a[0][0] - b[0][0]);
      const gaps = boxes.slice(1).map((box, i) => box[0][0] - (boxes[i] as typeof box)[1][0]);
      r.dispose();
      return gaps;
    };
    // Lines at equal distances: the middle opening is wider by half a board.
    const plain = build(null);
    expect(plain).toHaveLength(3);
    expect(plain[1]! - plain[0]!).toBeCloseTo(9, 3);
    expect(plain[2]!).toBeCloseTo(plain[0]!, 6);
    // Lines made for the boards: the openings are equal.
    const equal = build({ thickness: 18, align: "inside" });
    expect(equal).toHaveLength(3);
    // The sketch stores positions to a millionth of a millimetre.
    near(equal, [609.333333, 609.333333, 609.333333], 4);
  });
});
