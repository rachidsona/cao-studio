/** Décaler l'arête in the sketch (as in Shapr3D): body edges projected once, the face side of each path. */
import { beforeAll, describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { offsetPaths } from "../../frontend/src/geometry/offset";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { addOffsetCurves, allConstruction, pathsFromCurves } from "../../frontend/src/sketcher/offset";
import { sketchFrame, toSketch } from "../../frontend/src/sketcher/frame";
import { edgeSamples, insideRings, intoFaceSign, projectedRings, projectEdgeOnce, projectFace, ringsOf } from "../../frontend/src/sketcher/offset-edge";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

/** Top face (z = 10) of an 80 × 50 plate with a Ø10 hole at the centre. */
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

const frame = sketchFrame("XY", 10);
const empty = (): SketchGeometry => ({ points: [], curves: [], constraints: [] });

function projectedTop(): { geometry: SketchGeometry; ids: string[]; rings: ReturnType<typeof ringsOf> } {
  const done = projectFace(empty(), topFace, frame);
  if (typeof done === "string") throw new Error(done);
  return { geometry: done.geometry, ids: done.ids, rings: done.rings ?? [] };
}

describe("décaler l'arête dans l'esquisse", () => {
  it("projette toutes les arêtes d'une face cliquée, en repères fixes", () => {
    const { geometry, ids, rings } = projectedTop();
    expect(ids).toHaveLength(5);
    expect(geometry.curves.every((c) => c.projected && c.construction)).toBe(true);
    expect(rings).toHaveLength(2);
    expect(insideRings([20, 10], rings)).toBe(true);
    expect(insideRings([0, 0], rings)).toBe(false);
  });

  it("ne double pas une arête déjà dans l'esquisse", () => {
    const { geometry, ids } = projectedTop();
    const again = projectEdgeOnce(geometry, { edges: [topFace.edges[1]!], samples: [] }, frame);
    expect(typeof again).toBe("object");
    if (typeof again === "string") return;
    expect(again.geometry).toBe(geometry);
    expect(again.ids).toHaveLength(1);
    expect(ids).toContain(again.ids[0]);
    const face = projectFace(geometry, topFace, frame);
    expect(typeof face !== "string" && face.geometry.curves.length).toBe(5);
  });

  it("décale le contour vers l'intérieur et le trou dans la matière", () => {
    const { geometry, ids, rings } = projectedTop();
    const paths = pathsFromCurves(geometry, ids);
    const outer = paths.find((p) => p.kind !== "circle")!;
    const hole = paths.find((p) => p.kind === "circle")!;
    expect(intoFaceSign(outer, rings)).toBe(-1);
    expect(intoFaceSign(hole, rings)).toBe(1);
    const inner = offsetPaths([outer], intoFaceSign(outer, rings) * 5, "sharp").curves;
    expect(Math.max(...inner.flatMap((c) => (c.kind === "line" ? [c.a[0], c.b[0]] : [])))).toBeCloseTo(35, 6);
    expect(offsetPaths([hole], intoFaceSign(hole, rings) * 3).curves[0]).toMatchObject({ kind: "circle", radius: 8 });
  });

  it("une seule arête se décale vers la face que dessine le contour projeté", () => {
    const { geometry } = projectedTop();
    const right = geometry.curves.find((c) => c.kind === "line" && geometry.points.filter((p) => p.x === 40).some((p) => p.id === c.p1) && geometry.points.filter((p) => p.x === 40).some((p) => p.id === c.p2))!;
    const [path] = pathsFromCurves(geometry, [right.id]);
    const rings = projectedRings(geometry);
    const curves = offsetPaths([path!], intoFaceSign(path!, rings) * 6, "sharp").curves;
    expect(curves[0]?.kind === "line" && curves[0].a[0]).toBeCloseTo(34, 6);
    // Without any face, the kernel's side is kept.
    expect(intoFaceSign(path!, [])).toBe(1);
  });

  it("le décalage d'arêtes projetées donne de vrais traits", () => {
    const { geometry, ids } = projectedTop();
    expect(allConstruction(geometry, ids)).toBe(false);
    const outer = pathsFromCurves(geometry, ids).find((p) => p.kind !== "circle")!;
    const added = addOffsetCurves(geometry, offsetPaths([outer], -5, "sharp").curves, allConstruction(geometry, ids)).created;
    expect(added).toHaveLength(4);
  });

  it("échantillonne un arc dans le sens de son point milieu", () => {
    const samples = edgeSamples({ kind: "arc", center: [0, 0, 10], radius: 10, a: [10, 0, 10], b: [-10, 0, 10], mid: [0, -10, 10] }, [0, 0, 1]);
    expect(samples).toHaveLength(17);
    // Through the bottom: every sample has y ≤ 0.
    expect(samples.every((p) => toSketch(frame, p)[1] <= 1e-9)).toBe(true);
    expect(toSketch(frame, samples[16]!)[0]).toBeCloseTo(-10, 6);
  });
});
