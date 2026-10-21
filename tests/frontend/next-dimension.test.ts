/** Keypad "next" (→, Tab, ↑ ↓): from one side of a rectangle to the other, as in Fusion. */
import { describe, expect, it } from "vitest";
import type { SketchGeometry } from "../../frontend/src/document/sketch";
import { nextSideDimension, type DimensionSpec } from "../../frontend/src/sketcher/annotations";
import { addConstraint, addRectangle } from "../../frontend/src/sketcher/edit";

/** Rectangle (0,0)–(10,5): l1 bottom, l2 right, l3 top, l4 left. */
const rect = (): SketchGeometry => addRectangle({ points: [], curves: [], constraints: [] }, { at: [0, 0] }, { at: [10, 5] }).geometry;

describe("cote suivante d'un rectangle", () => {
  it("de la largeur on passe à la hauteur : une cote de longueur proposée avec la longueur actuelle", () => {
    const next = nextSideDimension(rect(), { kind: "length", line: "l1" } as DimensionSpec);
    expect(next).toEqual({ spec: { kind: "length", line: "l2" }, value: 5 });
    // And from the height, back to a width.
    expect(nextSideDimension(rect(), { kind: "length", line: "l2" } as DimensionSpec)).toEqual({ spec: { kind: "length", line: "l3" }, value: 10 });
  });

  it("si l'autre côté (ou son côté opposé) a déjà sa cote, c'est elle qui est modifiée", () => {
    const { geometry, id } = addConstraint(rect(), { kind: "length", line: "l4", value: 5 } as never);
    expect(nextSideDimension(geometry, { kind: "length", line: "l1" } as DimensionSpec)).toEqual({ dimensionId: id, value: 5 });
  });

  it("une cote de distance entre les deux bouts d'un côté compte comme ce côté ; un rayon n'a pas de suivante", () => {
    const g = rect();
    const [p1, p2] = [g.curves[0], g.curves[1]].map((c) => c);
    expect(p1 && p2).toBeTruthy();
    const line = g.curves.find((c) => c.id === "l1");
    if (line?.kind !== "line") throw new Error("line expected");
    expect(nextSideDimension(g, { kind: "distance", a: line.p1, b: line.p2 } as DimensionSpec)).toMatchObject({ spec: { line: "l2" } });
    expect(nextSideDimension(g, { kind: "radius", curve: "k1" } as DimensionSpec)).toBeNull();
  });
});
