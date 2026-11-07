/**
 * Déformation libre FFD 3×3×3 (comme celle de C. Phillips dans JHS PowerBar) : une grille de 3 × 3 × 3 points de
 * contrôle tendue sur la boîte du corps ; déplacer un point tire la matière autour de lui, en douceur (polynômes de
 * Bernstein du second degré : un point au milieu d'une face bombe la face, un coin la gauchit). Le corps est maillé,
 * ses triangles recoupés pour que la déformation soit lisse, puis chaque sommet déplacé ; le noyau recoud les
 * triangles en solide (features/modifiers.ts). Pur.
 */
import type { Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

/** Index of the control point (i, j, k), each 0..2 along X, Y, Z. */
export const latticeIndex = (i: number, j: number, k: number) => i + 3 * j + 9 * k;

/** The control points of the lattice over a box, moved by their offsets (27 × 3 numbers, none: in place). */
export function latticePoints(box: Box, offsets: readonly number[] = []): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const n = latticeIndex(i, j, k);
        out.push([0, 1, 2].map((a) => box[0][a]! + ((box[1][a]! - box[0][a]!) * [i, j, k][a]!) / 2 + (offsets[n * 3 + a] ?? 0)) as Vec3);
      }
  return out;
}

/**
 * The offsets with the sides of these points pushed by `delta` along `axis`: all the points of a side go together, the
 * layer between the sides by half, so that the body stretches evenly and its faces stay straight. Points of the middle
 * layer move that layer alone. Both sides at once: the whole lattice moves.
 */
export function movedSides(offsets: readonly number[], chosen: Iterable<number>, axis: number, delta: number): number[] {
  const layer = (n: number) => [n % 3, Math.floor(n / 3) % 3, Math.floor(n / 9)][axis] as number;
  const sides = new Set([...chosen].map(layer));
  const next = [...offsets];
  for (let n = 0; n < 27; n++) {
    const at = layer(n);
    const push = sides.has(at) ? 1 : 0;
    const between = at === 1 ? (sides.has(0) ? 0.5 : 0) + (sides.has(2) ? 0.5 : 0) : 0;
    next[n * 3 + axis] = (next[n * 3 + axis] ?? 0) + delta * Math.min(1, push + between);
  }
  return next;
}

const bernstein = (t: number): [number, number, number] => [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];

/** Where a point of the box goes when the lattice's points are moved by `offsets`. */
export function ffdPoint(p: Vec3, box: Box, offsets: readonly number[]): Vec3 {
  const t = [0, 1, 2].map((a) => {
    const size = box[1][a]! - box[0][a]!;
    return size > 1e-9 ? (p[a]! - box[0][a]!) / size : 0.5;
  });
  const [bx, by, bz] = [bernstein(t[0]!), bernstein(t[1]!), bernstein(t[2]!)];
  const out: Vec3 = [...p];
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const w = bx[i]! * by[j]! * bz[k]!;
        const n = latticeIndex(i, j, k) * 3;
        out[0] += w * (offsets[n] ?? 0);
        out[1] += w * (offsets[n + 1] ?? 0);
        out[2] += w * (offsets[n + 2] ?? 0);
      }
  return out;
}

/** Whether the offsets move anything. */
export const isDeformed = (offsets: readonly number[]) => offsets.some((v) => Math.abs(v) > 1e-9);

/**
 * The triangles of a mesh, each cut into n × n smaller ones (n the same for all, so that two triangles sharing an
 * edge cut it at the same points), n chosen to stay near `budget` triangles.
 */
export function subdivide(vertices: readonly number[], triangles: readonly number[], budget = 1200): Vec3[][] {
  const count = triangles.length / 3;
  const n = Math.max(1, Math.min(10, Math.floor(Math.sqrt(budget / Math.max(1, count)))));
  const at = (v: number): Vec3 => [vertices[v * 3]!, vertices[v * 3 + 1]!, vertices[v * 3 + 2]!];
  const out: Vec3[][] = [];
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [at(triangles[t * 3]!), at(triangles[t * 3 + 1]!), at(triangles[t * 3 + 2]!)];
    // Barycentric grid: point (r, s) = a + (b − a) r/n + (c − a) s/n.
    const p = (r: number, s: number): Vec3 => [0, 1, 2].map((i) => a[i]! + ((b[i]! - a[i]!) * r) / n + ((c[i]! - a[i]!) * s) / n) as Vec3;
    for (let r = 0; r < n; r++)
      for (let s = 0; r + s < n; s++) {
        out.push([p(r, s), p(r + 1, s), p(r, s + 1)]);
        if (r + s < n - 1) out.push([p(r + 1, s), p(r + 1, s + 1), p(r, s + 1)]);
      }
  }
  return out;
}
