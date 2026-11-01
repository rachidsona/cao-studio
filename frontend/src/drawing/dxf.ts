/**
 * Une feuille de mise en plan en DXF (millimètres du papier, y vers le haut), en calques : CADRE (cadre, cartouche,
 * nomenclature), CONTOUR (traits vus), CACHE (traits cachés), COUPE (contours des faces coupées), COTES (cotes et
 * annotations), DESSIN (dessin 2D libre). Pour la reprendre dans un autre logiciel de DAO.
 */
import { drawAnnotation, type Drawn } from "./annotations";
import type { SheetLayout } from "./layout";
import { FORMATS, FRAME_MARGIN, TITLE_SIZE, type DrawingSheet, type Vec2 } from "./model";
import type { BomRow } from "./svg";

const LAYERS: [string, number, string][] = [
  ["CADRE", 7, "CONTINUOUS"],
  ["CONTOUR", 7, "CONTINUOUS"],
  ["CACHE", 8, "DASHED"],
  ["COUPE", 1, "CONTINUOUS"],
  ["COTES", 5, "CONTINUOUS"],
  ["DESSIN", 3, "CONTINUOUS"],
];

/** The sheet as a DXF file. */
export function sheetDxf(sheet: DrawingSheet, layout: SheetLayout, format: (mm: number) => string, bom: BomRow[]): string {
  const h = FORMATS[sheet.format][1];
  const body: string[] = [];
  const n = (v: number) => Number(v.toFixed(4)).toString();
  const y = (p: Vec2) => h - p[1];
  const add = (...pairs: (string | number)[]) => body.push(pairs.join("\n"));
  /** A line; `extra`: its own line type (6) and weight (370, hundredths of mm), else the layer's. */
  const line = (a: Vec2, b: Vec2, layer: string, extra: (string | number)[] = []) => add(0, "LINE", 8, layer, ...extra, 10, n(a[0]), 20, n(y(a)), 30, 0, 11, n(b[0]), 21, n(y(b)), 31, 0);
  const circle = (c: Vec2, r: number, layer: string) => add(0, "CIRCLE", 8, layer, 10, n(c[0]), 20, n(y(c)), 30, 0, 40, n(r));
  /** A text from its point; centred on it (horizontal alignment 1, the point given again as 11/21) or ended at it (2). */
  const text = (at: Vec2, t: string, size: number, angle: number, layer: string, anchor: "start" | "middle" | "end" = "start") =>
    anchor === "start"
      ? add(0, "TEXT", 8, layer, 10, n(at[0]), 20, n(y(at)), 30, 0, 40, n(size), 1, t, 50, n(-angle))
      : add(0, "TEXT", 8, layer, 10, n(at[0]), 20, n(y(at)), 30, 0, 40, n(size), 1, t, 50, n(-angle), 72, anchor === "middle" ? 1 : 2, 11, n(at[0]), 21, n(y(at)), 31, 0);
  const rect = (a: Vec2, b: Vec2, layer: string) => {
    const c: Vec2[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
    c.forEach((p, i) => line(p, c[(i + 1) % 4]!, layer));
  };
  const drawn = (d: Drawn, layer: string) => {
    const weight = d.style ? [370, Math.round(d.style.width * 100)] : [];
    for (const [a, b] of d.lines) line(a, b, layer, weight);
    for (const [a, b] of d.extensions ?? []) line(a, b, layer, [...(d.style?.dashed ? [6, "DASHED"] : []), ...weight]);
    for (const { tip, dir } of d.arrows) {
      const back: Vec2 = [tip[0] - dir[0] * 2.5, tip[1] - dir[1] * 2.5];
      line(tip, [back[0] - dir[1] * 0.8, back[1] + dir[0] * 0.8], layer);
      line(tip, [back[0] + dir[1] * 0.8, back[1] - dir[0] * 0.8], layer);
    }
    for (const c of d.circles) circle(c.center, c.radius, layer);
    for (const a of d.arcs) {
      // In the DXF frame (y up) the arc runs the other way round.
      add(0, "ARC", 8, layer, 10, n(a.center[0]), 20, n(y(a.center)), 30, 0, 40, n(a.radius), 50, n((-a.to * 180) / Math.PI), 51, n((-a.from * 180) / Math.PI));
    }
    for (const t of d.texts) text(t.at, t.text, t.size, t.angle, layer, t.anchor);
  };

  const [w] = FORMATS[sheet.format];
  rect([FRAME_MARGIN, FRAME_MARGIN], [w - FRAME_MARGIN, h - FRAME_MARGIN], "CADRE");
  const [bw, bh] = TITLE_SIZE;
  rect([w - FRAME_MARGIN - bw, h - FRAME_MARGIN - bh], [w - FRAME_MARGIN, h - FRAME_MARGIN], "CADRE");
  text([w - FRAME_MARGIN - bw + 2, h - FRAME_MARGIN - bh + 9], sheet.title.title, 5, 0, "CADRE");

  const off = new Set(sheet.hiddenItems ?? []);
  for (const view of sheet.views.filter((v) => !off.has(v.id))) {
    const g = layout.geometry(sheet, view);
    const p = (q: Vec2) => layout.toPaper(sheet, view, q);
    for (const l of g.lines) line(p(l.a), p(l.b), l.hidden ? "CACHE" : "CONTOUR");
    for (const loop of g.hatches.flat()) loop.forEach((q, i) => line(p(q), p(loop[(i + 1) % loop.length]!), "COUPE"));
    const [, b] = layout.box(sheet, view);
    text([view.at[0] - 20, b[1] + 7], view.label, 3.5, 0, "COTES");
  }
  const itemOf = (id: string) => bom.find((r) => r.bodies.includes(id))?.item ?? null;
  for (const a of sheet.annotations.filter((x) => !off.has(x.id))) {
    if (a.kind === "bom") {
      bom.forEach((r, i) => text([a.at[0] + 1.5, a.at[1] + (i + 1) * 6 + 4.2], `${r.item}  ${r.name}  x${r.quantity}  ${r.material}  ${r.size}`, 3, 0, "CADRE"));
      continue;
    }
    drawn(drawAnnotation(sheet, layout, a, format, itemOf), "COTES");
  }
  const { scale, origin } = sheet.sketch;
  const sp = (v: Vec2): Vec2 => [origin[0] + v[0] / scale, origin[1] - v[1] / scale];
  for (const item of sheet.sketch.items.filter((i) => !off.has(i.id))) {
    if (item.kind === "line") line(sp(item.a), sp(item.b), "DESSIN");
    else if (item.kind === "rect") rect(sp(item.a), sp(item.b), "DESSIN");
    else circle(sp(item.center), item.radius / scale, "DESSIN");
  }

  const table = LAYERS.map(([name, color, type]) => [0, "LAYER", 2, name, 70, 0, 62, color, 6, type].join("\n")).join("\n");
  return [
    "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC",
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${LAYERS.length}\n${table}\n0\nENDTAB\n0\nENDSEC`,
    `0\nSECTION\n2\nENTITIES\n${body.join("\n")}\n0\nENDSEC`,
    "0\nEOF\n",
  ].join("\n");
}
