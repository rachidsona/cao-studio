/** « Aménager ce corps » : l'ouverture d'un cadre reçoit une Répartition dont les côtés sont les parois du cadre. */
import { beforeAll, describe, expect, it } from "vitest";
import { furnishedBodies, openingOf, withBodyFurnished, type BodyMesh } from "../../frontend/src/document/body-opening";
import { withRecipe } from "../../frontend/src/document/niche-recipe";
import { createReferencePlate, type CadDocument, type SketchFeature, type Vec3 } from "../../frontend/src/document/types";
import { isPartition, leafNiches } from "../../frontend/src/sketcher/partition-history";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

/** A box as a mesh: 8 corners, 12 triangles. */
function boxMesh(a: Vec3, b: Vec3): BodyMesh {
  const v: number[] = [];
  for (let i = 0; i < 8; i++) v.push(i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return { vertices: v, indices: quads.flatMap(([p, q, r, s]) => [p!, q!, r!, p!, r!, s!]) };
}
/** A frame 600 × 400 (x, y), 720 high, walls 18 thick, open at the top and the bottom. */
const frame: BodyMesh[] = [
  boxMesh([-300, -182, 0], [-282, 182, 720]),
  boxMesh([-300, -200, 0], [300, -182, 720]),
  boxMesh([-300, 182, 0], [300, 200, 720]),
  boxMesh([282, -182, 0], [300, 182, 720]),
];
const outer: [Vec3, Vec3] = [[-300, -200, 0], [300, 200, 720]];

describe("l'ouverture d'un corps", () => {
  it("vu d'au-dessus, un cadre s'ouvre vers le haut : 564 × 364, 720 de profondeur, parois de 18", () => {
    expect(openingOf(frame, outer, [0, 0, -1], [0, 1, 0])).toEqual({ frame: { origin: [-300, -200, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, width: 564, height: 364, depth: 720, wall: 18 });
  });

  it("couché sur le flanc et vu de face, le haut reste en haut", () => {
    // The same frame open towards −y (its axis along y), seen from the front.
    const lying = frame.map((m) => ({ ...m, vertices: Array.from(m.vertices, (_, i) => { const k = i - (i % 3); const [x, y, z] = [m.vertices[k]!, m.vertices[k + 1]!, m.vertices[k + 2]!]; return [x, z - 360, y][i % 3]!; }) }));
    const o = openingOf(lying, [[-300, -360, -200], [300, 360, 200]], [0, 1, 0], [0, 0, 1]);
    expect(o).toMatchObject({ frame: { xDir: [1, 0, 0], normal: [0, -1, 0] }, width: 564, height: 364, depth: 720, wall: 18 });
  });

  it("un petit cadre de 8 × 5 cm, 1 cm d'épaisseur, s'aménage aussi : 44 × 14 mm, 10 de profondeur", () => {
    const small: BodyMesh[] = [
      boxMesh([-40, -7, 0], [-22, 7, 10]),
      boxMesh([-40, -25, 0], [40, -7, 10]),
      boxMesh([-40, 7, 0], [40, 25, 10]),
      boxMesh([22, -7, 0], [40, 7, 10]),
    ];
    expect(openingOf(small, [[-40, -25, 0], [40, 25, 10]], [0, 0, -1], [0, 1, 0])).toMatchObject({ width: 44, height: 14, depth: 10, wall: 18 });
  });

  it("un côté fait cadre à son tour : ce cadre-là, ou tout le cadre d'origine", () => {
    // A frame split into its sides; side 1 pocketed, the pocket made a frame (sh2); side 3 drilled.
    const doc = { features: [
      { id: "ex1", type: "extrude", name: "Plein", sketch: "sk1", distance: 10, operation: "new" },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "ex1", faces: [], thickness: 18, sides: "separate", frame: true },
      { id: "ex2", type: "extrude", name: "Poche", sketch: "sk2", distance: -9, operation: "cut", target: "sh1#1" },
      { id: "sh2", type: "shell", name: "Côtés séparés 2", target: "ex2", faces: [], thickness: 2, sides: "separate", frame: true },
      { id: "h1", type: "hole", name: "Perçage", target: "sh1#3", x: 0, y: 0, diameter: 5, depth: 5 },
    ] } as unknown as CadDocument;
    const shown = ["sh1#0", "sh2#0", "sh2#1", "sh2#2", "sh2#3", "sh1#2", "h1"];
    expect(furnishedBodies(doc, "sh2#1", shown)).toEqual(["sh2#0", "sh2#1", "sh2#2", "sh2#3"]);
    expect(furnishedBodies(doc, "sh2#1", shown, "all")).toEqual(shown);
    expect(furnishedBodies(doc, "h1", shown)).toEqual(shown);
  });

  it("un corps plein, ou sans place dedans, est refusé", () => {
    expect(openingOf([boxMesh([0, 0, 0], [100, 100, 100])], [[0, 0, 0], [100, 100, 100]], [0, 0, -1], [0, 1, 0])).toContain("plein");
  });

  it("ses étagères vont d'une paroi à l'autre, sans côtés ni dessus ni dessous en double", async () => {
    const opening = openingOf(frame, outer, [0, 0, -1], [0, 1, 0]);
    if (typeof opening === "string") throw new Error(opening);
    const made = withBodyFurnished({ ...createReferencePlate(), features: [] } as unknown as CadDocument, opening, "Cadre");
    if (typeof made === "string") throw new Error(made);
    const sketch = made.doc.features.find((f): f is SketchFeature => f.id === made.sketch && f.type === "sketch")!;
    const leaves = leafNiches(sketch);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.box).toEqual({ x0: 18, x1: 582, y0: 18, y1: 382 });
    const partition = sketch.offsets!.find(isPartition)!.id;
    const filled = withRecipe(made.doc, { sketch: made.sketch, partition, path: [0] }, { steps: [{ at: [], input: { count: 2, thickness: 18, mode: "equal", fixed: 0 } }], equipment: [] });
    if (typeof filled === "string") throw new Error(filled);
    const { Recomputer } = await import("../../frontend/src/history/recompute");
    const r = new Recomputer();
    const result = r.recompute(filled);
    expect(result.statuses.filter((s) => s.state !== "ok")).toEqual([]);
    // Only the two shelves are made: 564 wide, 18 thick, 720 deep, inside the walls.
    const boxes = filled.features.filter((f) => f.type === "extrude").flatMap((f) => {
      const out = r.output(f.id);
      return out?.kind === "solid" ? [out.shape.boundingBox.bounds] : out?.kind === "solids" ? out.shapes.map((s) => s.boundingBox.bounds) : [];
    });
    expect(boxes).toHaveLength(2);
    for (const [lo, hi] of boxes) {
      expect([hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map(Math.round)).toEqual([564, 18, 720]);
      expect(Math.round(lo[0])).toBe(-282);
    }
    r.dispose();
  }, 120_000);
});
