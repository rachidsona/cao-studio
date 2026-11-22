/**
 * Les cotes d'une Répartition dans la vue, comme sur un plan : autour du meuble, en dehors du dessin, la largeur et la
 * hauteur totales et, plus près, les chaînes des niches du bas, de gauche et de droite, et du haut quand il diffère du
 * bas (les mesures libres entre panneaux). À l'intérieur, seule une niche dont une mesure n'est dans aucune chaîne garde cette cote : le
 * dessin reste lisible et chaque largeur et chaque hauteur se lit quelque part. Des portes en vue ont leur largeur et
 * leur hauteur, et cachent les cotes intérieures. Géométrie pure : les points sont
 * [x, y, profondeur] en mm dans le repère de l'esquisse, la profondeur partant de la face tournée vers l'œil.
 */
import type { NicheBox } from "../sketcher/shelves";

export type PlanPoint = [number, number, number];
export type PlanDimLevel = "total" | "chain" | "inner" | "depth" | "door";

export interface PartitionPlan {
  /** The outline of the panels. */
  outer: NicheBox;
  /** The niches nothing divides. */
  niches: NicheBox[];
  /** The depth of the panels (0: not extruded). */
  depth: number;
  /** The height of the plinth under the bottom board (0: none). */
  plinth: number;
  /** The doors in sight: each gets its width and height, and what is behind them is not written. */
  doors?: NicheBox[];
}

export interface PlanDim {
  from: PlanPoint;
  to: PlanPoint;
  length: number;
  level: PlanDimLevel;
  /** The thin lines that bring the measured edges out to a dimension line outside the drawing. */
  witnesses: [PlanPoint, PlanPoint][];
}

type Span = [number, number];

const TOLERANCE = 1e-3;
const near = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;
const sameSpan = (a: Span, b: Span) => near(a[0], b[0]) && near(a[1], b[1]);
const hasSpan = (spans: Span[], s: Span) => spans.some((o) => sameSpan(o, s));

/** The different spans, from the lowest. */
const spansOf = (spans: Span[]): Span[] => {
  const kept: Span[] = [];
  for (const s of spans) if (!hasSpan(kept, s)) kept.push(s);
  return kept.sort((a, b) => a[0] - b[0]);
};
const sameSpans = (a: Span[], b: Span[]) => a.length === b.length && a.every((s, i) => sameSpan(s, b[i]!));

const xSpan = (b: NicheBox): Span => [b.x0, b.x1];
const ySpan = (b: NicheBox): Span => [b.y0, b.y1];

/** How far the dimension lines stand from the drawing, by its size (mm). */
export const ringGap = (outer: NicheBox): number => Math.min(Math.max(Math.max(outer.x1 - outer.x0, outer.y1 - outer.y0) * 0.05, 40), 160);

export function partitionDims(plan: PartitionPlan, gap = ringGap(plan.outer)): PlanDim[] {
  const { outer, niches } = plan;
  const dims: PlanDim[] = [];

  const horizontal = (span: Span, y: number, edge: number, level: PlanDimLevel) =>
    dims.push({
      from: [span[0], y, 0],
      to: [span[1], y, 0],
      length: span[1] - span[0],
      level,
      witnesses: level === "door" ? [] : span.map((x): [PlanPoint, PlanPoint] => [[x, edge, 0], [x, y, 0]]),
    });
  const vertical = (span: Span, x: number, edge: number, level: PlanDimLevel) =>
    dims.push({
      from: [x, span[0], 0],
      to: [x, span[1], 0],
      length: span[1] - span[0],
      level,
      witnesses: level === "door" ? [] : span.map((y): [PlanPoint, PlanPoint] => [[edge, y, 0], [x, y, 0]]),
    });

  if (niches.length) {
    const lowest = Math.min(...niches.map((n) => n.y0));
    const highest = Math.max(...niches.map((n) => n.y1));
    const leftmost = Math.min(...niches.map((n) => n.x0));
    const rightmost = Math.max(...niches.map((n) => n.x1));
    const bottom = spansOf(niches.filter((n) => near(n.y0, lowest)).map(xSpan));
    const top = spansOf(niches.filter((n) => near(n.y1, highest)).map(xSpan));
    const left = spansOf(niches.filter((n) => near(n.x0, leftmost)).map(ySpan));
    const right = spansOf(niches.filter((n) => near(n.x1, rightmost)).map(ySpan));

    // The chains: the top one and the right one only when they say something else — the same heights are not repeated.
    const topChain = !sameSpans(top, bottom);
    const rightChain = !sameSpans(right, left);
    for (const s of bottom) horizontal(s, outer.y0 - gap, outer.y0, "chain");
    for (const s of left) vertical(s, outer.x0 - gap, outer.x0, "chain");
    if (topChain) for (const s of top) horizontal(s, outer.y1 + gap, outer.y1, "chain");
    if (rightChain) for (const s of right) vertical(s, outer.x1 + gap, outer.x1, "chain");
    if (plan.plinth > 0) vertical([outer.y0, outer.y0 + plan.plinth], outer.x0 - gap, outer.x0, "chain");

    // What no chain gives, once each, outside too: a column's heights on a line of their own on its side (level with
    // its shelves), a row's widths below or above; nothing behind closed doors.
    const widths = [...bottom, ...top];
    const heights = [...left, ...right];
    const columns: Span[] = [];
    const rows: Span[] = [];
    const rings = { left: 1, right: rightChain ? 1 : 0, below: 1, above: topChain ? 1 : 0 };
    const ringOf = (lines: Span[], at: Span, side: keyof typeof rings) => {
      const k = lines.findIndex((l) => sameSpan(l, at));
      if (k >= 0) return (lines[k] as Span & { ring?: number }).ring!;
      const line = Object.assign([...at] as Span, { ring: ++rings[side] });
      lines.push(line);
      return line.ring;
    };
    const midX = (outer.x0 + outer.x1) / 2;
    const midY = (outer.y0 + outer.y1) / 2;
    for (const n of plan.doors?.length ? [] : niches) {
      if (!hasSpan(widths, xSpan(n))) {
        widths.push(xSpan(n));
        const below = n.y0 + n.y1 < 2 * midY;
        const ring = ringOf(rows, ySpan(n), below ? "below" : "above");
        horizontal(xSpan(n), below ? outer.y0 - ring * gap : outer.y1 + ring * gap, below ? outer.y0 : outer.y1, "inner");
      }
      if (!hasSpan(heights, ySpan(n))) {
        heights.push(ySpan(n));
        const onLeft = n.x0 + n.x1 < 2 * midX;
        const ring = ringOf(columns, xSpan(n), onLeft ? "left" : "right");
        vertical(ySpan(n), onLeft ? outer.x0 - ring * gap : outer.x1 + ring * gap, onLeft ? outer.x0 : outer.x1, "inner");
      }
    }
    // The totals, on the outer ring, beyond the lines added; first, so that their values are written before the others.
    horizontal([outer.x0, outer.x1], outer.y0 - (rings.below + 1) * gap, outer.y0, "total");
    vertical([outer.y0, outer.y1], outer.x0 - (rings.left + 1) * gap, outer.x0, "total");
    dims.unshift(...dims.splice(dims.length - 2, 2));
  } else {
    horizontal([outer.x0, outer.x1], outer.y0 - 2 * gap, outer.y0, "total");
    vertical([outer.y0, outer.y1], outer.x0 - 2 * gap, outer.x0, "total");
  }

  // Each door: its width near its top, its height down its middle.
  for (const d of plan.doors ?? []) {
    horizontal(xSpan(d), d.y1 - (d.y1 - d.y0) * 0.12, d.y1, "door");
    vertical(ySpan(d), (d.x0 + d.x1) / 2, d.x0, "door");
  }

  // The depth, along the lower right edge, going away from the viewer.
  if (plan.depth > 0) {
    const at: PlanPoint = [outer.x1 + gap, outer.y0 - gap, 0];
    dims.push({
      from: at,
      to: [at[0], at[1], plan.depth],
      length: plan.depth,
      level: "depth",
      witnesses: [[[outer.x1, outer.y0, 0], at], [[outer.x1, outer.y0, plan.depth], [at[0], at[1], plan.depth]]],
    });
  }
  return dims;
}

/** A number short enough for the view: one decimal (none in mm, three in m), with its comma. */
export function shortValue(displayed: number, digits: number): string {
  return Number(displayed.toFixed(digits)).toLocaleString("fr-FR", { maximumFractionDigits: digits, useGrouping: false });
}
