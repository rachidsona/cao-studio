/**
 * « Jusqu'au corps voisin » de Tirer une face : la distance dont une face plane, tournée selon un axe, avance avant de
 * toucher le premier autre corps devant elle — un corps dont la boîte est en face d'elle (elles se recouvrent dans les
 * deux autres sens). Une planche tirée jusqu'au côté du caisson, un dessus jusqu'au mur. Pur.
 */
import type { Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

/** The gap in front of the face (its box, its outward normal), or null: no body there, or a slanted face. */
export function gapAlong(face: Box, normal: Vec3, others: readonly Box[]): number | null {
  const axis = [0, 1, 2].reduce((m, k) => (Math.abs(normal[k]!) > Math.abs(normal[m]!) ? k : m), 0);
  if (Math.abs(normal[axis]!) < 0.999) return null;
  const forward = normal[axis]! > 0;
  const plane = forward ? face[1][axis]! : face[0][axis]!;
  let best: number | null = null;
  for (const box of others) {
    // In front of the face: the boxes overlap across the axis (touching edges do not count).
    const facing = [0, 1, 2].every((i) => i === axis || Math.min(face[1][i]!, box[1][i]!) - Math.max(face[0][i]!, box[0][i]!) > 1e-6);
    if (!facing) continue;
    const gap = forward ? box[0][axis]! - plane : plane - box[1][axis]!;
    if (gap > 1e-6 && (best === null || gap < best)) best = gap;
  }
  return best === null ? null : Number(best.toFixed(4));
}
