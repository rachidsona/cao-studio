/**
 * « Répartition »: a rectangle (a cabinet front, height × length) divided into N cases of the same width, one per
 * door, by vertical dividers drawn with their thickness (two lines each). A divider is simple (one panel) or double
 * (two panels back to back, where two modules meet); by default:
 *   2 cases: a simple one;
 *   3 cases: a simple and a double (the double on the right or on the left);
 *   4 cases: simple, double, simple (the double in the middle);
 *   5 cases: simple, double, double, simple (the doubles in the middle);
 * and each one can be set by hand; a divider can also be left out (« sans côté »): its two cases make one niche, as
 * wide as both plus the side that is not there (the cases keep the widths they would have with it). The cases share the free length equally, or in proportions given for each one
 * (« 1, 2 »: the second twice as wide as the first). The outer sides, the top and the bottom are panels too; the bottom can be raised, which
 * leaves a plinth under it (an option). Where a side meets the top or the bottom, it is chosen which runs through: the board across the full
 * length (the side stops against it), or the side over the full height (the board stops against it, so it is cut in
 * pieces). That is chosen for the outer sides, the simple dividers and the double ones: by default the doubles run
 * through and cut the top and the bottom. The outer sides can also be joined « d'onglet » (mitred): the side and the
 * board meet along the 45° diagonal of the corner, at the top, and at the bottom when there is no plinth (with one,
 * the side goes down to the floor and the bottom stops against it). The result is a sketch whose every panel and every case is a closed area,
 * ready to extrude. Pure: lengths in mm, the sketch in its own coordinates (x along the length, y along the height).
 */
import type { DividerKind, OuterPass, PartitionParams, Pass, SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { formatLength } from "../measurements/units";
import { cloneGeometry, nextId } from "./edit";

export type { DividerKind, OuterPass, Pass };
export type PartitionInput = PartitionParams;

export interface PartitionLayout {
  /** Width of the first case (mm): of each case, when they are equal. */
  caseWidth: number;
  /** Width of each case, from the left (mm). */
  caseWidths: number[];
  /** Every panel and board as a rectangle [x0, y0, x1, y1]. */
  panels: [number, number, number, number][];
  /** What each panel is, in the same order. */
  kinds: ("side" | "bottom" | "top")[];
  /** Where each case is: [x0, x1]. */
  caseSpans: [number, number][];
  /** The height of a case: from the top of the bottom board to the underside of the top one. */
  inner: [number, number];
  /** Mitred corners: the diagonal from the outer corner to the inner one, where the side and the board meet. */
  miters: [[number, number], [number, number]][];
}

export const MAX_CASES = 12;

/** The dividers of N cases, from left to right (see the header for what each count gives). */
export function defaultDividers(cases: number, doubleOn: "left" | "right" = "right"): DividerKind[] {
  const k = Math.max(0, cases - 1);
  if (k === 2) return doubleOn === "left" ? ["double", "single"] : ["single", "double"];
  if (k === 4) return ["single", "double", "double", "single"];
  // Alternating, a simple one at each end when there is an odd number of them.
  return Array.from({ length: k }, (_, i): DividerKind => (i % 2 === 0 ? "single" : "double"));
}

const round = (v: number) => Number(v.toFixed(6));

/** The layout, or the reason it is impossible. */
export function partitionLayout(input: PartitionInput): PartitionLayout | string {
  const { length, height, thickness: e, cases, dividers, boards } = input;
  if (![length, height, e].every((v) => Number.isFinite(v) && v > 0)) return "Donnez une hauteur, une longueur et une épaisseur positives.";
  if (!Number.isInteger(cases) || cases < 2 || cases > MAX_CASES) return `Le nombre de cases va de 2 à ${MAX_CASES}.`;
  if (dividers.length !== cases - 1) return "Il faut un côté entre chaque case.";
  const plinth = boards ? input.plinth : 0;
  if (!Number.isFinite(plinth) || plinth < 0) return "Le socle ne peut pas être négatif.";
  // The bottom board is [plinth, base]: its top is where the sides that stop against it start.
  const base = boards ? plinth + e : 0;
  const fixed = 2 * e + dividers.reduce((sum, kind) => sum + (kind === "double" ? 2 * e : e), 0);
  if (length - fixed <= 1e-6) return `La longueur est trop petite pour ${cases} cases : il faut plus de ${round(fixed)} mm rien que pour les côtés.`;
  const shares = caseShares(input);
  if (typeof shares === "string") return shares;
  const total = shares.reduce((sum, w) => sum + w, 0);
  const caseWidths = shares.map((w) => ((length - fixed) * w) / total);
  const top = boards ? height - e : height;
  if (top - base <= 1e-6) return "La hauteur est trop petite pour le dessus, le dessous et le socle.";

  // The side panels, left to right, with what they are: they go the full height, or between the boards.
  // A mitred side is laid out as one that runs through; the corners are then cut along their diagonal.
  const outer: Pass = input.outer === "miter" ? "side" : input.outer;
  const sides: { x0: number; x1: number; pass: Pass }[] = [{ x0: 0, x1: e, pass: outer }];
  const caseSpans: [number, number][] = [];
  let x = e;
  // After a divider left out, the next case goes on the niche before it.
  let joined = false;
  for (let i = 0; i < cases; i++) {
    const caseWidth = caseWidths[i] as number;
    const last = caseSpans[caseSpans.length - 1];
    if (joined && last) last[1] = round(x + caseWidth);
    else caseSpans.push([round(x), round(x + caseWidth)]);
    x += caseWidth;
    const kind = dividers[i];
    joined = false;
    if (!kind) continue;
    if (kind === "none") {
      // No panel: its place joins the niche.
      x += e;
      joined = true;
      continue;
    }
    for (let k = 0; k < (kind === "double" ? 2 : 1); k++) {
      sides.push({ x0: round(x), x1: round(x + e), pass: kind === "double" ? input.double : input.single });
      x += e;
    }
  }
  sides.push({ x0: round(length - e), x1: length, pass: outer });

  const panels: [number, number, number, number][] = [];
  const kinds: PartitionLayout["kinds"] = [];
  const full = (pass: Pass) => !boards || pass === "side";
  for (const s of sides) {
    panels.push(full(s.pass) ? [s.x0, 0, s.x1, height] : [s.x0, base, s.x1, input.openTop ? height : top]);
    kinds.push("side");
  }
  if (boards) {
    // The boards run between the sides that go the full height: they are cut there.
    let start = 0;
    const cuts = sides.filter((s) => s.pass === "side").sort((a, b) => a.x0 - b.x0);
    for (const cut of [...cuts, { x0: length, x1: length, pass: "side" as Pass }]) {
      if (cut.x0 - start > 1e-6) {
        panels.push([start, round(plinth), round(cut.x0), round(base)]);
        kinds.push("bottom");
        if (!input.openTop) {
          panels.push([start, top, round(cut.x0), height]);
          kinds.push("top");
        }
      }
      start = cut.x1;
    }
  }
  const miters: PartitionLayout["miters"] = [];
  if (boards && input.outer === "miter") {
    for (const [corner, inside] of [[0, e], [length, round(length - e)]] as const) {
      miters.push([[corner, height], [inside, top]]);
      if (plinth === 0) miters.push([[corner, 0], [inside, base]]);
    }
  }
  return { caseWidth: round(caseWidths[0] as number), caseWidths: caseWidths.map(round), panels, kinds, caseSpans, inner: [round(base), round(top)], miters };
}

/** The share of each case: the proportions given (one per case, positive), else all equal; or why they are wrong. */
function caseShares(input: PartitionInput): number[] | string {
  const { widths, cases } = input;
  if (!widths) return Array.from({ length: cases }, () => 1);
  if (widths.length !== cases) return "Il faut une proportion par case.";
  if (!widths.every((w) => Number.isFinite(w) && w > 0)) return "Les proportions des cases doivent être positives.";
  return widths;
}

/**
 * The elements to extrude, each its own body: the bottom, the top (numbered when the sides cut them in pieces), then
 * the sides left to right (« Côté », numbered when added). `origin` moves their points like the partition.
 */
export function partitionElements(layout: PartitionLayout, origin: [number, number] = [0, 0]): { probe: [number, number]; name: string; numbered?: boolean }[] {
  const items = layout.panels.map((rect, i) => ({ rect, kind: layout.kinds[i]! }));
  const probe = (r: [number, number, number, number]): [number, number] => [(r[0] + r[2]) / 2 + origin[0], (r[1] + r[3]) / 2 + origin[1]];
  const out: { probe: [number, number]; name: string; numbered?: boolean }[] = [];
  for (const [kind, label] of [["bottom", "Dessous"], ["top", "Dessus"]] as const) {
    const pieces = items.filter((it) => it.kind === kind).sort((a, b) => a.rect[0] - b.rect[0]);
    pieces.forEach((it, i) => out.push({ probe: probe(it.rect), name: pieces.length > 1 ? `${label} ${i + 1}` : label }));
  }
  for (const it of items.filter((x) => x.kind === "side").sort((a, b) => a.rect[0] - b.rect[0])) out.push({ probe: probe(it.rect), name: "Côté", numbered: true });
  return out;
}

/**
 * The sketch: the outline and the edges of every panel, cut where they meet (the lines share their points), so that
 * each panel and each case is a closed area.
 */
export function partitionGeometry(input: PartitionInput, layout: PartitionLayout): SketchGeometry {
  const rects: [number, number, number, number][] = [[0, 0, input.length, input.height], ...layout.panels];
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const segments = new Map<string, [number, number, number, number]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const [a, b]: [[number, number], [number, number]] = x0 < x1 || (x0 === x1 && y0 < y1) ? [[x0, y0], [x1, y1]] : [[x1, y1], [x0, y0]];
    segments.set(`${a}|${b}`, [a[0], a[1], b[0], b[1]]);
  };
  for (const [x0, y0, x1, y1] of rects) {
    const cutX = xs.filter((x) => x >= x0 && x <= x1);
    const cutY = ys.filter((y) => y >= y0 && y <= y1);
    for (let i = 1; i < cutX.length; i++) for (const y of [y0, y1]) add(cutX[i - 1]!, y, cutX[i]!, y);
    for (let i = 1; i < cutY.length; i++) for (const x of [x0, x1]) add(x, cutY[i - 1]!, x, cutY[i]!);
  }
  // A mitred corner: the line between the side and the board's end gives way to the diagonal.
  for (const [[cx, cy], [ix, iy]] of layout.miters) {
    const [low, high] = [Math.min(cy, iy), Math.max(cy, iy)];
    for (const [key, [x0, y0, x1, y1]] of [...segments]) if (x0 === ix && x1 === ix && y0 >= low - 1e-9 && y1 <= high + 1e-9) segments.delete(key);
    add(cx, cy, ix, iy);
  }
  const points: SketchGeometry["points"] = [];
  const ids = new Map<string, string>();
  const point = (x: number, y: number): string => {
    const key = `${x}|${y}`;
    let id = ids.get(key);
    if (!id) {
      id = `p${points.length + 1}`;
      ids.set(key, id);
      points.push({ id, x, y });
    }
    return id;
  };
  // Left to right, bottom to top: the numbering does not depend on the order the panels were listed in.
  const ordered = [...segments.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const curves = ordered.map(([x0, y0, x1, y1], i): SketchGeometry["curves"][number] => ({ id: `l${i + 1}`, kind: "line", p1: point(x0, y0), p2: point(x1, y1) }));
  return { points, curves, constraints: [] };
}

/**
 * The partition added to a sketch, its lower-left corner at `origin` (mm). The sketch keeps what it has; the lines of
 * the partition get new ids and are tied together by their own points, so every panel and case is a closed area.
 */
export function addPartition(base: SketchGeometry, partition: SketchGeometry, origin: [number, number] = [0, 0]): SketchGeometry {
  const g = cloneGeometry(base);
  const ids = new Map<string, string>();
  for (const p of partition.points) {
    const id = nextId(g, "p");
    ids.set(p.id, id);
    g.points.push({ id, x: round(p.x + origin[0]), y: round(p.y + origin[1]) });
  }
  for (const c of partition.curves) {
    if (c.kind !== "line") continue;
    g.curves.push({ id: nextId(g, "l"), kind: "line", p1: ids.get(c.p1)!, p2: ids.get(c.p2)! });
  }
  return g;
}

export const KIND_NAMES: Record<DividerKind, string> = { single: "simple", double: "double", none: "sans" };

/** « 3 cases de 57 cm », or « 2 cases de 57 cm et 114 cm » when they differ. */
export function casesText(layout: PartitionLayout, unit: DisplayUnit): string {
  const widths = layout.caseWidths;
  const equal = widths.every((w) => Math.abs(w - (widths[0] as number)) < 1e-6);
  if (equal) return `${widths.length} cases de ${formatLength(widths[0] as number, unit)}`;
  const shown = widths.map((w) => formatLength(w, unit));
  return `${widths.length} cases de ${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}`;
}
