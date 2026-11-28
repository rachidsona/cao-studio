/**
 * L'accrochage intelligent dans le modèle (comme celui de l'esquisse, d'après Vectric Aspire), en géométrie pure :
 * - un point pris sur une face s'aligne sur les coins des corps (le même X, Y ou Z, sur les axes de la face) ;
 * - un corps tiré par une flèche de « Déplacer » s'arrête quand une de ses faces (ou son milieu) arrive au niveau
 *   d'une face (ou du milieu) d'un autre corps : au ras, ou face contre face.
 * Chaque alignement donne un guide en tirets : du point (ou du corps) aligné à celui qu'on place.
 */
import type { Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];
export type Guide = [Vec3, Vec3];

/** On the axes lying in the face (all three without a face), the coordinates of the nearest corners within `tolerance`. */
export function alignPoint(p: Vec3, normal: Vec3 | null, refs: readonly Vec3[], tolerance: number): { pos: Vec3; guides: Guide[] } {
  const pos: Vec3 = [...p];
  const found: (Vec3 | null)[] = [null, null, null];
  for (const i of [0, 1, 2]) {
    if (normal && Math.abs(normal[i]!) > 1e-6) continue;
    let best = tolerance;
    for (const q of refs) {
      const d = Math.abs(q[i]! - p[i]!);
      // The nearer corner when two are as near.
      if (d < best - 1e-9 || (found[i] && Math.abs(d - best) <= 1e-9 && distance(q, p) < distance(found[i]!, p))) [best, found[i]] = [d, q];
    }
    if (found[i]) pos[i] = found[i]![i]!;
  }
  const guides = found.filter((q): q is Vec3 => !!q && distance(q, pos) > 1e-6).map((q): Guide => [q, pos]);
  return { pos, guides };
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const levels = ([min, max]: Box, i: number) => [min[i]!, max[i]!, (min[i]! + max[i]!) / 2];

/**
 * A box moved by `translate`, held on the axes it is dragged along where one of its levels (its two faces, its middle)
 * meets a level of another box within `tolerance` (faces before middles when as near).
 */
export function alignBox(box: Box, others: readonly Box[], translate: Vec3, axes: readonly number[], tolerance: number): { translate: Vec3; guides: Guide[] } {
  const t: Vec3 = [...translate];
  const hits: { axis: number; level: number; other: Box }[] = [];
  for (const i of axes) {
    let best: { shift: number; rank: number; level: number; other: Box } | null = null;
    for (const other of others) {
      const theirs = levels(other, i);
      levels(box, i).forEach((mine, k) => {
        theirs.forEach((level, m) => {
          const shift = level - (mine + translate[i]!);
          const rank = Math.abs(shift) + (k === 2 || m === 2 ? 1e-6 : 0);
          if (Math.abs(shift) <= tolerance && (!best || rank < best.rank)) best = { shift, rank, level, other };
        });
      });
    }
    if (best) {
      const b = best as { shift: number; level: number; other: Box };
      t[i] = translate[i]! + b.shift;
      hits.push({ axis: i, level: b.level, other: b.other });
    }
  }
  // From the middle of the moved box to the middle of the other one, both in the plane where they meet; side by side
  // (the same middles), across the other box in that plane.
  const middle = ([min, max]: Box, shift: Vec3): Vec3 => [0, 1, 2].map((k) => (min[k]! + max[k]!) / 2 + shift[k]!) as Vec3;
  const guides = hits.map(({ axis, level, other }): Guide => {
    const a = middle(box, t);
    const b = middle(other, [0, 0, 0]);
    a[axis] = level;
    b[axis] = level;
    if (distance(a, b) > 1e-6) return [a, b];
    const across = (axis + 1) % 3;
    a[across] = other[0][across]!;
    b[across] = other[1][across]!;
    return [a, b];
  });
  return { translate: t, guides };
}

/**
 * The free room along `axis` round a box moved by `translate`: from the nearest face of the boxes wholly before it to
 * that of those wholly after it, among those it meets across and in height (±Infinity: nothing on that side).
 */
export function roomAlong(box: Box, others: readonly Box[], translate: Vec3, axis: number): [number, number] {
  const [min, max] = [box[0].map((v, k) => v + translate[k]!), box[1].map((v, k) => v + translate[k]!)];
  const meets = (o: Box) => [1 - axis, 2].every((k) => o[0][k]! < max[k]! - 1 && o[1][k]! > min[k]! + 1);
  let [lo, hi] = [-Infinity, Infinity];
  for (const o of others.filter(meets)) {
    if (o[1][axis]! <= min[axis]! + 1) lo = Math.max(lo, o[1][axis]!);
    else if (o[0][axis]! >= max[axis]! - 1) hi = Math.min(hi, o[0][axis]!);
  }
  return [lo, hi];
}

/** The box held in the middle of its free room along `axis` when it comes within `tolerance` of it; else null. */
export function middleOfRoom(box: Box, others: readonly Box[], translate: Vec3, axis: number, tolerance: number): { translate: Vec3; guides: Guide[] } | null {
  const [lo, hi] = roomAlong(box, others, translate, axis);
  const width = box[1][axis]! - box[0][axis]!;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo <= width + 1) return null;
  const shift = (lo + hi) / 2 - (box[0][axis]! + box[1][axis]!) / 2;
  if (Math.abs(shift - translate[axis]!) > tolerance) return null;
  const t: Vec3 = [...translate];
  t[axis] = shift;
  // From each side of the room to the box, at its middle across and in height.
  const at = (v: number): Vec3 => [0, 1, 2].map((k) => (k === axis ? v : (box[0][k]! + box[1][k]!) / 2 + t[k]!)) as Vec3;
  return { translate: t, guides: [[at(lo), at(box[0][axis]! + shift)], [at(box[1][axis]! + shift), at(hi)]] };
}

/**
 * The end of a box along `axis` on the side `sign` (+1: its max face) pulled out by `by` mm (negative: in): held on a
 * face or a middle of another box within `tolerance`, never beyond the first box past it. How far, and the guides.
 */
export function pulledEdge(box: Box, others: readonly Box[], axis: number, sign: 1 | -1, by: number, tolerance: number): { by: number; guides: Guide[] } {
  const edge = sign > 0 ? box[1][axis]! : box[0][axis]!;
  const [lo, hi] = roomAlong(box, others, [0, 0, 0], axis);
  const thin: Box = [[...box[0]], [...box[1]]];
  thin[0][axis] = thin[1][axis] = edge;
  const t: Vec3 = [0, 0, 0];
  t[axis] = sign * by;
  const held = alignBox(thin, others, t, [axis], tolerance);
  const limit = sign > 0 ? hi - edge : edge - lo;
  const d = sign * held.translate[axis]!;
  return d > limit ? { by: limit, guides: [] } : { by: d, guides: held.guides };
}
