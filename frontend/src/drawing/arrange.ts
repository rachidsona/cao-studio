/**
 * Ranger les cotes comme dans Fusion. En glissant une cote : sa ligne s'accroche à celle d'une autre cote parallèle
 * (elles s'alignent) ou aux rangs réguliers autour de la vue (tous les 7 mm), avec un guide en tirets ; son texte
 * glisse le long de la ligne et revient au milieu près du centre. « Réorganiser » : les cotes horizontales et
 * verticales de chaque vue rangées de chaque côté, la plus courte près de la vue, celles qui ne se chevauchent pas
 * (une chaîne, bout à bout) sur un même rang, sans croisement, textes recentrés. Pur.
 */
import type { SheetLayout } from "./layout";
import type { Annotation, DrawingSheet, Vec2 } from "./model";

type Dimension = Annotation & { kind: "dimension" };

/** Room between the view and the first row (its name goes under its dimensions), then between rows (paper mm). */
const FIRST = 8;
const BELOW = 8;
const STEP = 7;
/** Beside a view (vertical dimensions, their figures written level): rows a number's width apart, half of it first. */
export const FIRST_SIDE = 11;
export const STEP_SIDE = 24;
/** The first row and the spacing of the rows for a dimension's direction and side. */
export function rowsOf(mode: string, below: boolean): { first: number; step: number } {
  if (mode === "vertical") return { first: FIRST_SIDE, step: STEP_SIDE };
  return { first: mode === "horizontal" && below ? BELOW : FIRST, step: STEP };
}
const SNAP = 1.5;
const ROWS = 5;

/** Where a dimension lies on the paper: its direction, the middle of its points, their span along it, its line across. */
export function dimensionFrame(sheet: DrawingSheet, layout: SheetLayout, a: Dimension) {
  const paperOf = (anchor: Dimension["a"]) => {
    const view = sheet.views.find((v) => v.id === anchor.view);
    const p = layout.resolve(sheet, anchor);
    return view && p ? layout.toPaper(sheet, view, p) : null;
  };
  const [pa, pb] = [paperOf(a.a), paperOf(a.b)];
  if (!pa || !pb) return null;
  const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
  const dir: Vec2 = a.mode === "horizontal" ? [1, 0] : a.mode === "vertical" ? [0, 1] : [(pb[0] - pa[0]) / length, (pb[1] - pa[1]) / length];
  const normal: Vec2 = [-dir[1], dir[0]];
  const mid: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const along = (p: Vec2) => p[0] * dir[0] + p[1] * dir[1];
  const across = (p: Vec2) => p[0] * normal[0] + p[1] * normal[1];
  const span: Vec2 = [Math.min(along(pa), along(pb)), Math.max(along(pa), along(pb))];
  return { dir, normal, mid, span, line: across(mid) + a.offset, across, along };
}

/** The rows around a view a dimension of this direction may sit on (their position across it). */
function rows(sheet: DrawingSheet, layout: SheetLayout, viewId: string, frame: NonNullable<ReturnType<typeof dimensionFrame>>): number[] {
  const view = sheet.views.find((v) => v.id === viewId);
  if (!view) return [];
  const [lo, hi] = layout.box(sheet, view);
  const ends = [frame.across(lo), frame.across(hi), frame.across([lo[0], hi[1]]), frame.across([hi[0], lo[1]])];
  const [near, far] = [Math.min(...ends), Math.max(...ends)];
  // Under a view (horizontal dimension, normal pointing down) the first row clears the view's name.
  const vertical = Math.abs(frame.normal[0]) > 0.5;
  const [after, before] = [rowsOf(vertical ? "vertical" : "horizontal", frame.normal[1] > 0.5), rowsOf(vertical ? "vertical" : "horizontal", false)];
  return Array.from({ length: ROWS }, (_, k) => [far + after.first + k * after.step, near - before.first - k * before.step]).flat();
}

/**
 * A dimension being dragged, snapped: its line onto the line of a parallel dimension or onto a row around its view,
 * its text back to the middle; with the guides to draw (paper segments).
 */
export function snapDimension(sheet: DrawingSheet, layout: SheetLayout, a: Dimension): { offset: number; textShift: number; guides: [Vec2, Vec2][] } {
  const frame = dimensionFrame(sheet, layout, a);
  let { offset } = a;
  let textShift = a.textShift ?? 0;
  const guides: [Vec2, Vec2][] = [];
  if (!frame) return { offset, textShift, guides };
  const point = (along: number, across: number): Vec2 => [frame.dir[0] * along + frame.normal[0] * across, frame.dir[1] * along + frame.normal[1] * across];
  // Parallel dimensions first (alignment), then the rows of the view.
  let best: { line: number; from: number; to: number; d: number } | null = null;
  for (const other of sheet.annotations) {
    if (other.kind !== "dimension" || other.id === a.id || other.mode !== a.mode || a.mode === "aligned") continue;
    const f = dimensionFrame(sheet, layout, other);
    if (!f) continue;
    const d = Math.abs(f.line - frame.line);
    if (d < SNAP && (!best || d < best.d)) best = { line: f.line, from: Math.min(f.span[0], frame.span[0]) - 4, to: Math.max(f.span[1], frame.span[1]) + 4, d };
  }
  if (!best && a.a.view === a.b.view && a.mode !== "aligned") {
    for (const line of rows(sheet, layout, a.a.view, frame)) {
      const d = Math.abs(line - frame.line);
      if (d < SNAP && (!best || d < best.d)) best = { line, from: frame.span[0] - 6, to: frame.span[1] + 6, d };
    }
  }
  if (best) {
    offset += best.line - frame.line;
    guides.push([point(best.from, best.line), point(best.to, best.line)]);
  }
  if (Math.abs(textShift) < SNAP) textShift = 0;
  return { offset, textShift, guides };
}

/**
 * A new dimension of a view moved out to the first free row on its side: no parallel dimension there whose span
 * overlaps its own (end to end is fine). Aligned dimensions, and those of two views, stay where they are.
 */
export function onFreeRow(sheet: DrawingSheet, layout: SheetLayout, a: Dimension): number {
  const frame = dimensionFrame(sheet, layout, a);
  const view = sheet.views.find((v) => v.id === a.a.view);
  if (!frame || !view || a.mode === "aligned" || a.a.view !== a.b.view) return a.offset;
  const [lo, hi] = layout.box(sheet, view);
  const center: Vec2 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  const outward = frame.line > frame.across(center) ? 1 : -1;
  const edge = Math.max(...[lo, hi, [lo[0], hi[1]] as Vec2, [hi[0], lo[1]] as Vec2].map((p) => outward * frame.across(p)));
  const { first, step } = rowsOf(a.mode, outward > 0);
  const others = sheet.annotations.flatMap((o) => (o.kind === "dimension" && o.mode === a.mode && o.id !== a.id ? [dimensionFrame(sheet, layout, o)] : [])).filter((f) => f !== null);
  for (let row = 0; row < 20; row++) {
    const line = outward * (edge + first + row * step);
    const busy = others.some((f) => Math.abs(f.line - line) < step / 2 && f.span[0] < frame.span[1] - 0.5 && f.span[1] > frame.span[0] + 0.5);
    if (!busy) return line - frame.across(frame.mid);
  }
  return a.offset;
}

/**
 * A dimension of a view moved to one side of it — `outward` +1: below (horizontal) or left (vertical), the side its
 * line's normal points to; −1: above or right — on the first free row there.
 */
export function onSide(sheet: DrawingSheet, layout: SheetLayout, a: Dimension, outward: 1 | -1): number {
  const frame = dimensionFrame(sheet, layout, a);
  const view = sheet.views.find((v) => v.id === a.a.view);
  if (!frame || !view || a.mode === "aligned") return a.offset;
  const [lo, hi] = layout.box(sheet, view);
  const edge = Math.max(...[lo, hi, [lo[0], hi[1]] as Vec2, [hi[0], lo[1]] as Vec2].map((p) => outward * frame.across(p)));
  const line = outward * (edge + rowsOf(a.mode, outward > 0).first);
  return onFreeRow(sheet, layout, { ...a, offset: line - frame.across(frame.mid) });
}

/** Which side of its view a dimension is on (+1: below or left, −1: above or right). */
export function sideOf(sheet: DrawingSheet, layout: SheetLayout, a: Dimension): 1 | -1 {
  const frame = dimensionFrame(sheet, layout, a);
  const view = sheet.views.find((v) => v.id === a.a.view);
  if (!frame || !view) return 1;
  const [lo, hi] = layout.box(sheet, view);
  return frame.line > frame.across([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]) ? 1 : -1;
}

/**
 * The dimensions of these views (all when none) put in order around them: on each side, the shortest nearest, those
 * that do not overlap sharing a row, the longer ones further out; texts back in the middle.
 */
export function arrangeDimensions(sheet: DrawingSheet, layout: SheetLayout, viewIds: string[] = []): DrawingSheet {
  const views = sheet.views.filter((v) => !viewIds.length || viewIds.includes(v.id));
  const placed = new Map<string, number>();
  for (const view of views) {
    const [lo, hi] = layout.box(sheet, view);
    const center: Vec2 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    const mine = sheet.annotations.filter((a): a is Dimension => a.kind === "dimension" && a.mode !== "aligned" && a.a.view === view.id && a.b.view === view.id);
    // Each side of the view: under or over it (horizontal), left or right of it (vertical).
    const sides = new Map<string, { a: Dimension; frame: NonNullable<ReturnType<typeof dimensionFrame>> }[]>();
    for (const a of mine) {
      const frame = dimensionFrame(sheet, layout, a);
      if (!frame) continue;
      const key = `${a.mode}:${frame.line > frame.across(center) ? "+" : "-"}`;
      sides.set(key, [...(sides.get(key) ?? []), { a, frame }]);
    }
    for (const [key, list] of sides) {
      const outward = key.endsWith("+") ? 1 : -1;
      const edge = Math.max(...[lo, hi, [lo[0], hi[1]] as Vec2, [hi[0], lo[1]] as Vec2].map((p) => outward * list[0]!.frame.across(p)));
      const { first, step } = rowsOf(list[0]!.a.mode, outward > 0);
      const taken: Vec2[][] = [];
      for (const { a, frame } of [...list].sort((x, y) => x.frame.span[1] - x.frame.span[0] - (y.frame.span[1] - y.frame.span[0]))) {
        // End to end (a chain) is no overlap: they share the row.
        let row = taken.findIndex((spans) => spans.every((s) => frame.span[0] >= s[1] - 0.5 || frame.span[1] <= s[0] + 0.5));
        if (row < 0) row = taken.push([]) - 1;
        taken[row]!.push(frame.span);
        const line = outward * (edge + first + row * step);
        placed.set(a.id, line - frame.across(frame.mid));
      }
    }
  }
  return {
    ...sheet,
    annotations: sheet.annotations.map((a) => (a.kind === "dimension" && placed.has(a.id) ? { ...a, offset: placed.get(a.id)!, textShift: undefined } : a)),
  };
}
