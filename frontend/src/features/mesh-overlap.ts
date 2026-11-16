/**
 * Deux pièces façonnées (un congé, une encoche, un contour) dont les boîtes se recouvrent se chevauchent-elles
 * vraiment ? Leurs boîtes ne le disent pas : l'assise d'un canapé qui contourne le dossier a une boîte qui l'englobe.
 * Des points pris en grille dans le volume commun des deux boîtes (au milieu de chaque case, jamais sur une face où
 * elles se touchent) : un seul dans les deux pièces à la fois, et elles se chevauchent. Un point est dans une pièce
 * quand une demi-droite qui en part traverse sa surface un nombre impair de fois. Pur.
 */
export interface SolidMesh {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
}

type P3 = [number, number, number];
/** A way no face of a piece of furniture lies along. */
const RAY: P3 = [0.5773, 0.5779, 0.5767];

/** Whether the point is inside the closed mesh (the number of its faces a ray from it crosses is odd). */
export function insideMesh(m: SolidMesh, p: P3): boolean {
  let crossings = 0;
  const v = (i: number): P3 => [m.vertices[3 * i]!, m.vertices[3 * i + 1]!, m.vertices[3 * i + 2]!];
  for (let k = 0; k + 2 < m.indices.length; k += 3) {
    const a = v(m.indices[k]!);
    const b = v(m.indices[k + 1]!);
    const c = v(m.indices[k + 2]!);
    const e1: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: P3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const h: P3 = [RAY[1] * e2[2] - RAY[2] * e2[1], RAY[2] * e2[0] - RAY[0] * e2[2], RAY[0] * e2[1] - RAY[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const s: P3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < 0 || u > 1) continue;
    const q: P3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const w = (RAY[0] * q[0] + RAY[1] * q[1] + RAY[2] * q[2]) / det;
    if (w < 0 || u + w > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-9) crossings++;
  }
  return crossings % 2 === 1;
}

/**
 * Whether two pieces share some matter in the box common to their boxes (`low`…`high`): a grid of points, `n` a side,
 * each at the middle of its cell.
 */
export function meshesOverlap(a: SolidMesh, b: SolidMesh, low: readonly number[], high: readonly number[], n = 8): boolean {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const p: P3 = [low[0]! + ((i + 0.5) / n) * (high[0]! - low[0]!), low[1]! + ((j + 0.5) / n) * (high[1]! - low[1]!), low[2]! + ((k + 0.5) / n) * (high[2]! - low[2]!)];
        if (insideMesh(a, p) && insideMesh(b, p)) return true;
      }
    }
  }
  return false;
}
