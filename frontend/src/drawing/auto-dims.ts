/**
 * Cotation automatique d'une vue de la mise en plan, et cote directe d'un trait cliqué. Automatique : les cotes hors
 * tout (largeur sous la vue, son nom en dessous, hauteur à sa gauche ; au-dessus ou à droite quand une autre vue est
 * tout près de ce côté-là), les chaînes de cotes entre les niveaux des coins (de 3 à 8 niveaux, ceux à moins de 7 mm
 * l'un de l'autre sur le papier fondus : l'épaisseur d'une planche ne fait pas une cote illisible), et le diamètre de
 * chaque cercle vu de face assez grand pour être lu (un par taille). Une cote de chaîne trop courte pour ses chiffres
 * les porte au-delà d'un de ses bouts, sur le premier rang où ils ne touchent ni une autre cote ni une ligne d'attache
 * (en escalier quand plusieurs petites se suivent) ; la hors tout vient au rang d'après. Relancée sur une vue, elle
 * remplace celles qu'elle y avait posées. D'un trait : sa longueur, horizontale, verticale ou alignée selon le trait,
 * posée hors de la vue du côté le plus proche, sur le premier rang libre (jamais sur une autre cote). Pur.
 */
import { TEXT_SIZE, labelWidth } from "./annotations";
import { FIRST_SIDE, STEP_SIDE, onFreeRow } from "./arrange";
import type { SheetLayout } from "./layout";
import type { Annotation, DrawingSheet, DrawingView, Vec2 } from "./model";

type NewAnnotation = Annotation extends infer A ? (A extends Annotation ? Omit<A, "id"> : never) : never;

const GAP = 8;
/** Under the view (its name goes under the dimensions). */
const BELOW = 8;
const STEP = 7;
/** Levels nearer than this on the paper (mm) make one; circles smaller than this (paper mm) are not dimensioned. */
const MIN_LEVEL = 7;
const MIN_DIAMETER = 3;
/** Another view nearer than this (paper mm) on a side leaves no room for the dimensions there. */
const ROOM = 45;
const MAX_LEVELS = 8;
/** Rows a chain may take before its overall dimension. */
const CHAIN_ROWS = 5;

/** A dimension of a chain on its row: its line and its figures along it (paper mm). */
interface Placed {
  row: number;
  line: Vec2;
  text: Vec2;
}

const inside = (x: number, [a, b]: Vec2) => x > a + 0.3 && x < b - 0.3;
const overlap = (p: Vec2, q: Vec2) => p[0] < q[1] - 0.3 && q[0] < p[1] - 0.3;
const span = (p: Placed): Vec2 => [Math.min(p.line[0], p.text[0]), Math.max(p.line[1], p.text[1])];

/** Whether a dimension can sit there: apart from the others on its row, its figures crossed by no extension line. */
function clear(p: Placed, placed: readonly Placed[], ends: Vec2): boolean {
  if (inside(ends[0], p.text) || inside(ends[1], p.text)) return false;
  return placed.every((q) => {
    if (q.row === p.row) return !overlap(span(p), span(q));
    const [deep, high] = q.row > p.row ? [q, p] : [p, q];
    return !inside(deep.line[0], high.text) && !inside(deep.line[1], high.text);
  });
}

/**
 * The rows and text shifts of a chain (its segments along the paper, `along` the room its figures take): the ones
 * whose figures fit between their extension lines (between the arrows, or over the line) on the first row; each other
 * one past the end on the side of the nearer end of its run of short ones (then the other side), on the first row
 * where it is clear.
 */
export function chainRows(segments: { line: Vec2; along: number }[]): { row: number; shift: number }[] {
  const half = (s: { along: number }) => s.along / 2 + 0.8;
  const fits = segments.map((s) => 2 * half(s) + 1 <= s.line[1] - s.line[0]);
  const ends: Vec2 = [segments[0]?.line[0] ?? 0, segments.at(-1)?.line[1] ?? 0];
  const placed: Placed[] = [];
  const out = segments.map((s, i) => {
    const mid = (s.line[0] + s.line[1]) / 2;
    if (!fits[i]) return null;
    placed.push({ row: 0, line: s.line, text: [mid - half(s), mid + half(s)] });
    return { row: 0, shift: 0 };
  });
  segments.forEach((s, i) => {
    if (fits[i]) return;
    let [first, last] = [i, i];
    while (first > 0 && !fits[first - 1]) first--;
    while (last < segments.length - 1 && !fits[last + 1]) last++;
    const mid = (s.line[0] + s.line[1]) / 2;
    const left = mid - (s.line[0] - half(s) - 1.5);
    const right = s.line[1] + half(s) + 1.5 - mid;
    const sides = i - first <= last - i ? [-left, right] : [right, -left];
    for (const shift of sides) {
      for (let row = 0; row < CHAIN_ROWS; row++) {
        const p: Placed = { row, line: s.line, text: [mid + shift - half(s), mid + shift + half(s)] };
        if (!clear(p, placed, ends)) continue;
        placed.push(p);
        out[i] = { row, shift };
        return;
      }
    }
    // Nowhere clear: its own row, the figures over its line.
    const row = Math.max(0, ...placed.map((p) => p.row)) + 1;
    placed.push({ row, line: s.line, text: [mid - half(s), mid + half(s)] });
    out[i] = { row, shift: 0 };
  });
  return out as { row: number; shift: number }[];
}

/** Annotations made on a view by the automatic dimensioning (to be replaced when it runs again). */
export function isAutoOf(a: Annotation, view: string): boolean {
  if (a.kind === "dimension") return a.auto === true && a.a.view === view;
  if (a.kind === "diameter" || a.kind === "radius") return a.auto === true && a.view === view;
  return false;
}

/** The automatic dimensions of a view. */
export function autoDimensions(sheet: DrawingSheet, layout: SheetLayout, view: DrawingView, format: (mm: number) => string = (mm) => `${Math.round(mm)} mm`): NewAnnotation[] {
  const g = layout.geometry(sheet, view);
  if (!g.points.length) return [];
  const out: NewAnnotation[] = [];
  const [lo, hi] = layout.box(sheet, view);
  const paper = (p: Vec2) => layout.toPaper(sheet, view, p);
  const anchor = (p: Vec2) => layout.anchor(sheet, view, p);
  /** Levels of the corners along an axis (merged within 0.5 mm of the model), each with its lowest / leftmost point. */
  const levels = (axis: 0 | 1) => {
    const found = new Map<number, Vec2>();
    for (const p of g.points) {
      const key = Math.round(p[axis] * 2) / 2;
      const known = found.get(key);
      if (!known || p[1 - axis]! < known[1 - axis]!) found.set(key, p);
    }
    return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  };
  // Under the view and on its left, unless another view stands close on that side (a projected view): then over it
  // and on its right.
  const crowded = (side: "below" | "left") =>
    sheet.views.some((o) => {
      if (o.id === view.id || sheet.hiddenItems?.includes(o.id)) return false;
      const [olo, ohi] = layout.box(sheet, o);
      if (side === "below") return olo[1] >= hi[1] && olo[1] - hi[1] < ROOM && olo[0] < hi[0] && ohi[0] > lo[0];
      return ohi[0] <= lo[0] && lo[0] - ohi[0] < ROOM && olo[1] < hi[1] && ohi[1] > lo[1];
    });
  const above = crowded("below");
  const right = crowded("left");
  const shifted = (textShift: number) => (Math.abs(textShift) > 1e-6 ? { textShift } : {});
  const horizontal = (a: Vec2, b: Vec2, row: number, textShift = 0) => {
    const mid = (paper(a)[1] + paper(b)[1]) / 2;
    const line = above ? lo[1] - GAP - row * STEP : hi[1] + BELOW + row * STEP;
    out.push({ kind: "dimension", mode: "horizontal", a: anchor(a), b: anchor(b), offset: line - mid, auto: true, ...shifted(textShift) });
  };
  const vertical = (a: Vec2, b: Vec2, row: number, textShift = 0) => {
    const mid = (paper(a)[0] + paper(b)[0]) / 2;
    const line = right ? hi[0] + FIRST_SIDE + row * STEP_SIDE : lo[0] - FIRST_SIDE - row * STEP_SIDE;
    out.push({ kind: "dimension", mode: "vertical", a: anchor(a), b: anchor(b), offset: mid - line, auto: true, ...shifted(textShift) });
  };
  for (const axis of [0, 1] as const) {
    const found = levels(axis);
    if (found.length < 2) continue;
    // The ends always; between them, the levels far enough from the last one kept and from the end.
    const last = found.at(-1)!;
    const all = [found[0]!];
    for (const p of found.slice(1, -1)) if ((p[axis] - all.at(-1)![axis]) / view.scale >= MIN_LEVEL && (last[axis] - p[axis]) / view.scale >= MIN_LEVEL) all.push(p);
    all.push(last);
    const chain = all.length > 2 && all.length <= MAX_LEVELS;
    const put = axis === 0 ? horizontal : vertical;
    if (!chain) {
      put(all[0]!, all.at(-1)!, 0);
      continue;
    }
    // Along the paper: x for a horizontal chain, y (down) for a vertical one; the figures' room along the line.
    const along = (p: Vec2) => paper(p)[axis];
    const segments = all.slice(1).map((q, i) => {
      const p = all[i]!;
      const room = axis === 0 ? labelWidth(format(Math.abs(q[0] - p[0]))) : TEXT_SIZE;
      return { line: [Math.min(along(p), along(q)), Math.max(along(p), along(q))] as Vec2, along: room };
    });
    const rows = chainRows(segments);
    rows.forEach(({ row, shift }, i) => put(all[i]!, all[i + 1]!, row, shift));
    put(all[0]!, all.at(-1)!, Math.max(...rows.map((r) => r.row)) + 1);
  }
  // One diameter per size of circle, its leader up and to the right.
  const sizes = new Set<number>();
  for (const c of g.circles) {
    if ((c.radius * 2) / view.scale < MIN_DIAMETER) continue;
    const key = Math.round(c.radius * 10);
    if (sizes.has(key)) continue;
    sizes.add(key);
    out.push({ kind: "diameter", view: view.id, center: c.center, radius: c.radius, angle: 45, auto: true });
  }
  return out;
}

/** The dimension of a straight trait of a view (its two ends), placed out of the view on its nearer side. */
export function lineDimension(sheet: DrawingSheet, layout: SheetLayout, view: DrawingView, a: Vec2, b: Vec2): NewAnnotation | null {
  const [pa, pb] = [layout.toPaper(sheet, view, a), layout.toPaper(sheet, view, b)];
  const [dx, dy] = [pb[0] - pa[0], pb[1] - pa[1]];
  const length = Math.hypot(dx, dy);
  if (length < 0.2) return null;
  const mode: "horizontal" | "vertical" | "aligned" = Math.abs(dy) < 1e-3 * length ? "horizontal" : Math.abs(dx) < 1e-3 * length ? "vertical" : "aligned";
  const [lo, hi] = layout.box(sheet, view);
  const mid: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const center: Vec2 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
  let offset: number;
  if (mode === "horizontal") offset = mid[1] > center[1] ? hi[1] + BELOW - mid[1] : lo[1] - GAP - mid[1];
  else if (mode === "vertical") offset = mid[0] < center[0] ? mid[0] - (lo[0] - FIRST_SIDE) : mid[0] - (hi[0] + FIRST_SIDE);
  else {
    // Aligned: on the side of the trait away from the view's centre.
    const normal: Vec2 = [-dy / length, dx / length];
    const away = (mid[0] - center[0]) * normal[0] + (mid[1] - center[1]) * normal[1];
    offset = away >= 0 ? GAP : -GAP;
  }
  const made = { kind: "dimension" as const, mode, a: layout.anchor(sheet, view, a), b: layout.anchor(sheet, view, b), offset };
  // Out of the way of the dimensions already there: on the first free row of its side.
  return { ...made, offset: onFreeRow(sheet, layout, { ...made, id: "" }) };
}
