/** Motif d'une face seule : la face repérée par sa normale et sa place, retrouvée quand la pièce change de taille. */
import { describe, expect, it } from "vitest";
import { faceAppearances, setBodyAppearance } from "../../frontend/src/appearance/assign";
import { faceLooks, faceMarks, matchFace, setFaceAppearance, type FaceMesh } from "../../frontend/src/appearance/face-looks";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

/** A box mesh, one face (two triangles, its own four vertices with the face's normal) per side: −X, +X, −Y, +Y, −Z, +Z. */
function box(size: [number, number, number]): FaceMesh {
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faceGroups: { start: number; count: number }[] = [];
  for (const axis of [0, 1, 2]) {
    for (const sign of [-1, 1]) {
      const [u, v] = [0, 1, 2].filter((a) => a !== axis) as [number, number];
      const base = vertices.length / 3;
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const p = [0, 0, 0];
        p[axis] = sign > 0 ? size[axis]! : 0;
        p[u] = a! * size[u]!;
        p[v] = b! * size[v]!;
        const n = [0, 0, 0];
        n[axis] = sign;
        vertices.push(...p);
        normals.push(...n);
      }
      faceGroups.push({ start: indices.length, count: 6 });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { vertices, normals, indices, faceGroups };
}

describe("motif d'une face", () => {
  it("repère chaque face par sa normale et la place de son centre dans la pièce", () => {
    const marks = faceMarks(box([600, 400, 18]));
    expect(marks[5]).toEqual({ normal: [0, 0, 1], rel: [0.5, 0.5, 1] });
    expect(marks[0]).toEqual({ normal: [-1, 0, 0], rel: [0, 0.5, 0.5] });
  });

  it("retrouve la face quand la pièce change de taille, pas une autre", () => {
    const top = faceMarks(box([600, 400, 18]))[5]!;
    const bigger = faceMarks(box([900, 500, 25]));
    expect(matchFace(bigger, top)).toBe(5);
    expect(matchFace(bigger, { normal: [0, 0, 1], rel: [0.5, 0.5, 0.2] })).toBe(-1);
  });

  it("pose, remplace et retire le motif d'une face ; la pièce entière l'efface", () => {
    const top = faceMarks(box([600, 400, 18]))[5]!;
    let doc: CadDocument = createReferencePlate();
    doc = setFaceAppearance(doc, [{ bodyId: "h1", mark: top }], "wood-walnut");
    doc = setFaceAppearance(doc, [{ bodyId: "h1", mark: top }], "marble-carrara");
    expect(faceLooks(doc, "h1")).toEqual([{ ...top, appearance: "marble-carrara" }]);
    expect(faceAppearances(doc, "h1", [[0, 0, 0], [600, 400, 18]])[0]?.look.appearance.id).toBe("marble-carrara");
    // Kept with the project.
    expect(parseDocument(JSON.parse(JSON.stringify(doc))).bodyInfo).toEqual(doc.bodyInfo);
    expect(faceLooks(setFaceAppearance(doc, [{ bodyId: "h1", mark: top }], null), "h1")).toEqual([]);
    expect(faceLooks(setBodyAppearance(doc, ["h1"], "wood-oak"), "h1")).toEqual([]);
  });
});
