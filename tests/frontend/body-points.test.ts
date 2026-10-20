/** Corners of bodies: picked in the 3D view, and offered as fixed points of a sketch (coincidence between bodies). */
import { beforeAll, describe, expect, it } from "vitest";
import { solveSketch } from "../../frontend/src/constraints/solver";
import type { SketchConstraint, SketchGeometry } from "../../frontend/src/document/sketch";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";
import { isBodyPoint, pruneBodyPoints, withBodyPoints } from "../../frontend/src/sketcher/body-points";
import { addConstraint } from "../../frontend/src/sketcher/edit";
import { sketchFrame } from "../../frontend/src/sketcher/frame";
import { bodyVertices, type Point3 } from "../../frontend/src/viewport/body-points";
import { faceSnaps, ontoPlane } from "../../frontend/src/viewport/face-snaps";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** A body whose edges are the given polylines (each one an edge, drawn as segments). */
function meshOf(edges: Point3[][]): BodyMesh {
  const flat: number[] = [];
  const groups: { start: number; count: number }[] = [];
  let vertex = 0;
  for (const path of edges) {
    const start = vertex;
    for (let i = 1; i < path.length; i++) {
      flat.push(...(path[i - 1] as Point3), ...(path[i] as Point3));
      vertex += 2;
    }
    groups.push({ start, count: vertex - start });
  }
  return {
    bodyId: "b1",
    vertices: new Float32Array(),
    normals: new Float32Array(),
    indices: new Uint32Array(),
    faceGroups: [],
    edges: Float32Array.from(flat),
    edgeGroups: groups,
    metrics: {} as BodyMesh["metrics"],
  };
}

describe("sommets d'un corps", () => {
  it("un sommet par extrémité d'arête, fusionné quand des arêtes se rejoignent", () => {
    const square: Point3[][] = [
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]],
      [[10, 10, 0], [0, 10, 0]],
      [[0, 10, 0], [0, 0, 0]],
    ];
    expect(bodyVertices(meshOf(square))).toHaveLength(4);
  });

  it("un cercle complet n'a qu'un sommet (sa couture) ; un arc en a deux", () => {
    const circle: Point3[] = [[20, 0, 0], [25, 5, 0], [20, 10, 0], [15, 5, 0], [20, 0, 0]];
    expect(bodyVertices(meshOf([circle]))).toEqual([[20, 0, 0]]);
    expect(bodyVertices(meshOf([[[0, 0, 0], [3, 4, 0], [5, 5, 0]]]))).toEqual([[0, 0, 0], [5, 5, 0]]);
  });
});

describe("sommets de corps dans une esquisse", () => {
  const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

  it("projetés sur le plan de l'esquisse, fixes, sans doublon", () => {
    const frame = sketchFrame("XY", 5);
    const corners: Point3[] = [[10, 20, 5], [10, 20, 30], [3, 4, 0], [0, 0, 7]];
    const g = withBodyPoints(empty(), frame, corners);
    // (10,20) once although two corners lie above each other; the origin is already there.
    expect(g.points.map((p) => [p.id, p.x, p.y, p.fixed])).toEqual([
      ["bp1", 10, 20, true],
      ["bp2", 3, 4, true],
    ]);
    expect(g.points.every(isBodyPoint)).toBe(true);
  });

  it("suit les axes du plan (XZ : u = X, v = Z)", () => {
    const g = withBodyPoints(empty(), sketchFrame("XZ", 0), [[3, 7, 9]]);
    expect([g.points[0]?.x, g.points[0]?.y]).toEqual([3, 9]);
  });

  it("n'ajoute rien là où un point existe déjà", () => {
    const own: SketchGeometry = { points: [{ id: "p1", x: 10, y: 20 }], curves: [], constraints: [] };
    expect(withBodyPoints(own, sketchFrame("XY", 0), [[10, 20, 0]]).points).toHaveLength(1);
  });

  it("une coïncidence avec un sommet d'un autre corps est résolue et conservée", () => {
    const frame = sketchFrame("XY", 0);
    const own: SketchGeometry = {
      points: [{ id: "a", x: 1, y: 1 }, { id: "b", x: 9, y: 1 }],
      curves: [{ id: "l1", kind: "line", p1: "a", p2: "b" }],
      constraints: [],
    };
    const offered = withBodyPoints(own, frame, [[4, 3, 12], [50, 50, 0]]);
    const { geometry } = addConstraint(offered, { kind: "coincident", a: "a", b: "bp1" } as Omit<SketchConstraint, "id">);
    const solved = solveSketch(geometry);
    expect(solved.state).not.toBe("conflicting");
    const a = solved.geometry.points.find((p) => p.id === "a")!;
    expect([Number(a.x.toFixed(6)), Number(a.y.toFixed(6))]).toEqual([4, 3]);
    // The fixed corner did not move.
    const corner = solved.geometry.points.find((p) => p.id === "bp1")!;
    expect([corner.x, corner.y]).toEqual([4, 3]);

    // Only the corner the constraint uses is stored; the other one is offered again next time.
    const stored = pruneBodyPoints(solved.geometry);
    expect(stored.points.map((p) => p.id)).toEqual(["a", "b", "bp1"]);
    const reopened = withBodyPoints(stored, frame, [[4, 3, 12], [50, 50, 0]]);
    expect(reopened.points.map((p) => p.id)).toEqual(["a", "b", "bp1", "bp2"]);
    expect(reopened.constraints).toEqual(stored.constraints);
  });
});

describe("points d'accroche d'une face (Déplacer, comme Fusion)", () => {
  /** A square face 10 × 10 at z = 2 (two triangles), its four edges, and a stray edge elsewhere. */
  const square = (): BodyMesh => {
    const corners: Point3[] = [[0, 0, 2], [10, 0, 2], [10, 10, 2], [0, 10, 2]];
    const mesh = meshOf([
      [corners[0]!, corners[1]!],
      [corners[1]!, corners[2]!],
      [corners[2]!, corners[3]!],
      [corners[3]!, corners[0]!],
      [[50, 50, 50], [60, 50, 50]],
    ]);
    return { ...mesh, vertices: Float32Array.from(corners.flat()), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]), faceGroups: [{ start: 0, count: 6, faceId: 0 }] };
  };

  it("une face plane donne ses quatre coins, son centre et sa normale", () => {
    const snaps = faceSnaps(square(), 0)!;
    expect(snaps.corners).toHaveLength(4); // the stray edge's ends are not on the face
    expect(snaps.center).toEqual([5, 5, 2]);
    expect(snaps.normal).toEqual([0, 0, 1]);
  });

  it("le milieu d'une face est le centre de son étendue, même avec des triangles inégaux", () => {
    // Same square cut in three triangles of different sizes: the middle stays (5, 5).
    const mesh = { ...square(), vertices: Float32Array.from([0, 0, 2, 10, 0, 2, 10, 10, 2, 0, 10, 2, 9, 1, 2]), indices: Uint32Array.from([0, 1, 4, 0, 4, 2, 0, 2, 3]), faceGroups: [{ start: 0, count: 9, faceId: 0 }] };
    expect(faceSnaps(mesh, 0)?.center).toEqual([5, 5, 2]);
  });

  it("une face courbe n'a pas de normale ; une face inconnue rien", () => {
    const bent = { ...square(), vertices: Float32Array.from([0, 0, 2, 10, 0, 2, 10, 10, 2, 0, 10, 7]) };
    expect(faceSnaps(bent, 0)?.normal).toBeNull();
    expect(faceSnaps(square(), 3)).toBeNull();
  });

  it("amener un point sur le plan d'une face : seulement le long de sa normale", () => {
    expect(ontoPlane([3, 4, 9], [0, 0, 2], [0, 0, 1])).toEqual([0, 0, -7]);
    expect(ontoPlane([3, 4, 2], [0, 0, 2], [0, 0, 1])).toEqual([0, 0, 0]);
  });
});
