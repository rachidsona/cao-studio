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
