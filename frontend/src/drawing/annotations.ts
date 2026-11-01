/**
 * Les cotes et annotations d'une feuille, en millimètres du papier : lignes d'attache, ligne de cote et ses flèches,
 * texte (la valeur mesurée sur le modèle, à l'échelle de la vue, ou un texte imposé) ; diamètres, rayons et angles ;
 * notes et repères avec leur ligne de rappel. Pur : le rendu SVG et l'export DXF les tracent tels quels.
 */
import type { SheetLayout } from "./layout";
import { DIMENSION_KINDS, dimStyleOf, type Annotation, type DrawingSheet, type Vec2 } from "./model";

export interface Drawn {
  lines: [Vec2, Vec2][];
  /** The extension lines of a dimension (from the drawing to its line): dashed when its style says so. */
  extensions?: [Vec2, Vec2][];
  /** Arrow heads: the tip and the direction it points to. */
  arrows: { tip: Vec2; dir: Vec2 }[];
  texts: { at: Vec2; text: string; angle: number; anchor: "start" | "middle" | "end"; size: number }[];
  circles: { center: Vec2; radius: number }[];
  /** Arcs (angle dimensions): centre, radius, from and to angles (radians, paper frame, y down). */
  arcs: { center: Vec2; radius: number; from: number; to: number }[];
  /** Lines of a dimension: their width (paper mm), and dashes on its extension lines (its own line stays solid). */
  style?: { width: number; dashed: boolean };
}

const EXTEND = 1.5;
const GAP = 1;
export const TEXT_SIZE = 3.5;
/** How long a dimension's figures are on the paper (mm), written level. */
export const labelWidth = (label: string) => label.length * TEXT_SIZE * 0.56;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => mul(a, 1 / (len(a) || 1));
const empty = (): Drawn => ({ lines: [], arrows: [], texts: [], circles: [], arcs: [] });

/** The measured value of a linear dimension (model mm), or null when a point is gone. */
export function measure(sheet: DrawingSheet, layout: SheetLayout, a: Annotation & { kind: "dimension" }): number | null {
  const [pa, pb] = [layout.resolve(sheet, a.a), layout.resolve(sheet, a.b)];
  const [va, vb] = [sheet.views.find((v) => v.id === a.a.view), sheet.views.find((v) => v.id === a.b.view)];
  if (!pa || !pb || !va || !vb) return null;
  // Two points of one view: measured in its frame; of two views, on the paper at the first one's scale.
  const d = va === vb ? sub(pb, pa) : mul(sub(layout.toPaper(sheet, vb, pb), layout.toPaper(sheet, va, pa)), va.scale);
  return a.mode === "horizontal" ? Math.abs(d[0]) : a.mode === "vertical" ? Math.abs(d[1]) : len(d);
}

/** What an annotation draws on the paper (`format`: a length as text; `item`: a body's number in the parts list). */
export function drawAnnotation(sheet: DrawingSheet, layout: SheetLayout, a: Annotation, format: (mm: number) => string, item: (body: string) => number | null): Drawn {
  const drawn = shapeOf(sheet, layout, a, format, item);
  if (!DIMENSION_KINDS.has(a.kind)) return drawn;
  const style = dimStyleOf(sheet, a);
  return { ...drawn, style: { width: style.weight === "thick" ? 0.35 : 0.18, dashed: style.dashed } };
}

function shapeOf(sheet: DrawingSheet, layout: SheetLayout, a: Annotation, format: (mm: number) => string, item: (body: string) => number | null): Drawn {
  const out = empty();
  const viewOf = (id: string) => sheet.views.find((v) => v.id === id);
  const paperOf = (anchor: { view: string; rel: Vec2 }) => {
    const view = viewOf(anchor.view);
    const p = layout.resolve(sheet, anchor);
    return view && p ? layout.toPaper(sheet, view, p) : null;
  };
  switch (a.kind) {
    case "dimension": {
      const [pa, pb] = [paperOf(a.a), paperOf(a.b)];
      const value = measure(sheet, layout, a);
      if (!pa || !pb || value === null) return out;
      // The dimension line: along X, along Y, or along the two points, `offset` away from their middle.
      const dir: Vec2 = a.mode === "horizontal" ? [1, 0] : a.mode === "vertical" ? [0, 1] : unit(sub(pb, pa));
      const normal: Vec2 = [-dir[1], dir[0]];
      const mid = mul(add(pa, pb), 0.5);
      const base = add(mid, mul(normal, a.offset));
      const along = (p: Vec2) => (p[0] - base[0]) * dir[0] + (p[1] - base[1]) * dir[1];
      const [sa, sb] = [add(base, mul(dir, along(pa))), add(base, mul(dir, along(pb)))];
      for (const [p, s] of [[pa, sa], [pb, sb]] as [Vec2, Vec2][]) {
        const out1 = unit(sub(s, p));
        if (len(sub(s, p)) > GAP) (out.extensions ??= []).push([add(p, mul(out1, GAP)), add(s, mul(out1, EXTEND))]);
      }
      const d = unit(sub(sb, sa));
      const label = a.text ?? format(value);
      out.arrows.push({ tip: sa, dir: mul(d, -1) }, { tip: sb, dir: d });
      // The figures always written level, in the line as on a drawing (« ←— 123 cm —→ »): the line stops on both
      // sides of them, over what the text covers along it (its width across a horizontal line, its height across a
      // vertical one). Slid along the line (`textShift`) past an extension line, the line runs on to it. Too short to
      // hold it between its arrows, the text goes out of the line: above it, or beside it on the outer side.
      const length = len(sub(sb, sa));
      const [w, h] = [labelWidth(label), TEXT_SIZE];
      const covered = Math.abs(d[0]) * w + Math.abs(d[1]) * h;
      const shift = (a.textShift ?? 0) * (dir[0] * d[0] + dir[1] * d[1] >= 0 ? 1 : -1);
      const center = length / 2 + shift;
      const point = (t: number) => add(sa, mul(d, t));
      const [from, to] = [center - covered / 2 - 0.8, center + covered / 2 + 0.8];
      const inline = (from >= 3 && to <= length - 3) || from >= length || to <= 0;
      // The baseline, a third of a letter under the middle of the text.
      const middle = (p: Vec2): Vec2 => [p[0], p[1] + TEXT_SIZE * 0.35];
      if (inline) {
        // Inside: two pieces of line; outside (slid away): the whole line and a piece on to the text.
        if (from > 0 && to < length) out.lines.push([point(0), point(from)], [point(to), point(length)]);
        else if (from >= length) out.lines.push([point(0), point(length)], [point(length), point(from)]);
        else out.lines.push([point(to), point(0)], [point(0), point(length)]);
        out.texts.push({ at: middle(point(center)), text: label, angle: 0, anchor: "middle", size: TEXT_SIZE });
      } else {
        out.lines.push([sa, sb]);
        const outer = mul(normal, Math.sign(a.offset) || 1);
        const beside: Vec2 = Math.abs(d[0]) >= Math.abs(d[1]) ? [0, -1.2] : add(mul([Math.sign(outer[0]) || -1, 0], w / 2 + 1.5), [0, TEXT_SIZE * 0.35]);
        out.texts.push({ at: add(point(center), beside), text: label, angle: 0, anchor: "middle", size: TEXT_SIZE });
      }
      return out;
    }
    case "diameter":
    case "radius": {
      const view = viewOf(a.view);
      if (!view) return out;
      const c = layout.toPaper(sheet, view, a.center);
      const r = a.radius / view.scale;
      const dir: Vec2 = [Math.cos((a.angle * Math.PI) / 180), -Math.sin((a.angle * Math.PI) / 180)];
      const edge = add(c, mul(dir, r));
      const outside = add(c, mul(dir, r + 8));
      const label = a.text ?? (a.kind === "diameter" ? `⌀${format(a.radius * 2)}` : `R${format(a.radius)}`);
      if (a.kind === "diameter") {
        const far = add(c, mul(dir, -r));
        out.lines.push([far, outside]);
        out.arrows.push({ tip: far, dir: mul(dir, -1) }, { tip: edge, dir });
      } else {
        out.lines.push([c, outside]);
        out.arrows.push({ tip: edge, dir });
      }
      out.texts.push({ at: add(outside, [dir[0] >= 0 ? 1 : -1, -1]), text: label, angle: 0, anchor: dir[0] >= 0 ? "start" : "end", size: TEXT_SIZE });
      return out;
    }
    case "angle": {
      const view = viewOf(a.view);
      if (!view) return out;
      const [v, pa, pb] = [a.vertex, a.a, a.b].map((p) => layout.toPaper(sheet, view, p)) as [Vec2, Vec2, Vec2];
      let [from, to] = [Math.atan2(pa[1] - v[1], pa[0] - v[0]), Math.atan2(pb[1] - v[1], pb[0] - v[0])];
      let sweep = to - from;
      while (sweep <= -Math.PI) sweep += 2 * Math.PI;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (sweep < 0) [from, to, sweep] = [to, from, -sweep];
      to = from + sweep;
      out.arcs.push({ center: v, radius: a.radius, from, to });
      for (const t of [from, to]) out.lines.push([v, add(v, mul([Math.cos(t), Math.sin(t)], a.radius + EXTEND))]);
      const mid = (from + to) / 2;
      const degrees = (sweep * 180) / Math.PI;
      out.texts.push({ at: add(v, mul([Math.cos(mid), Math.sin(mid)], a.radius + 3)), text: a.text ?? `${Number(degrees.toFixed(1)).toLocaleString("fr-FR")}°`, angle: 0, anchor: "middle", size: TEXT_SIZE });
      return out;
    }
    case "text":
      out.texts.push({ at: a.at, text: a.text, angle: 0, anchor: "start", size: a.size });
      return out;
    case "note":
    case "balloon": {
      const target = paperOf(a.target);
      if (!target) return out;
      const n = a.kind === "balloon" ? item(a.body) : null;
      const r = 4;
      const towards = unit(sub(target, a.at));
      out.lines.push([a.kind === "balloon" ? add(a.at, mul(towards, r)) : a.at, target]);
      out.circles.push({ center: target, radius: 0.5 });
      if (a.kind === "balloon") {
        out.circles.push({ center: a.at, radius: r });
        out.texts.push({ at: add(a.at, [0, 1.3]), text: n === null ? "?" : String(n), angle: 0, anchor: "middle", size: TEXT_SIZE });
      } else out.texts.push({ at: add(a.at, [towards[0] > 0 ? -1 : 1, -1]), text: a.text, angle: 0, anchor: towards[0] > 0 ? "end" : "start", size: TEXT_SIZE });
      return out;
    }
    default:
      return out;
  }
}
