/** G-code : contour compensé de la fraise, angles rentrants, perçages au foret, cuvettes vidées, panneaux bruts. */
import { describe, expect, it } from "vitest";
import { qrSvg } from "../../frontend/src/io/qr";
import { holeDepth, type FlatEdge, type FlatPart } from "../../frontend/src/io/dxf";
import { GCODE, loopsOf, offsetLoop, packParts, partsGcode, signedArea } from "../../frontend/src/io/gcode";

const line = (a: [number, number], b: [number, number]): FlatEdge => ({ kind: "line", a, b });
const rect = (w: number, h: number): FlatEdge[] => [line([0, 0], [w, 0]), line([w, 0], [w, h]), line([w, h], [0, h]), line([0, h], [0, 0])];
const part = (edges: FlatEdge[], w: number, h: number, name = "P"): FlatPart => ({ name, thickness: 18, edges, width: w, height: h });

/** Every X, Y the tool goes through. */
const points = (code: string) => [...code.matchAll(/X(-?[\d.]+) Y(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe("G-code", () => {
  it("le contour d'un rectangle passe à un rayon de fraise tout autour, avec des arcs aux coins", () => {
    const [loop] = loopsOf(rect(600, 400));
    expect(signedArea(loop!)).toBeCloseTo(240000, 3);
    const path = offsetLoop(loop!, 3);
    expect(path.filter((s) => s.kind === "arc")).toHaveLength(4);
    expect(path[0]!.a).toEqual([0, -3]);
  });

  it("un angle rentrant (encoche) est coupé à l'intersection, sans entamer la pièce", () => {
    // 600 × 400 with a 100 × 100 notch in the top right corner.
    const edges = [line([0, 0], [600, 0]), line([600, 0], [600, 300]), line([600, 300], [500, 300]), line([500, 300], [500, 400]), line([500, 400], [0, 400]), line([0, 400], [0, 0])];
    const path = offsetLoop(loopsOf(edges)[0]!, 3);
    // The notch's inner corner (500, 300): the tool centre at (503, 303).
    expect(path.some((s) => s.kind === "line" && Math.abs(s.b[0] - 503) < 1e-9 && Math.abs(s.b[1] - 303) < 1e-9)).toBe(true);
    expect(path.filter((s) => s.kind === "arc")).toHaveLength(5);
  });

  it("une pièce plus étroite que la fraise est refusée", () => {
    const edges = [line([0, 0], [600, 0]), line([600, 0], [600, 300]), line([600, 300], [302, 300]), line([302, 300], [302, 400]), line([302, 400], [298, 400]), line([298, 400], [298, 300]), line([298, 300], [0, 300]), line([0, 300], [0, 0])];
    // A 4 mm tongue sticking out is cut round from outside; a 4 mm slot into the part cannot take a 6 mm bit.
    const slot = [line([0, 0], [600, 0]), line([600, 0], [600, 300]), line([600, 300], [302, 300]), line([302, 300], [302, 100]), line([302, 100], [298, 100]), line([298, 100], [298, 300]), line([298, 300], [0, 300]), line([0, 300], [0, 0])];
    expect(() => offsetLoop(loopsOf(edges)[0]!, 3)).not.toThrow();
    expect(() => offsetLoop(loopsOf(slot)[0]!, 3)).toThrow(/étroite|serré/);
  });

  it("perçages au foret à leur profondeur, cuvettes vidées à la fraise, contour en 3 passes jusque dans le martyr", () => {
    const edges: FlatEdge[] = [...rect(600, 400), { kind: "circle", center: [37, 32], radius: 2.5, depth: 12 }, { kind: "circle", center: [22.5, 100], radius: 17.5, depth: 13 }, { kind: "circle", center: [300, 200], radius: 3.5, depth: 18 }];
    const { code, sheets, skipped } = partsGcode([{ label: "Mélaminé blanc 18 mm", size: [2800, 2070], parts: [part(edges, 600, 400)] }], GCODE);
    expect(sheets).toBe(1);
    expect(skipped).toEqual([]);
    expect(code).toContain("T2 M6 (foret D5)");
    expect(code).toContain("T3 M6 (foret D7)");
    expect(code).toContain("T1 M6 (fraise D6)");
    // Blind Ø5 hole 12 deep; the Ø7 goes through, into the spoilboard.
    expect(code).toMatch(/G1 Z-12 F800/);
    expect(code).toMatch(/G1 Z-18\.3 F800/);
    // The cup: rings round its centre, down to 13 mm in 3 passes (6, 12, 13).
    expect(code).toMatch(/G1 Z-13 F800/);
    expect((code.match(/G2 X/g) ?? []).length).toBeGreaterThan(6);
    // All the tool positions stay on the sheet.
    for (const [x, y] of points(code)) expect(x! >= 10 - 1e-6 && y! >= 10 - 1e-6).toBe(true);
    expect(code.trim().endsWith("M30\n%".trim())).toBe(true);
  });

  it("range les pièces sur plusieurs panneaux, avec une pause entre eux", () => {
    const big = Array.from({ length: 5 }, (_, i) => part(rect(1300, 1000), 1300, 1000, `G${i}`));
    const { sheets } = packParts(big, [2800, 2070], GCODE);
    // 1300 × 1000 (+ the bit and the spacing): two by two on a 2800 × 2070 sheet.
    expect(sheets.map((s) => s.length)).toEqual([4, 1]);
    const { code } = partsGcode([{ label: "x", size: [2800, 2070], parts: big }], GCODE);
    expect((code.match(/M0 \(posez le panneau/g) ?? []).length).toBe(1);
    expect(packParts([part(rect(3000, 500), 3000, 500, "Long")], [2800, 2070], GCODE).tooBig).toEqual(["Long"]);
  });

  it("la profondeur d'un trou se lit sur le maillage", () => {
    // A Ø10 hole 12 deep under a face at Z = 18 (normal +Z): points on its wall and its bottom rim.
    const ring = (z: number) => Array.from({ length: 8 }, (_, k) => [100 + 5 * Math.cos(k), 100 + 5 * Math.sin(k), z]).flat();
    const vertices = [...ring(18), ...ring(6), 0, 0, 0, 200, 200, 18];
    expect(holeDepth(vertices, [100, 100, 18], [0, 0, 1], 5, 18)).toBe(12);
    expect(holeDepth([...ring(18), ...ring(0)], [100, 100, 18], [0, 0, 1], 5, 18)).toBe(18);
  });

  it("le QR code des étiquettes garde les accents (UTF-8)", () => {
    expect(qrSvg("Côté gauche | Mélaminé")).toMatch(/^<svg/);
  });
});
