/** « Tous les corps qu'elle touche » : les corps qu'une extrusion qui coupe traverse, lus sur leurs maillages. */
import { describe, expect, it } from "vitest";
import { cutsOnEach, intoBody, touchedBodies } from "../../frontend/src/app/extrude-touched";
import { createReferencePlate, type CadDocument, type ExtrudeFeature } from "../../frontend/src/document/types";
import type { SketchFrame } from "../../frontend/src/sketcher/frame";

type P3 = [number, number, number];
/** A box as a triangle mesh, as the editor holds it. */
function box(id: string, a: P3, b: P3) {
  const v: P3[] = [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return { id, vertices: v.flat(), indices: quads.flatMap(([p, q, r, s]) => [p!, q!, r!, p!, r!, s!]) };
}
const top: SketchFrame = { origin: [0, 0, 100], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] } as SketchFrame;
/** A groove 600 long, 20 wide, drawn on the top (z = 100), cut 58 down. */
const groove = [{ outer: [[-50, 190], [650, 190], [650, 210], [-50, 210]] as [number, number][], holes: [] }];

describe("corps touchés par une extrusion", () => {
  it("prend les côtés qu'une rainure traverse, pas ceux qu'elle ne fait qu'effleurer ni ceux d'à côté", () => {
    const bodies = [
      box("left", [0, 0, 0], [18, 400, 100]),
      box("right", [582, 0, 0], [600, 400, 100]),
      box("front", [18, 0, 0], [582, 18, 100]),
      box("far", [1000, 0, 0], [1018, 400, 100]),
      // Under the groove's bottom, its top just at it: touched only, not cut.
      box("under", [100, 150, 0], [500, 250, 42]),
    ];
    expect(touchedBodies(groove, top, 0, -58, bodies).sort()).toEqual(["left", "right"]);
  });

  it("prend un bloc qui contient toute l'extrusion (une poche au milieu)", () => {
    const pocket = [{ outer: [[100, 100], [200, 100], [200, 200], [100, 200]] as [number, number][], holes: [] }];
    expect(touchedBodies(pocket, top, 0, -20, [box("block", [0, 0, 0], [600, 400, 100])])).toEqual(["block"]);
    // A hole in the area over the block: still in it around the hole.
    expect(touchedBodies([{ outer: pocket[0]!.outer, holes: [[[140, 140], [160, 140], [160, 160], [140, 160]]] }], top, 0, -20, [box("block", [0, 0, 0], [600, 400, 100])])).toEqual(["block"]);
  });

  it("fait une extrusion qui coupe par corps, la première à la place de celle qu'on change", () => {
    const doc: CadDocument = { ...createReferencePlate() };
    const values = { sketch: "sk1", distance: -58, regions: undefined };
    const made = cutsOnEach(doc, values, ["a", "b", "c"], null);
    const cuts = made.doc.features.filter((f): f is ExtrudeFeature => f.type === "extrude" && f.operation === "cut");
    expect(cuts.map((f) => f.target)).toEqual(["a", "b", "c"]);
    expect(made.id).toBe(cuts[0]!.id);
    const again = cutsOnEach(doc, values, ["h1", "b"], "ex1");
    expect(again.doc.features.find((f) => f.id === "ex1")).toMatchObject({ operation: "cut", target: "h1", distance: -58 });
    expect(again.doc.features.filter((f) => f.type === "extrude")).toHaveLength(2);
  });

  it("une esquisse posée sur une face : de quel côté de sa normale est le corps (pousser dedans creuse)", () => {
    const board = box("b", [0, 0, 0], [600, 400, 100]);
    // On the top, its normal outward: the body is behind it.
    expect(intoBody(top, [300, 200], board)).toBe(-1);
    // On the bottom, the same frame: the body is in front of it.
    expect(intoBody({ ...top, origin: [0, 0, 0] }, [300, 200], board)).toBe(1);
    // Beside the body: neither.
    expect(intoBody(top, [900, 200], board)).toBe(0);
  });
});
