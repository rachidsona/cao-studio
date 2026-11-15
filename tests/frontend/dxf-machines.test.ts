/** Les calques des machines dans le DXF : poches et rainures à leur profondeur, contours enchaînés, profils woodWOP, ABF… */
import { describe, expect, it } from "vitest";
import { withMachine } from "../../frontend/src/app/workshop/dxf-machines";
import type { FaceOutline } from "../../frontend/src/geometry/protocol";
import { chainLoop, edgeLoops, flattenOutline, LAYER_PROFILES, layerName, loopArea, loopDepthOf, partsDxf, type FlatPart } from "../../frontend/src/io/dxf";
import { partsGcode } from "../../frontend/src/io/gcode";

type P3 = [number, number, number];
const rect = (x0: number, y0: number, x1: number, y1: number, z = 0): FaceOutline["edges"] => {
  const p: P3[] = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  return p.map((a, i) => ({ kind: "line" as const, a, b: p[(i + 1) % 4]! }));
};
const profile = (id: string) => LAYER_PROFILES.find((p) => p.id === id)!.profile;

/** A 600 × 400 board, 19 thick, face up at z = 19: an 8 mm deep groove 10 × 380, and a through cut-out 100 × 50. */
const board = (): FlatPart => {
  const outline: FaceOutline = { surface: "PLANE", center: [300, 200, 19], normal: [0, 0, 1], edges: [...rect(0, 0, 600, 400, 19), ...rect(50, 10, 60, 390, 19), ...rect(300, 100, 400, 150, 19), { kind: "circle", center: [500, 300, 19], radius: 4 }] };
  // The walls of the groove go down to z = 11; the cut-out's to z = 0.
  const walls: P3[] = [[50, 10, 11], [60, 10, 11], [60, 390, 11], [50, 390, 11], [300, 100, 0], [400, 100, 0], [400, 150, 0], [300, 150, 0]];
  const vertices = walls.flat();
  return flattenOutline(outline, "Côté", 19, () => 12, (points) => loopDepthOf(vertices, outline.normal, points, 19));
};

describe("DXF pour les machines", () => {
  it("met une rainure à sa profondeur, une découpe intérieure de part en part", () => {
    const part = board();
    const loops = edgeLoops(part.edges);
    expect(loops).toHaveLength(3);
    const depths = loops.map((l) => l.map((i) => (part.edges[i]!.kind === "circle" ? null : (part.edges[i] as { depth?: number }).depth)));
    expect(depths).toEqual([[undefined, undefined, undefined, undefined], [8, 8, 8, 8], [undefined, undefined, undefined, undefined]]);
  });

  it("nomme les calques comme la machine : poche, perçage, contour", () => {
    const dxf = partsDxf([board()], 20, profile("named"));
    expect(dxf).toContain("\r\nPOCHE_Z8\r\n");
    expect(dxf).toContain("\r\nPERCAGE_D8_Z12\r\n");
    expect(dxf).toContain("\r\nCONTOUR_Z19\r\n");
    expect(partsDxf([board()], 20, profile("abf"))).toContain("\r\nABF_GROOVE-Z8\r\n");
    expect(partsDxf([board()], 20, profile("abf"))).toContain("\r\nABF-Z12-D8\r\n");
    expect(layerName("FK-1T101R", { t: 19 })).toBe("FK-1T101R");
    expect(layerName("{t}".repeat(20), { t: 19 })).toHaveLength(31);
  });

  it("enchaîne les contours en polylignes fermées tournant dans le sens des aiguilles d'une montre", () => {
    const dxf = partsDxf([board()], 20, profile("woodwop"));
    expect(dxf.match(/\r\nPOLYLINE\r\n/g)).toHaveLength(3);
    expect(dxf.match(/\r\nLINE\r\n/g)).toBeNull();
    expect(dxf).toContain("POLYLINE\r\n8\r\nFK-1T101R\r\n");
    // The outline's first corners: (0,0) then (0,400) — clockwise.
    const vertices = [...dxf.matchAll(/VERTEX\r\n8\r\nFK-1T101R\r\n10\r\n([-\d.]+)\r\n20\r\n([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const area = vertices.reduce((a, p, i) => a + (p[0]! * vertices[(i + 1) % vertices.length]![1]! - vertices[(i + 1) % vertices.length]![0]! * p[1]!) / 2, 0);
    expect(area).toBeLessThan(0);
  });

  it("garde le sens et le bombé des arcs dans une boucle", () => {
    // A 100 × 100 square with a round corner of radius 20, counter-clockwise.
    const spans = chainLoop([
      { a: [0, 0], b: [100, 0], bulge: 0 },
      { a: [100, 0], b: [100, 80], bulge: 0 },
      { a: [100, 80], b: [80, 100], bulge: Math.tan(Math.PI / 8) },
      { a: [80, 100], b: [0, 100], bulge: 0 },
      { a: [0, 100], b: [0, 0], bulge: 0 },
    ])!;
    expect(loopArea(spans)).toBeCloseTo(100 * 100 - 400 + Math.PI * 100, 3);
    expect(chainLoop([{ a: [0, 0], b: [1, 0], bulge: 0 }])).toBeNull();
  });

  it("ne détoure pas une rainure en G-code : il la dit à faire à part", () => {
    const { code, skipped } = partsGcode([{ label: "Mélaminé 19", size: [2800, 2070], parts: [board()] }]);
    expect(skipped.some((s) => /rainure ou poche de 8 mm/.test(s))).toBe(true);
    expect(code).toContain("M30");
  });

  it("garde une machine sous son nom, la remplace sous le même", () => {
    const one = withMachine([], "Weeke atelier", profile("woodwop"));
    const two = withMachine(one, "weeke atelier ", { ...profile("woodwop"), contour: "FK-2T105L" });
    expect(two).toHaveLength(1);
    expect(two[0]).toEqual({ name: "weeke atelier", profile: expect.objectContaining({ contour: "FK-2T105L", chain: true }) });
    expect(withMachine(two, "  ", profile("generic"))).toHaveLength(1);
  });
});
