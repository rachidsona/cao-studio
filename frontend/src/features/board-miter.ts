/**
 * « Séparer les côtés » en onglet d'un cadre plat fait de pièces d'équerre (un cadre en U de façade, un cadre de
 * porte) : à chaque angle en L — le bout d'une pièce posé contre le flanc d'une autre, leurs bords extérieurs alignés —,
 * la case du coin est partagée sur sa diagonale, du coin extérieur au coin intérieur, la moitié à chacune (à 45° pour
 * deux pièces de même largeur). Pur : des boîtes données, des contours rendus dans le plan du cadre.
 */
import type { Axis, Box } from "./board-split";

type P2 = [number, number];
/** A rectangle of the frame's plane: its low and high corners. */
type Rect = { lo: P2; hi: P2 };

export interface MiterOutlines {
  /** The axis through the frame (its thickness), and where it is along it. */
  axis: Axis;
  span: [number, number];
  /** The two axes of its plane, in the order of the outlines' points. */
  plane: [Axis, Axis];
  /** Each piece's outline, in the order of the boxes. */
  outlines: P2[][];
}

const EPS = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
const same = (a: P2, b: P2) => near(a[0], b[0]) && near(a[1], b[1]);

/** `o` put between the consecutive points `a` and `b` of the outline (either way round). */
function insert(outline: P2[], a: P2, b: P2, o: P2): boolean {
  for (let i = 0; i < outline.length; i++) {
    const [u, v] = [outline[i]!, outline[(i + 1) % outline.length]!];
    if ((same(u, a) && same(v, b)) || (same(u, b) && same(v, a))) {
      outline.splice(i + 1, 0, o);
      return true;
    }
  }
  return false;
}

/**
 * The outlines of the pieces mitred at their corners; null: not a flat frame, or no corner to mitre. `keep`: the
 * corners mitred, by their outer point and the frame's plane (the others stay as the boxes are).
 */
export function miterOutlines(boxes: readonly Box[], keep: (outer: P2, plane: [Axis, Axis]) => boolean = () => true): MiterOutlines | null {
  const thin = ([lo, hi]: Box) => ([0, 1, 2] as const).reduce((best, k) => (hi[k]! - lo[k]! < hi[best]! - lo[best]! ? k : best), 0 as Axis);
  const axis = thin(boxes[0]!);
  const [t0, t1] = [boxes[0]![0][axis]!, boxes[0]![1][axis]!];
  if (!boxes.every((b) => thin(b) === axis && near(b[0][axis]!, t0) && near(b[1][axis]!, t1))) return null;
  const plane = ([0, 1, 2] as const).filter((k) => k !== axis) as [Axis, Axis];
  const rects: Rect[] = boxes.map(([lo, hi]) => ({ lo: [lo[plane[0]]!, lo[plane[1]]!], hi: [hi[plane[0]]!, hi[plane[1]]!] }));
  // The corners: piece A's end against piece B's side, at B's end (an L, not a T).
  type Corner = { a: number; b: number; i: P2; p: P2; o: P2; q: P2; m: 0 | 1; low: boolean };
  const corners: Corner[] = [];
  rects.forEach((A, a) => rects.forEach((B, b) => {
    if (a === b) return;
    for (const k of [0, 1] as const) {
      const m = (1 - k) as 0 | 1;
      for (const s of [-1, 1]) {
        const edge = s < 0 ? A.lo[k] : A.hi[k];
        if (!near(edge, s < 0 ? B.hi[k] : B.lo[k])) continue;
        if (A.lo[m] < B.lo[m] - EPS || A.hi[m] > B.hi[m] + EPS) continue;
        // A's end, not its side: it is narrower across than along.
        if (A.hi[m] - A.lo[m] >= A.hi[k] - A.lo[k]) continue;
        const low = near(A.lo[m], B.lo[m]);
        if (!low && !near(A.hi[m], B.hi[m])) continue;
        const far = s < 0 ? B.lo[k] : B.hi[k];
        const [end, inner] = low ? [A.lo[m], A.hi[m]] : [A.hi[m], A.lo[m]];
        const at = (kv: number, mv: number): P2 => (k === 0 ? [kv, mv] : [mv, kv]);
        if (keep(at(far, end), plane)) corners.push({ a, b, i: at(edge, inner), p: at(edge, end), o: at(far, end), q: at(far, inner), m, low });
      }
    }
  }));
  if (!corners.length) return null;
  // B gives up its corner square, then each takes its half of it.
  const shrunk = rects.map((r) => ({ lo: [...r.lo] as P2, hi: [...r.hi] as P2 }));
  for (const c of corners) {
    const r = shrunk[c.b]!;
    const inner = c.i[c.m];
    if (c.low) r.lo[c.m] = inner;
    else r.hi[c.m] = inner;
  }
  const outlines = shrunk.map(({ lo, hi }): P2[] => [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]);
  for (const c of corners) {
    if (!insert(outlines[c.a]!, c.p, c.i, c.o) || !insert(outlines[c.b]!, c.i, c.q, c.o)) return null;
  }
  return { axis, span: [t0, t1], plane, outlines };
}
