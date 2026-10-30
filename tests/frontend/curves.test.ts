/** Ovale à quatre centres et courbe lissée en biarcs : tangence partout, passage par les points, profil fermé. */
import { beforeAll, describe, expect, it } from "vitest";
import { initSolver, solveSketch } from "../../frontend/src/constraints/solver";
import { emptySketchGeometry } from "../../frontend/src/document/sketch";
import { addPieces, biarc, ovalPieces, smoothPieces, type Piece } from "../../frontend/src/sketcher/curves";
import { extractLoops, sketchFaces } from "../../frontend/src/sketcher/loops";

beforeAll(() => initSolver());

/** Direction of travel of a piece at one of its ends. */
function direction(p: Piece, at: "a" | "b"): [number, number] {
  const q = p[at];
  if (p.kind === "line") return [p.b[0] - p.a[0], p.b[1] - p.a[1]];
  const r: [number, number] = [q[0] - p.c[0], q[1] - p.c[1]];
  return p.ccw ? [-r[1], r[0]] : [r[1], -r[0]];
}
const angle = (u: [number, number], v: [number, number]) => Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));

function smooth(pieces: Piece[], closed: boolean) {
  const joints = closed ? pieces.length : pieces.length - 1;
  for (let i = 0; i < joints; i++) {
    const [p, q] = [pieces[i]!, pieces[(i + 1) % pieces.length]!];
    expect(Math.hypot(p.b[0] - q.a[0], p.b[1] - q.a[1])).toBeLessThan(1e-9);
    expect(angle(direction(p, "b"), direction(q, "a"))).toBeLessThan(1e-6);
  }
}

describe("courbes lisses", () => {
  it("un biarc va d'un point à l'autre, tangent au départ, à l'arrivée et au raccord", () => {
    const pieces = biarc([0, 0], [1, 0], [10, 5], [0, 1]);
    expect(pieces[0]!.a).toEqual([0, 0]);
    expect(pieces[1]!.b).toEqual([10, 5]);
    expect(angle(direction(pieces[0]!, "a"), [1, 0])).toBeLessThan(1e-9);
    expect(angle(direction(pieces[1]!, "b"), [0, 1])).toBeLessThan(1e-6);
    smooth(pieces, false);
  });

  it("la courbe lissée passe par tous les points cliqués, sans cassure", () => {
    const points: [number, number][] = [[0, 0], [10, 8], [20, 0], [30, 6]];
    const pieces = smoothPieces(points);
    for (const p of points) expect(pieces.some((q) => Math.hypot(q.a[0] - p[0], q.a[1] - p[1]) < 1e-9 || Math.hypot(q.b[0] - p[0], q.b[1] - p[1]) < 1e-9)).toBe(true);
    smooth(pieces, false);
  });

  it("l'ovale à quatre centres est fermé, lisse, et touche ses demi-axes", () => {
    const pieces = ovalPieces([0, 0], 40, 20);
    if (typeof pieces === "string") throw new Error(pieces);
    smooth(pieces, true);
    const xs = pieces.flatMap((p) => (p.kind === "arc" ? [p.c[0] + p.r, p.c[0] - p.r] : []));
    expect(Math.max(...pieces.map((p) => (p.kind === "arc" && p.r < 20 ? p.c[0] + p.r : -Infinity)))).toBeCloseTo(40, 9);
    expect(xs.length).toBe(8);
    expect(ovalPieces([0, 0], 10, 10)).toMatch(/cercle/);
  });

  it("dans l'esquisse, l'ovale donne un profil fermé que le solveur résout", () => {
    const pieces = ovalPieces([5, 5], 30, 12) as Piece[];
    const { geometry } = addPieces(emptySketchGeometry(), pieces, true);
    expect(solveSketch(geometry).state).toBe("ok");
    expect(sketchFaces(extractLoops(geometry))).toHaveLength(1);
  });
});

describe("outils ovale et courbe lissée", () => {
  it("la courbe se termine en recliquant le dernier point, et se ferme en recliquant le premier", async () => {
    const { DrawingTool } = await import("../../frontend/src/sketcher/tools");
    const tool = new DrawingTool("curve");
    const g = emptySketchGeometry();
    for (const p of [[0, 0], [10, 6], [20, 0]] as [number, number][]) expect(tool.click(g, { pos: p }).kind).toBe("preview");
    const open = tool.click(g, { pos: [20, 0] });
    expect(open.kind === "commit" && open.geometry.curves.filter((c) => !c.construction).length).toBe(4);
    for (const p of [[0, 0], [10, 6], [20, 0]] as [number, number][]) tool.click(g, { pos: p });
    const closed = tool.click(g, { pos: [0, 0] });
    expect(closed.kind === "commit" && sketchFaces(extractLoops(closed.geometry)).length).toBe(1);
  });
});
