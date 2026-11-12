/**
 * Coller un module contre une face (« Ma bibliothèque », app/library-panel.ts) : la face choisie donne un plan, le
 * module s'y pose de son côté, dehors ; dans le plan, il s'aligne sur le meuble de la face — en bas sur son bas, et,
 * à l'horizontale, sur son dos quand on le connaît (sinon sur son bord le plus bas des coordonnées). Une face de
 * dessus le pose sur le meuble, une face de dessous sous lui. Pur : des boîtes et des vecteurs, sans la vue.
 */
import type { Vec3 } from "./types";

export type Box = [Vec3, Vec3];

/** A face of a mesh: its box, and its normal (unit, averaged over its triangles). */
export interface FaceBox {
  box: Box;
  normal: Vec3;
}

/** The face `faceIndex` of a mesh: the box of its corners and its normal; null when it has no triangle. */
export function faceOf(mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number>; faceGroups: readonly { start: number; count: number }[] }, faceIndex: number): FaceBox | null {
  const group = mesh.faceGroups[faceIndex];
  if (!group || group.count < 3) return null;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const n: Vec3 = [0, 0, 0];
  const at = (k: number): Vec3 => {
    const i = mesh.indices[k]! * 3;
    return [mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!];
  };
  for (let k = group.start; k + 2 < group.start + group.count; k += 3) {
    const [a, b, c] = [at(k), at(k + 1), at(k + 2)];
    for (const p of [a, b, c]) for (let i = 0; i < 3; i++) [lo[i], hi[i]] = [Math.min(lo[i]!, p[i]!), Math.max(hi[i]!, p[i]!)];
    // Each triangle's normal, weighted by its area (the cross product's length).
    const [u, v] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    n[0] += u[1]! * v[2]! - u[2]! * v[1]!;
    n[1] += u[2]! * v[0]! - u[0]! * v[2]!;
    n[2] += u[0]! * v[1]! - u[1]! * v[0]!;
  }
  const length = Math.hypot(...n);
  if (!(length > 1e-9)) return null;
  return { box: [lo, hi], normal: n.map((c) => c / length) as Vec3 };
}

/** The box around boxes. */
export function boxAround(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  return [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
}

/**
 * How far the module (its box) goes to stand against the face, out of it, aligned with the furniture of the face
 * (`owner`: its box; `back`: where it turns its back, on the floor, if known). Null: a face not square to the axes.
 */
export function glueShift(module: Box, face: FaceBox, owner: Box, back: [number, number] | null = null): Vec3 | null {
  const axis = [0, 1, 2].reduce((best, i) => (Math.abs(face.normal[i]!) > Math.abs(face.normal[best]!) ? i : best), 0);
  if (Math.abs(face.normal[axis]!) < 0.9) return null;
  const out = face.normal[axis]! > 0;
  const plane = (face.box[0][axis]! + face.box[1][axis]!) / 2;
  const shift: Vec3 = [0, 0, 0];
  // Against the plane, on the side the face looks to.
  shift[axis] = out ? plane - module[0][axis]! : plane - module[1][axis]!;
  for (let i = 0; i < 3; i++) {
    if (i === axis) continue;
    // Up and down: its bottom on the bottom of the furniture.
    if (i === 2) shift[2] = owner[0][2]! - module[0][2]!;
    // Across, on the floor: against the same back as the furniture, else on its lower edge.
    else shift[i] = back && back[i]! > 0.5 ? owner[1][i]! - module[1][i]! : owner[0][i]! - module[0][i]!;
  }
  return shift.map((v) => Number(v.toFixed(3))) as Vec3;
}
