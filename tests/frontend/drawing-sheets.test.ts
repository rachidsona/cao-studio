/** Mise en plan comme Fusion : vues dans toutes les directions, vues projetées, coupes, détails, cotes, SVG et DXF. */
import { describe, expect, it } from "vitest";
import { measure } from "../../frontend/src/drawing/annotations";
import { sheetDxf } from "../../frontend/src/drawing/dxf";
import { SheetLayout, sectionOf } from "../../frontend/src/drawing/layout";
import { ORIENTATIONS, newSheet, placedSide, removeView, sideSpec, type DrawingSheet, type DrawingView } from "../../frontend/src/drawing/model";
import { cropCircle, projectSpec, type MeshInput } from "../../frontend/src/drawing/projection";
import { renderSheet } from "../../frontend/src/drawing/svg";
import { parseDxf } from "../../frontend/src/io/dxf-import";

/** A box as a mesh: 8 corners, 12 triangles, the 12 edges (one B-rep edge each). */
function box(id: string, lo: [number, number, number], hi: [number, number, number]): MeshInput {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const indices = quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]);
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return { id, vertices: corners.flat(), indices, edges: pairs.flatMap(([a, b]) => [...corners[a!]!, ...corners[b!]!]), edgeGroups: pairs.map((_, i) => ({ start: i * 2, count: 2 })) };
}

const CABINET = [box("a", [0, 0, 0], [600, 400, 720])];
const size = (g: { min: number[]; max: number[] }) => [g.max[0]! - g.min[0]!, g.max[1]! - g.min[1]!].map((v) => Number(v.toFixed(6)));

function sheetWith(views: DrawingView[]): DrawingSheet {
  return { ...newSheet([], "Caisson"), views };
}
const view = (id: string, extra: Partial<DrawingView> = {}): DrawingView => ({ id, kind: "base", spec: ORIENTATIONS.front.spec, orientation: "front", scale: 10, at: [100, 100], label: "Face", hidden: true, ...extra });

describe("vues de la mise en plan", () => {
  it("voit le caisson de face, de dessus, et en isométrique (trois arêtes cachées)", () => {
    expect(size(projectSpec(CABINET, ORIENTATIONS.front.spec))).toEqual([600, 720]);
    expect(size(projectSpec(CABINET, ORIENTATIONS.top.spec))).toEqual([600, 400]);
    const iso = projectSpec(CABINET, ORIENTATIONS.iso.spec);
    expect(iso.lines.filter((l) => !l.hidden)).toHaveLength(9);
    expect(iso.lines.filter((l) => l.hidden)).toHaveLength(3);
  });

  it("place les vues projetées à l'européenne : à droite la vue de gauche, dessous la vue de dessus", () => {
    const front = ORIENTATIONS.front.spec;
    expect(placedSide("right", "first")).toBe("left");
    expect(placedSide("down", "first")).toBe("top");
    expect(placedSide("right", "third")).toBe("right");
    const top = sideSpec(front, "top");
    expect(top.toViewer).toEqual(ORIENTATIONS.top.spec.toViewer);
    expect(top.up.map((v) => v + 0)).toEqual(ORIENTATIONS.top.spec.up);
    expect(sideSpec(front, "left").toViewer.map((v) => v + 0)).toEqual(ORIENTATIONS.left.spec.toViewer);
  });

  it("coupe le caisson par un plan horizontal à mi-hauteur : vue de dessus, face coupée de 600 × 400 hachurée", () => {
    const { cut, spec } = sectionOf(ORIENTATIONS.front.spec, [-100, 360], [700, 360]);
    expect(spec.toViewer.map((v) => v + 0)).toEqual([0, 0, 1]);
    const g = projectSpec(CABINET, spec, false, cut);
    expect(g.hatches).toHaveLength(1);
    const loop = g.hatches[0]![0]!;
    const area = Math.abs(loop.reduce((s, p, i) => s + p[0] * loop[(i + 1) % loop.length]![1] - loop[(i + 1) % loop.length]![0] * p[1], 0) / 2);
    expect(area).toBeCloseTo(600 * 400, 3);
  });

  it("un détail ne garde que ce qui est dans son cercle", () => {
    const g = cropCircle(projectSpec(CABINET, ORIENTATIONS.front.spec), [0, 0], 50);
    expect(g.lines).toHaveLength(2);
    expect(g.lines.every((l) => Math.hypot(...l.a) <= 50.001 && Math.hypot(...l.b) <= 50.001)).toBe(true);
  });
});

describe("feuille, cotes et exports", () => {
  it("une cote posée sur deux coins mesure le modèle, et suit quand le caisson grandit", () => {
    let meshes = CABINET;
    const layout = new SheetLayout(() => meshes, "a");
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    const dim = { id: "d1", kind: "dimension" as const, mode: "horizontal" as const, a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [600, 0]), offset: 10 };
    expect(measure(sheet, layout, dim)).toBe(600);
    meshes = [box("a", [0, 0, 0], [900, 400, 720])];
    layout.setModel("b");
    expect(measure(sheet, layout, dim)).toBe(900);
  });

  it("retirer une vue retire ses vues filles et ses cotes", () => {
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1"), view("v2", { kind: "projected", parent: "v1" })]);
    sheet.annotations.push({ id: "d1", kind: "dimension", mode: "vertical", a: layout.anchor(sheet, sheet.views[1]!, [0, 0]), b: layout.anchor(sheet, sheet.views[1]!, [0, 720]), offset: 5 });
    const left = removeView(sheet, "v1");
    expect(left.views).toEqual([]);
    expect(left.annotations).toEqual([]);
  });

  it("dessine la feuille en SVG (cartouche, vue, cote) et l'exporte en DXF relisible", () => {
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    sheet.annotations.push({ id: "d1", kind: "dimension", mode: "horizontal", a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [600, 0]), offset: 12 });
    sheet.sketch.items.push({ id: "s1", kind: "circle", center: [0, 0], radius: 100, style: "solid" });
    const svg = renderSheet(sheet, layout, { format: (mm) => `${mm}`, bom: [], page: [1, 1] });
    expect(svg).toContain('data-id="v1"');
    expect(svg).toContain(">600<");
    expect(svg).toContain("Caisson");
    const dxf = parseDxf(sheetDxf(sheet, layout, (mm) => `${mm}`, []));
    expect(dxf.shapes.length).toBeGreaterThan(10);
    expect(dxf.shapes.some((s) => s.kind === "circle" && Math.abs(s.radius - 10) < 1e-6)).toBe(true);
  });
});
