/**
 * « Tous les corps qu'elle touche » : les corps qu'une extrusion qui coupe traverserait, lus sur leurs maillages. Le
 * prisme de l'extrusion — les zones choisies de l'esquisse, poussées le long de sa normale de `from` à `to` — touche un
 * corps quand un sommet du corps est dedans, quand une de ses arêtes (le tour des zones en haut et en bas, ses
 * montants) traverse une face du corps, ou quand il est tout entier dans le corps. Un simple contact (le prisme posé sur
 * une face) ne compte pas. Pur.
 */
import { addExtrude, updateFeature } from "../document/operations";
import type { CadDocument, ExtrudeFeature } from "../document/types";
import type { SketchFrame } from "../sketcher/frame";

/** The value of the « Cible » list for every body the extrusion goes into. */
export const TOUCHED = "*touched";

type P2 = [number, number];
type P3 = [number, number, number];

export interface Area {
  outer: readonly P2[];
  holes: readonly (readonly P2[])[];
}

export interface BodyShape {
  id: string;
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
}

const inPolygon = (p: P2, poly: readonly P2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const inArea = (p: P2, area: Area) => inPolygon(p, area.outer) && !area.holes.some((h) => inPolygon(p, h));

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the line from `o` along `d` crosses the triangle (its parameter), or null (Möller–Trumbore). */
function crossing(o: P3, d: P3, a: P3, b: P3, c: P3): number | null {
  const [e1, e2] = [sub(b, a), sub(c, a)];
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const t0 = sub(o, a);
  const u = dot(t0, p) / det;
  if (u < 0 || u > 1) return null;
  const q = cross(t0, e1);
  const v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return null;
  return dot(e2, q) / det;
}

/** The bodies the prism of these areas, from `from` to `to` along the sketch's normal, goes into. */
export function touchedBodies(areas: readonly Area[], frame: SketchFrame, from: number, to: number, bodies: readonly BodyShape[]): string[] {
  // Its ends a hair inside: a prism standing on a face does not touch the body under it.
  const [lo, hi] = [Math.min(from, to) + 0.01, Math.max(from, to) - 0.01];
  if (!(hi > lo) || !areas.length) return [];
  const local = (x: number, y: number, z: number): P3 => {
    const d: P3 = [x - frame.origin[0], y - frame.origin[1], z - frame.origin[2]];
    return [dot(d, frame.u), dot(d, frame.v), dot(d, frame.normal)];
  };
  const xs = areas.flatMap((a) => a.outer.map((p) => p[0]));
  const ys = areas.flatMap((a) => a.outer.map((p) => p[1]));
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  // The prism's edges: round each loop at both ends, and up each corner.
  const segments: [P3, P3][] = areas.flatMap((a) => [a.outer, ...a.holes].flatMap((loop) => loop.flatMap((p, i): [P3, P3][] => {
    const q = loop[(i + 1) % loop.length]!;
    return [[[p[0], p[1], lo], [q[0], q[1], lo]], [[p[0], p[1], hi], [q[0], q[1], hi]], [[p[0], p[1], lo], [p[0], p[1], hi]]];
  })));
  const middle = (lo + hi) / 2;
  return bodies.filter((body) => {
    const n = Math.floor(body.vertices.length / 3);
    const pts: P3[] = Array.from({ length: n }, (_, i) => local(body.vertices[3 * i]!, body.vertices[3 * i + 1]!, body.vertices[3 * i + 2]!));
    if (!pts.length) return false;
    // Not even near: its box apart from the prism's.
    const low: P3 = [Infinity, Infinity, Infinity];
    const high: P3 = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) (low[k] = Math.min(low[k]!, p[k]!)), (high[k] = Math.max(high[k]!, p[k]!));
    if (high[0] < box.x0 || low[0] > box.x1 || high[1] < box.y0 || low[1] > box.y1 || high[2] < lo || low[2] > hi) return false;
    // A corner of the body inside the prism.
    if (pts.some((p) => p[2] > lo && p[2] < hi && areas.some((a) => inArea([p[0], p[1]], a)))) return true;
    const triangles: [P3, P3, P3][] = [];
    for (let i = 0; i + 2 < body.indices.length; i += 3) triangles.push([pts[body.indices[i]!]!, pts[body.indices[i + 1]!]!, pts[body.indices[i + 2]!]!]);
    // An edge of the prism through a face of the body.
    for (const [a, b] of segments) {
      const d = sub(b, a);
      if (triangles.some(([p, q, r]) => {
        const t = crossing(a, d, p, q, r);
        return t !== null && t > 1e-6 && t < 1 - 1e-6;
      })) return true;
    }
    // The prism wholly inside the body: one of its corners, halfway up, inside.
    const corner = areas[0]!.outer[0]!;
    return within([corner[0], corner[1], middle], triangles);
  }).map((body) => body.id);
}

/** Whether `o` is inside the closed mesh of these triangles: a ray from it crosses them an odd number of times. */
function within(o: P3, triangles: readonly [P3, P3, P3][]): boolean {
  const hits = triangles.filter(([p, q, r]) => {
    const t = crossing(o, [1, 0.000123, 0.000457], p, q, r);
    return t !== null && t > 0;
  }).length;
  return hits % 2 === 1;
}

/**
 * Which way a sketch drawn on a face of `body` goes into it: 1 along its normal, −1 against it, 0 neither (not on
 * the body). `at`: a point inside one of its areas (sketch coordinates).
 */
export function intoBody(frame: SketchFrame, at: P2, body: Omit<BodyShape, "id">): 1 | -1 | 0 {
  const n = Math.floor(body.vertices.length / 3);
  const pt = (i: number): P3 => [body.vertices[3 * i]!, body.vertices[3 * i + 1]!, body.vertices[3 * i + 2]!];
  const triangles: [P3, P3, P3][] = [];
  for (let i = 0; i + 2 < body.indices.length; i += 3) if (Math.max(body.indices[i]!, body.indices[i + 1]!, body.indices[i + 2]!) < n) triangles.push([pt(body.indices[i]!), pt(body.indices[i + 1]!), pt(body.indices[i + 2]!)]);
  // Half a millimetre off the face, on either side.
  const off = (h: number): P3 => [0, 1, 2].map((k) => frame.origin[k]! + frame.u[k]! * at[0] + frame.v[k]! * at[1] + frame.normal[k]! * h) as P3;
  return within(off(0.5), triangles) ? 1 : within(off(-0.5), triangles) ? -1 : 0;
}

/**
 * The document with one extrusion cutting each of these bodies, all alike (`values`): the one being changed
 * (`editing`) takes the first, new ones the others. The first one's id, to select.
 */
export function cutsOnEach(doc: CadDocument, values: Partial<ExtrudeFeature> & { sketch?: string; distance: number }, targets: readonly string[], editing: string | null): { doc: CadDocument; id: string } {
  let next = doc;
  const ids: string[] = [];
  targets.forEach((target, i) => {
    let id = i === 0 && editing ? editing : "";
    if (!id) {
      next = addExtrude(next, values.sketch ?? "", values.distance);
      id = next.features[next.features.length - 1]!.id;
    }
    next = updateFeature(next, id, (f) => (f.type === "extrude" ? { ...f, ...values, operation: "cut", target } : f));
    ids.push(id);
  });
  return { doc: next, id: ids[0]! };
}
