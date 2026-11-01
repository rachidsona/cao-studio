/**
 * Actions de la mise en plan sur une feuille entière, sans écran : la cotation automatique des vues choisies (sinon
 * de toutes celles qui se voient), le nom d'une cote ou d'une annotation pour le navigateur, et le trait d'une vue
 * sous un point (sa longueur, pour la donner tout de suite quand on le clique), le côté de sa vue où est une cote et
 * le changement de côté des cotes choisies.
 */
import { cutList, type PartInput } from "../../document/cut-list";
import { bodyLabel } from "../../document/operations";
import type { CadDocument } from "../../document/types";
import { onSide, sideOf } from "../../drawing/arrange";
import { autoDimensions, isAutoOf } from "../../drawing/auto-dims";
import { drawAnnotation, measure } from "../../drawing/annotations";
import type { SheetLayout } from "../../drawing/layout";
import { FORMATS, FRAME_ID, FRAME_MARGIN, TITLE_ID, freshId, sheetIds, shown, titleBox, type DrawingSheet, type Vec2 } from "../../drawing/model";
import { bomSvg, type BomRow } from "../../drawing/svg";

/**
 * The sheet with the automatic dimensions of these views (all shown views but details when none), replacing earlier
 * ones; `format` writes their figures (to know how long they are).
 */
export function withAutoDimensions(sheet: DrawingSheet, layout: SheetLayout, ids: string[], format?: (mm: number) => string): DrawingSheet {
  const chosen = sheet.views.filter((v) => (ids.length ? ids.includes(v.id) : shown(sheet, v.id) && v.kind !== "detail" && !v.orientation?.startsWith("iso")));
  let out: DrawingSheet = { ...sheet, annotations: sheet.annotations.filter((a) => !chosen.some((v) => isAutoOf(a, v.id))) };
  for (const view of chosen) {
    for (const made of autoDimensions(out, layout, view, format)) {
      const id = freshId(sheetIds(out), "note");
      out = { ...out, annotations: [...out.annotations, { ...made, id } as DrawingSheet["annotations"][number]] };
    }
  }
  return out;
}

/** How the navigator names an annotation: its kind, and its value or its text. */
export function describeAnnotation(sheet: DrawingSheet, layout: SheetLayout, id: string, format: (mm: number) => string): string {
  const a = sheet.annotations.find((x) => x.id === id);
  if (!a) return id;
  switch (a.kind) {
    case "dimension": {
      const value = measure(sheet, layout, a);
      return `Cote ${{ horizontal: "horizontale", vertical: "verticale", aligned: "alignée" }[a.mode]} ${a.text ?? (value === null ? "?" : format(value))}`;
    }
    case "diameter":
      return `Diamètre ⌀${format(a.radius * 2)}`;
    case "radius":
      return `Rayon R${format(a.radius)}`;
    case "angle":
      return "Angle";
    case "text":
      return `Texte « ${a.text} »`;
    case "note":
      return `Note « ${a.text} »`;
    case "balloon":
      return "Repère";
    default:
      return "Nomenclature";
  }
}

/** The trait of a view nearest to a paper point (within 2 mm of paper), with its ends in the view's frame. */
export function traitAt(sheet: DrawingSheet, layout: SheetLayout, p: Vec2): { view: string; a: Vec2; b: Vec2; length: number } | null {
  const view = layout.viewAt(sheet, p, 1);
  if (!view) return null;
  const q = layout.fromPaper(sheet, view, p);
  let best: { a: Vec2; b: Vec2; d: number } | null = null;
  for (const l of layout.geometry(sheet, view).lines) {
    const [dx, dy] = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
    const t = Math.max(0, Math.min(1, ((q[0] - l.a[0]) * dx + (q[1] - l.a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(q[0] - l.a[0] - t * dx, q[1] - l.a[1] - t * dy);
    if (d < 2 * view.scale && (!best || d < best.d)) best = { a: l.a, b: l.b, d };
  }
  return best ? { view: view.id, a: best.a, b: best.b, length: Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]) } : null;
}

/** What is under a paper point: an annotation (its lines, texts, circles), a 2D element, then a view. */
export function hitTest(sheet: DrawingSheet, layout: SheetLayout, p: Vec2, bom: BomRow[], format: (mm: number) => string): string | null {
  const near = (a: Vec2, b: Vec2) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const off = new Set(sheet.hiddenItems ?? []);
  for (const a of [...sheet.annotations].reverse().filter((x) => !off.has(x.id))) {
    if (a.kind === "bom") {
      const { size } = bomSvg(a.at, bom);
      if (p[0] >= a.at[0] && p[0] <= a.at[0] + size[0] && p[1] >= a.at[1] && p[1] <= a.at[1] + size[1]) return a.id;
      continue;
    }
    const d = drawAnnotation(sheet, layout, a, format, () => 1);
    if (d.lines.some(([x, y]) => near(x, y) < 1.5) || d.texts.some((t) => Math.hypot(t.at[0] - p[0], t.at[1] - 1.5 - p[1]) < Math.max(3, t.text.length * t.size * 0.3)) || d.circles.some((c) => Math.hypot(c.center[0] - p[0], c.center[1] - p[1]) < c.radius + 1)) return a.id;
  }
  const { scale, origin } = sheet.sketch;
  const sp = (v: Vec2): Vec2 => [origin[0] + v[0] / scale, origin[1] - v[1] / scale];
  for (const i of [...sheet.sketch.items].reverse().filter((x) => !off.has(x.id))) {
    if (i.kind === "line" && near(sp(i.a), sp(i.b)) < 1.5) return i.id;
    if (i.kind === "rect") {
      const [a, b] = [sp(i.a), sp(i.b)];
      const c: Vec2[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
      if (c.some((q, k) => near(q, c[(k + 1) % 4]!) < 1.5)) return i.id;
    }
    if (i.kind === "circle" && Math.abs(Math.hypot(sp(i.center)[0] - p[0], sp(i.center)[1] - p[1]) - i.radius / scale) < 1.5) return i.id;
  }
  const view = layout.viewAt(sheet, p, 1)?.id;
  if (view) return view;
  // The title block anywhere inside it, the frame on its line.
  const [lo, hi] = titleBox(sheet);
  if (!off.has(TITLE_ID) && p[0] >= lo[0] && p[0] <= hi[0] && p[1] >= lo[1] && p[1] <= hi[1]) return TITLE_ID;
  const [w, h] = FORMATS[sheet.format];
  const [m, r, b] = [FRAME_MARGIN, w - FRAME_MARGIN, h - FRAME_MARGIN];
  const frame: Vec2[] = [[m, m], [r, m], [r, b], [m, b]];
  if (!off.has(FRAME_ID) && frame.some((q, k) => near(q, frame[(k + 1) % 4]!) < 2)) return FRAME_ID;
  return null;
}

export type Side = "top" | "bottom" | "left" | "right";

/** The side of its view a dimension is on (null: aligned, or between two views). */
export function sideName(sheet: DrawingSheet, layout: SheetLayout, id: string): Side | null {
  const a = sheet.annotations.find((x) => x.id === id);
  if (a?.kind !== "dimension" || a.mode === "aligned" || a.a.view !== a.b.view) return null;
  const side = sideOf(sheet, layout, a);
  return a.mode === "vertical" ? (side > 0 ? "left" : "right") : side > 0 ? "bottom" : "top";
}

/** Every chosen dimension of that direction moved to that side of its view, each on the first free row there. */
export function withDimensionsOnSide(sheet: DrawingSheet, layout: SheetLayout, ids: string[], side: Side): DrawingSheet {
  const mode = side === "left" || side === "right" ? "vertical" : "horizontal";
  const outward = side === "left" || side === "bottom" ? 1 : -1;
  return ids.reduce((out, id) => {
    const a = out.annotations.find((x) => x.id === id);
    if (a?.kind !== "dimension" || a.mode !== mode || a.a.view !== a.b.view) return out;
    const offset = onSide(out, layout, a, outward);
    return { ...out, annotations: out.annotations.map((x) => (x.id === id ? { ...a, offset, textShift: undefined } : x)) };
  }, sheet);
}

/** The parts list: the cut list of these pieces, a number per row, with the bodies of each row. */
export function bomRows(doc: CadDocument, parts: PartInput[], format: (mm: number) => string): BomRow[] {
  return cutList(doc, parts).rows.map((r, i) => ({
    item: i + 1,
    name: r.names[0] + (r.names.length > 1 ? ` (+${r.names.length - 1})` : ""),
    quantity: r.quantity,
    material: r.material,
    size: `${format(r.length)} × ${format(r.width)} × ${format(r.thickness)}`,
    bodies: parts.filter((p) => r.names.includes(bodyLabel(doc, p.id))).map((p) => p.id),
  }));
}
