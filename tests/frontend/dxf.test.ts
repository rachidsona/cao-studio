/** Export DXF pour la commande numérique : la grande face de chaque panneau mise à plat, et le fichier R12. */
import { describe, expect, it } from "vitest";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { flattenOutline, largestFlatFace, partsDxf } from "../../frontend/src/io/dxf";

describe("export DXF", () => {
  it("trouve la plus grande face plane d'un corps", () => {
    // Face 0: a small flat square (1 × 1); face 1: a large bent face (two triangles at right angles); face 2: a flat 3 × 2 rectangle.
    const vertices = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 9, 0, 0, 9, 0, 9, 0, 0, 0, 0, 9, 0, 9, 0, 0, 0, 0, 5, 3, 0, 5, 3, 2, 5, 0, 2, 5]);
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 10, 12, 13]);
    const faceGroups = [
      { start: 0, count: 6, faceId: 0 },
      { start: 6, count: 6, faceId: 1 },
      { start: 12, count: 6, faceId: 2 },
    ];
    expect(largestFlatFace({ vertices, indices, faceGroups })).toBe(2);
  });

  it("met un panneau debout à plat le long de son plus grand côté, coin bas à l'origine, avec ses perçages", () => {
    // A 600 × 400 side panel standing in the XZ plane (normal −Y), a Ø8 hole and a rounded corner.
    const outline: FaceOutline = {
      surface: "PLANE",
      center: [300, 0, 200],
      normal: [0, -1, 0],
      edges: [
        { kind: "line", a: [0, 0, 0], b: [600, 0, 0] },
        { kind: "line", a: [600, 0, 0], b: [600, 0, 350] },
        { kind: "arc", center: [550, 0, 350], radius: 50, a: [600, 0, 350], b: [550, 0, 400], mid: [550 + 50 * Math.SQRT1_2, 0, 350 + 50 * Math.SQRT1_2] },
        { kind: "line", a: [550, 0, 400], b: [0, 0, 400] },
        { kind: "line", a: [0, 0, 400], b: [0, 0, 0] },
        { kind: "circle", center: [100, 0, 100], radius: 4 },
      ],
    };
    const part = flattenOutline(outline, "Côté gauche", 18);
    expect([Math.round(part.width), Math.round(part.height)]).toEqual([600, 400]);
    const line = part.edges[0]!;
    expect(line.kind === "line" && [line.a, line.b].map((p) => p.map(Math.round))).toEqual([[0, 0], [600, 0]]);
    const hole = part.edges[5]!;
    expect(hole.kind === "circle" && hole.center.map(Math.round)).toEqual([100, 100]);
    const arc = part.edges[2]!;
    // Counter-clockwise from 0° to 90° around the corner's centre.
    expect(arc.kind === "arc" && [Math.round((arc.start * 180) / Math.PI), Math.round((arc.end * 180) / Math.PI)]).toEqual([0, 90]);
  });

  it("écrit un DXF R12 : pièces côte à côte, calques contour, perçage et texte sans accents", () => {
    const square = (name: string, size: number) =>
      ({ name, thickness: 18, width: size, height: size, edges: [
        { kind: "line" as const, a: [0, 0] as [number, number], b: [size, 0] as [number, number] },
        { kind: "circle" as const, center: [size / 2, size / 2] as [number, number], radius: 4 },
      ] });
    const dxf = partsDxf([square("Étagère", 100), square("Fond", 50)], 20);
    expect(dxf.startsWith("0\r\nSECTION")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxf.match(/\r\nLINE\r\n/g)).toHaveLength(2);
    expect(dxf.match(/\r\nCIRCLE\r\n8\r\nPERCAGE/g)).toHaveLength(2);
    // The second part starts after the first one and the gap: x = 120.
    expect(dxf).toContain("LINE\r\n8\r\nCONTOUR\r\n10\r\n120\r\n");
    expect(dxf).toContain("Etagere - ep. 18 mm");
    expect(/[^\x00-\x7F]/.test(dxf)).toBe(false);
  });
});
