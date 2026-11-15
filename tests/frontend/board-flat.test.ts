/** Une planche mise à plat d'après le noyau : juste même quand une rainure de fond la traverse de bout en bout. */
import { beforeAll, describe, expect, it } from "vitest";
import type { Shape3D } from "replicad";
import { createReferencePlate, type CabinetFeature, type CadDocument, type MachiningFeature, type MachiningOp } from "../../frontend/src/document/types";
import { drilling32, groove } from "../../frontend/src/features/joinery";
import { outlineOfFace, sectionOf } from "../../frontend/src/geometry/outlines";
import { Recomputer } from "../../frontend/src/history/recompute";
import { boardSides, flatBoard, type BoardGeometry } from "../../frontend/src/io/board-flat";
import { holeDepth, partsDxf, LAYER_PROFILES } from "../../frontend/src/io/dxf";
import { partsGcode } from "../../frontend/src/io/gcode";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

type P3 = [number, number, number];
const cabinet: CabinetFeature = { id: "c1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves: 0, plinth: 0, construction: "sides-through" };

/** The left side of a 600 × 720 × 560 unit (18 × 560 × 720), machined on its inner face (x = 18) by `ops`. */
function side(ops: (box: [P3, P3]) => MachiningOp[]): { shape: Shape3D; dispose: () => void } {
  const box: [P3, P3] = [[0, 0, 0], [18, 560, 720]];
  const made = ops(box);
  const m: MachiningFeature = { id: "m1", type: "machining", name: "Usinage", target: "c1#0", kind: "custom", ops: made };
  const r = new Recomputer();
  r.recompute({ ...createReferencePlate(), features: made.length ? [cabinet, m] : [cabinet] } as CadDocument);
  const out = r.output(made.length ? "m1" : "c1");
  const shape = out?.kind === "solid" ? out.shape : out?.kind === "solids" ? out.shapes[0] : undefined;
  if (!shape) throw new Error("pas de corps");
  return { shape, dispose: () => r.dispose() };
}

/** The board as the editor sees it: its mesh, its faces' outlines and its sections, from the kernel. */
function geometryOf(shape: Shape3D): BoardGeometry & { vertices: ArrayLike<number> } {
  const mesh = shape.mesh({ tolerance: 0.02, angularTolerance: 0.15 });
  const m = { vertices: Float32Array.from(mesh.vertices), indices: Uint32Array.from(mesh.triangles), faceGroups: mesh.faceGroups };
  return { mesh: m, vertices: m.vertices, faceOutline: async (f) => outlineOfFace(shape.faces[f]!), section: async (o, u, v) => sectionOf(shape, o, u, v) };
}

const inner = { axis: 0, sign: 1 } as const;
const backGroove = (box: [P3, P3]) => groove(box, inner, { side: "high", offset: 10, width: 4, depth: 8, direction: "long" });

describe("planche mise à plat", () => {
  it("lit les deux côtés d'un côté de caisson rainuré : la face intérieure coupée en deux, le fond de la rainure à 8 mm", () => {
    const { shape, dispose } = side(backGroove);
    const sides = boardSides(geometryOf(shape).mesh, 18)!;
    const [outer, innerSide] = sides;
    expect(outer.normal.map(Math.round)).toEqual([-1, 0, 0]);
    expect(outer.pockets).toEqual([]);
    expect(innerSide.entry).toHaveLength(2);
    expect(innerSide.pockets.map((p) => p.depth)).toEqual([8]);
    dispose();
  }, 60_000);

  it("une rainure traversante et des perçages : la pièce à sa vraie taille, la rainure dans le calque des poches", async () => {
    const { shape, dispose } = side((box) => [...backGroove(box), ...drilling32(box, inner)]);
    const g = geometryOf(shape);
    const made = (await flatBoard(g, "Côté gauche", 18, (c, r, n) => holeDepth(g.vertices, c, n, r, 18)))!;
    const { part, otherSide } = made;
    expect(otherSide).toBe(false);
    // 720 × 560: not the 546 of the larger piece of the inner face.
    expect([Math.round(part.width), Math.round(part.height)]).toEqual([720, 560]);
    const grooves = part.edges.filter((e) => e.kind !== "circle" && e.depth !== undefined);
    expect(grooves.length).toBeGreaterThanOrEqual(4);
    expect(new Set(grooves.map((e) => (e as { depth: number }).depth))).toEqual(new Set([8]));
    expect(part.edges.filter((e) => e.kind === "circle").length).toBeGreaterThan(4);
    const dxf = partsDxf([part], 20, LAYER_PROFILES.find((p) => p.id === "named")!.profile);
    expect(dxf).toContain("\r\nPOCHE_Z8\r\n");
    expect(dxf).toContain("\r\nCONTOUR_Z18\r\n");
    // The G-code cuts the outline at its size and says the groove is to be made apart.
    const { skipped } = partsGcode([{ label: "Mélaminé 18", size: [2800, 2070], parts: [part] }]);
    expect(skipped.some((s) => /rainure ou poche de 8 mm/.test(s))).toBe(true);
    dispose();
  }, 60_000);

  it("une planche sans usinage garde son contour ; percée de l'autre côté seulement, elle est retournée", async () => {
    const plain = side(() => []);
    const g = geometryOf(plain.shape);
    const flat = (await flatBoard(g, "Côté", 18, (c, r, n) => holeDepth(g.vertices, c, n, r, 18)))!;
    expect([Math.round(flat.part.width), Math.round(flat.part.height)]).toEqual([720, 560]);
    expect(flat.part.edges.every((e) => e.kind === "line")).toBe(true);
    plain.dispose();
    const drilled = side((box) => drilling32(box, inner));
    const h = geometryOf(drilled.shape);
    const up = (await flatBoard(h, "Côté", 18, (c, r, n) => holeDepth(h.vertices, c, n, r, 18)))!;
    // The holes on the side laid up: none left for the other side.
    expect(up.part.edges.filter((e) => e.kind === "circle").length).toBeGreaterThan(4);
    expect(up.otherSide).toBe(false);
    drilled.dispose();
  }, 60_000);
});
