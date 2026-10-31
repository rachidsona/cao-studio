/**
 * Motif d'une face seule (le dessus d'un plan, la façade d'un tiroir) : gardé avec le corps dans `bodyInfo.faces`,
 * la face repérée par sa normale et la place de son centre dans la boîte du corps (de 0 à 1 sur chaque axe), comme
 * les références d'arêtes : la face est retrouvée après un recalcul, même quand la pièce change de taille. Pur.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import type { CadDocument, FaceLook, Vec3 } from "../document/types";

/** What identifies a face of a body. */
export interface FaceMark {
  normal: Vec3;
  rel: Vec3;
}

/** The mesh of a body, as far as finding its faces goes. */
export interface FaceMesh {
  vertices: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
  faceGroups: { start: number; count: number }[];
}

/** Same face: normals within ≈ 8°, centres within 15 % of the body's box. */
const MAX_TURN = 0.01;
const MAX_SHIFT = 0.15;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const round = (v: number) => Number(v.toFixed(4));

/** The mark of every face of a mesh (its outward normal, its centre in the box), in face order. */
export function faceMarks(mesh: FaceMesh): FaceMark[] {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3]!, mesh.vertices[i]!);
    hi[i % 3] = Math.max(hi[i % 3]!, mesh.vertices[i]!);
  }
  return mesh.faceGroups.map((g) => {
    // Centre: the triangles' centres weighted by their area; normal: the vertex normals (outward) weighted alike.
    const c = [0, 0, 0];
    const n = [0, 0, 0];
    let area = 0;
    for (let t = g.start; t + 2 < g.start + g.count; t += 3) {
      const [a, b, d] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
      const p = (k: number, i: number) => mesh.vertices[k * 3 + i]!;
      const u = [0, 1, 2].map((i) => p(b, i) - p(a, i));
      const v = [0, 1, 2].map((i) => p(d, i) - p(a, i));
      const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const s = Math.hypot(...cross) / 2;
      area += s;
      for (let i = 0; i < 3; i++) {
        c[i]! += (s * (p(a, i) + p(b, i) + p(d, i))) / 3;
        n[i]! += s * (mesh.normals[a * 3 + i]! + mesh.normals[b * 3 + i]! + mesh.normals[d * 3 + i]!);
      }
    }
    const l = Math.hypot(...n) || 1;
    const rel = [0, 1, 2].map((i) => {
      const size = hi[i]! - lo[i]!;
      return round(size < 1e-9 ? 0.5 : ((area ? c[i]! / area : 0) - lo[i]!) / size);
    }) as Vec3;
    return { normal: n.map((x) => round(x / l)) as Vec3, rel };
  });
}

/** The face of `marks` that is `mark` (nearest within the tolerances), or -1. */
export function matchFace(marks: readonly FaceMark[], mark: FaceMark): number {
  let best = -1;
  let score = Infinity;
  marks.forEach((m, i) => {
    const turn = 1 - dot(m.normal, mark.normal);
    const shift = Math.hypot(m.rel[0] - mark.rel[0], m.rel[1] - mark.rel[1], m.rel[2] - mark.rel[2]);
    if (turn > MAX_TURN || shift > MAX_SHIFT) return;
    if (turn * 10 + shift < score) [score, best] = [turn * 10 + shift, i];
  });
  return best;
}

/** The faces of this body that have a motif of their own. */
export function faceLooks(doc: CadDocument, bodyId: string): FaceLook[] {
  return bodyInfo(doc, bodyId).faces ?? [];
}

/**
 * Gives these faces an appearance (null: they go back to their body's), with a colour for a paintable one. A face that
 * already had one has it replaced.
 */
export function setFaceAppearance(doc: CadDocument, faces: { bodyId: string; mark: FaceMark }[], appearanceId: string | null, color?: string): CadDocument {
  let out = doc;
  for (const { bodyId, mark } of faces) {
    const kept = faceLooks(out, bodyId).filter((f) => matchFace([f], mark) < 0);
    const look: FaceLook | null = appearanceId ? { normal: mark.normal, rel: mark.rel, appearance: appearanceId, ...(color ? { color } : {}) } : null;
    const next = look ? [...kept, look] : kept;
    out = setBodyInfo(out, [bodyId], { faces: next.length ? next : undefined });
  }
  return out;
}
