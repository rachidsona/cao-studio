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

describe("navigateur, cotation automatique, cote d'un trait", () => {
  it("cote automatiquement une vue : hors tout en largeur et en hauteur ; relancée, remplace les siennes", async () => {
    const { withAutoDimensions } = await import("../../frontend/src/app/drawing/sheet-actions");
    const layout = new SheetLayout(() => CABINET);
    let sheet = sheetWith([view("v1")]);
    sheet = withAutoDimensions(sheet, layout, ["v1"]);
    const values = sheet.annotations.map((a) => (a.kind === "dimension" ? measure(sheet, layout, a) : null));
    expect(values.sort()).toEqual([600, 720]);
    expect(withAutoDimensions(sheet, layout, ["v1"]).annotations).toHaveLength(2);
  });

  it("un trait cliqué donne sa cote, posée hors de la vue", async () => {
    const { lineDimension } = await import("../../frontend/src/drawing/auto-dims");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const made = lineDimension(sheet, layout, sheet.views[0]!, [0, 720], [600, 720]);
    expect(made).toMatchObject({ kind: "dimension", mode: "horizontal" });
    // Above the view (its top trait): the dimension line goes up, out of the drawing.
    expect((made as { offset: number }).offset).toBeLessThan(0);
    sheet.annotations.push({ ...(made as object), id: "d1" } as DrawingSheet["annotations"][number]);
    expect(measure(sheet, layout, sheet.annotations[0] as Parameters<typeof measure>[2])).toBe(600);
  });

  it("une pièce cachée sur la feuille ou dans une vue n'est plus dessinée", () => {
    const meshes = [box("a", [0, 0, 0], [600, 400, 720]), box("b", [700, 0, 0], [900, 400, 300])];
    const layout = new SheetLayout(() => meshes);
    const sheet = sheetWith([view("v1")]);
    expect(size(layout.geometry(sheet, sheet.views[0]!))).toEqual([900, 720]);
    expect(size(layout.geometry({ ...sheet, hiddenBodies: ["b"] }, sheet.views[0]!))).toEqual([600, 720]);
    expect(size(layout.geometry(sheet, { ...sheet.views[0]!, hiddenBodies: ["a"] }))).toEqual([200, 300]);
    // Hidden as an item: neither drawn nor found under the pointer.
    const off = { ...sheet, hiddenItems: ["v1"] };
    expect(renderSheet(off, layout, { format: String, bom: [], page: [1, 1] })).not.toContain('data-id="v1"');
    expect(layout.viewAt(off, [100, 100])).toBeUndefined();
  });

  it("le cadre et le cartouche se prennent au clic et se retirent de la feuille, comme dans Fusion", async () => {
    const { hitTest } = await import("../../frontend/src/app/drawing/sheet-actions");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    // A3 (420 × 297): the title block in the bottom right corner, the frame 10 mm inside the edge.
    expect(hitTest(sheet, layout, [400, 280], [], String)).toBe("title-block");
    expect(hitTest(sheet, layout, [10.5, 200], [], String)).toBe("frame");
    expect(hitTest(sheet, layout, [60, 250], [], String)).toBeNull();
    const svg = renderSheet(sheet, layout, { format: String, bom: [], page: [1, 1] });
    expect(svg).toContain('data-id="frame"');
    expect(svg).toContain('data-id="title-block"');
    // Taken off: neither drawn, nor exported, nor found under the pointer.
    const bare = { ...sheet, hiddenItems: ["frame", "title-block"] };
    const off = renderSheet(bare, layout, { format: String, bom: [], page: [1, 1] });
    expect(off).not.toContain('data-id="frame"');
    expect(off).not.toContain('data-id="title-block"');
    expect(sheetDxf(bare, layout, String, [])).not.toContain("Caisson");
    expect(hitTest(bare, layout, [400, 280], [], String)).toBeNull();
    expect(hitTest(bare, layout, [10.5, 200], [], String)).toBeNull();
  });

  it("une vue vide (rien à dessiner) se prend par son nom, pour la retirer", () => {
    const layout = new SheetLayout(() => []);
    const sheet = sheetWith([view("v1")]);
    // Its box is a point at its place; its name 7 mm below.
    expect(layout.viewAt(sheet, [100, 107], 1)?.id).toBe("v1");
    expect(layout.viewAt(sheet, [108, 106], 1)?.id).toBe("v1");
    expect(layout.viewAt(sheet, [100, 130], 1)).toBeUndefined();
  });
});

describe("réorganiser et glisser les cotes comme Fusion", () => {
  const setup = async () => {
    const arrange = await import("../../frontend/src/drawing/arrange");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    const dim = (id: string, from: number, to: number, offset: number) =>
      ({ id, kind: "dimension" as const, mode: "horizontal" as const, a: layout.anchor(sheet, v, [from, 0]), b: layout.anchor(sheet, v, [to, 0]), offset });
    sheet.annotations.push(dim("all", 0, 600, 5), dim("left", 0, 200, 30), dim("right", 200, 600, 12));
    return { ...arrange, layout, sheet };
  };

  it("range les cotes sous la vue : les deux courtes sur le premier rang, la hors tout au rang suivant", async () => {
    const { arrangeDimensions, dimensionFrame, layout, sheet } = await setup();
    const out = arrangeDimensions(sheet, layout);
    const line = (id: string) => dimensionFrame(out, layout, out.annotations.find((a) => a.id === id) as never)!.line;
    expect(line("left")).toBeCloseTo(line("right"), 6);
    expect(line("all") - line("left")).toBeCloseTo(7, 6);
    const [, bottom] = layout.box(out, out.views[0]!);
    expect(line("left") - bottom[1]).toBeCloseTo(13, 6);
  });

  it("une cote glissée près d'une autre s'aligne sur elle, avec un guide ; son texte revient au milieu", async () => {
    const { dimensionFrame, snapDimension, layout, sheet } = await setup();
    const right = sheet.annotations.find((a) => a.id === "right") as never;
    const target = dimensionFrame(sheet, layout, sheet.annotations.find((a) => a.id === "left") as never)!.line;
    const near = { ...(right as object), offset: (right as { offset: number }).offset + (target - dimensionFrame(sheet, layout, right)!.line) + 1, textShift: 0.8 } as never;
    const snapped = snapDimension(sheet, layout, near);
    expect(dimensionFrame(sheet, layout, { ...(near as object), offset: snapped.offset } as never)!.line).toBeCloseTo(target, 6);
    expect(snapped.guides).toHaveLength(1);
    expect(snapped.textShift).toBe(0);
  });

  it("le texte est dans la ligne de cote, coupée autour de lui ; glissé dehors, la ligne le rejoint", async () => {
    const { drawAnnotation } = await import("../../frontend/src/drawing/annotations");
    const { layout, sheet } = await setup();
    const a = sheet.annotations.find((x) => x.id === "all")!;
    // 600 mm at 1:10: 60 mm of line, the text « 600 » in the middle of it, the line in two pieces around it.
    const plain = drawAnnotation(sheet, layout, a, String, () => null);
    const pieces = plain.lines.slice(-2);
    const text = plain.texts[0]!;
    expect(pieces[0]![1][0]).toBeLessThan(text.at[0] - 2);
    expect(pieces[1]![0][0]).toBeGreaterThan(text.at[0] + 2);
    expect(pieces[0]![0][1]).toBeCloseTo(pieces[1]![0][1], 6);
    // Slid 45 mm to the right, past the end: the whole line, and a piece on to the text.
    const slid = drawAnnotation(sheet, layout, { ...a, textShift: 45 } as never, String, () => null);
    expect(slid.texts[0]!.at[0] - text.at[0]).toBeCloseTo(45, 6);
    const last = slid.lines.at(-1)!;
    expect(last[1][0]).toBeGreaterThan(last[0][0]);
    expect(last[1][0]).toBeLessThan(slid.texts[0]!.at[0]);
  });
});

describe("lisibilité des cotes", () => {
  it("les chiffres d'une cote verticale s'écrivent à l'horizontale, dans la ligne coupée sur leur hauteur", async () => {
    const { drawAnnotation } = await import("../../frontend/src/drawing/annotations");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    const a = { id: "d1", kind: "dimension" as const, mode: "vertical" as const, a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [0, 720]), offset: 10 };
    const d = drawAnnotation(sheet, layout, a, String, () => null);
    const text = d.texts[0]!;
    expect(text.angle).toBe(0);
    // The line in two pieces, the gap the height of the text (3.5 mm) and a margin on each side.
    const [top, bottom] = d.lines.slice(-2) as unknown as [[number[], number[]], [number[], number[]]];
    expect(top[1]![0]).toBeCloseTo(text.at[0], 6);
    expect(Math.abs(bottom[0]![1]! - top[1]![1]!)).toBeCloseTo(3.5 + 1.6, 6);
  });

  it("le style des traits des cotes : celui de la feuille, ou le sien ; « Effacer » retire les cotes", async () => {
    const { drawAnnotation } = await import("../../frontend/src/drawing/annotations");
    const { withoutDimensions } = await import("../../frontend/src/drawing/model");
    const layout = new SheetLayout(() => CABINET);
    const sheet = { ...sheetWith([view("v1"), view("v2", { at: [300, 100] })]), dimStyle: { weight: "thick" as const } };
    const [v1, v2] = sheet.views as [DrawingView, DrawingView];
    const dim = (id: string, v: DrawingView) => ({ id, kind: "dimension" as const, mode: "horizontal" as const, a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [600, 0]), offset: 10 });
    sheet.annotations.push(dim("d1", v1), { ...dim("d2", v2), style: { dashed: true } }, { id: "t", kind: "text", at: [10, 10], text: "Note", size: 3.5 });
    expect(drawAnnotation(sheet, layout, sheet.annotations[0]!, String, () => null).style).toEqual({ width: 0.35, dashed: false });
    expect(drawAnnotation(sheet, layout, sheet.annotations[1]!, String, () => null).style).toEqual({ width: 0.35, dashed: true });
    expect(renderSheet(sheet, layout, { format: String, bom: [], page: [1, 1] })).toContain('stroke-width="0.35" fill="none" stroke-dasharray="2 1"');
    expect(withoutDimensions(sheet, ["v1"]).annotations.map((a) => a.id)).toEqual(["d2", "t"]);
    expect(withoutDimensions(sheet).annotations.map((a) => a.id)).toEqual(["t"]);
  });

  it("la cote d'un trait cliqué se pose sur le premier rang libre, pas sur une cote déjà là", async () => {
    const { lineDimension } = await import("../../frontend/src/drawing/auto-dims");
    const { dimensionFrame } = await import("../../frontend/src/drawing/arrange");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    const first = lineDimension(sheet, layout, v, [0, 720], [600, 720])!;
    sheet.annotations.push({ ...(first as object), id: "d1" } as DrawingSheet["annotations"][number]);
    const second = { ...(lineDimension(sheet, layout, v, [200, 720], [400, 720]) as object), id: "d2" } as never;
    const [l1, l2] = [dimensionFrame(sheet, layout, sheet.annotations[0] as never)!.line, dimensionFrame(sheet, layout, second)!.line];
    // Above the view: the second one row further out.
    expect(l1 - l2).toBeCloseTo(7, 6);
  });
});

describe("côté et lignes d'attache des cotes", () => {
  it("en petits traits, seules les lignes d'attache le sont : la ligne de cote reste continue", async () => {
    const { drawAnnotation } = await import("../../frontend/src/drawing/annotations");
    const { drawnSvg } = await import("../../frontend/src/drawing/svg");
    const layout = new SheetLayout(() => CABINET);
    const sheet = { ...sheetWith([view("v1")]), dimStyle: { dashed: true } };
    const v = sheet.views[0]!;
    const a = { id: "d1", kind: "dimension" as const, mode: "horizontal" as const, a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [600, 0]), offset: 10 };
    const d = drawAnnotation(sheet, layout, a, String, () => null);
    expect(d.extensions).toHaveLength(2);
    const svg = drawnSvg(d, "#000");
    const lines = svg.match(/<line [^>]*>/g)!;
    // Two extension lines dashed, the pieces of the dimension line solid.
    expect(lines.filter((l) => l.includes("dasharray"))).toHaveLength(2);
    expect(lines.filter((l) => !l.includes("dasharray")).length).toBe(d.lines.length);
  });

  it("une cote verticale passe de gauche à droite de sa vue, sur le premier rang libre", async () => {
    const { sideName, withDimensionsOnSide } = await import("../../frontend/src/app/drawing/sheet-actions");
    const { dimensionFrame } = await import("../../frontend/src/drawing/arrange");
    const layout = new SheetLayout(() => CABINET);
    const sheet = sheetWith([view("v1")]);
    const v = sheet.views[0]!;
    sheet.annotations.push({ id: "d1", kind: "dimension", mode: "vertical", a: layout.anchor(sheet, v, [0, 0]), b: layout.anchor(sheet, v, [0, 720]), offset: 15 });
    expect(sideName(sheet, layout, "d1")).toBe("left");
    const moved = withDimensionsOnSide(sheet, layout, ["d1"], "right");
    expect(sideName(moved, layout, "d1")).toBe("right");
    const [, hi] = layout.box(moved, moved.views[0]!);
    // Right of the view by the first row of the side (11 mm): the line's coordinate across is −x.
    expect(-dimensionFrame(moved, layout, moved.annotations[0] as never)!.line - hi[0]).toBeCloseTo(11, 6);
  });
});
