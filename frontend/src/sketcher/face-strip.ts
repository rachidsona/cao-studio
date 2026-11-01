/**
 * "Tracé sur face" (like Curic DIO in SketchUp): lines drawn on a planar face
 * of a body, parallel to one of its edges, at a distance from it. One line
 * cuts off the band between the edge and the line (a rabbet, an edge strip);
 * two lines cut a band of a given width further in (a groove).
 *
 * The band is the face outline clipped between two lines parallel to the
 * edge, so it follows the face whatever its shape. It becomes a closed area
 * of a sketch on the face (real lines, beside the projected outline), ready
 * to be extruded in or out.
 */
import type { SketchGeometry } from "../document/sketch";
import type { FaceOutline } from "../geometry/protocol";
import type { Vec2 } from "./edit";
import { toSketch, type SketchFrame } from "./frame";
import { projectOutline } from "./projection";

/** A straight edge of the face, in sketch coordinates. */
export interface FaceEdge {
  a: Vec2;
  b: Vec2;
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const MERGE = 1e-6;

/** Segments that follow an arc of the face (the round top of a vaulted gable), from its start through its middle. */
const ARC_STEP = Math.PI / 32;
function arcSegments(frame: SketchFrame, e: { center: [number, number, number]; a: [number, number, number]; b: [number, number, number]; mid: [number, number, number]; radius: number }): [Vec2, Vec2][] {
  const [c, a, b, m] = [e.center, e.a, e.b, e.mid].map((p) => toSketch(frame, p)) as [Vec2, Vec2, Vec2, Vec2];
  const angle = (p: Vec2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // Counter-clockwise from a to b, unless the middle is the other way.
  let sweep = turn(angle(b) - angle(a));
  if (turn(angle(m) - angle(a)) > sweep) sweep -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const at = (k: number): Vec2 => (k === 0 ? a : k === steps ? b : [c[0] + e.radius * Math.cos(angle(a) + (sweep * k) / steps), c[1] + e.radius * Math.sin(angle(a) + (sweep * k) / steps)]);
  return Array.from({ length: steps }, (_, k) => [at(k), at(k + 1)]);
}

/**
 * The outer boundary of the face as a polygon (its edges chained end to end, an arc as short segments), in sketch
 * coordinates.
 */
export function facePolygon(outline: FaceOutline, frame: SketchFrame): Vec2[] | null {
  const segments: [Vec2, Vec2][] = [];
  for (const e of outline.edges) {
    if (e.kind === "line") segments.push([toSketch(frame, e.a), toSketch(frame, e.b)]);
    else if (e.kind === "arc") segments.push(...arcSegments(frame, e));
  }
  if (segments.length < 3) return null;
  const same = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4;
  // Chains of segments; the largest closed one is the outer boundary (inner loops are holes).
  const unused = [...segments];
  let best: Vec2[] | null = null;
  while (unused.length) {
    const [first] = unused.splice(0, 1) as [[Vec2, Vec2]];
    const chain: Vec2[] = [first[0], first[1]];
    for (;;) {
      const end = chain[chain.length - 1] as Vec2;
      const i = unused.findIndex(([p, q]) => same(p, end) || same(q, end));
      if (i < 0) break;
      const [p, q] = unused.splice(i, 1)[0] as [Vec2, Vec2];
      chain.push(same(p, end) ? q : p);
    }
    if (chain.length > 3 && same(chain[0] as Vec2, chain[chain.length - 1] as Vec2)) {
      chain.pop();
      if (!best || area(chain) > area(best)) best = chain;
    }
  }
  return best;
}

function area(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Vec2;
    const q = poly[(i + 1) % poly.length] as Vec2;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

/** The edges of the polygon. */
export function polygonEdges(poly: Vec2[]): FaceEdge[] {
  return poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] as Vec2 }));
}

/** The edge of the polygon nearest to p, and how far it is. */
export function nearestEdge(poly: Vec2[], p: Vec2): { edge: FaceEdge; d: number } | null {
  let best: { edge: FaceEdge; d: number } | null = null;
  for (const edge of polygonEdges(poly)) {
    const ab: Vec2 = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - edge.a[0]) * ab[0] + (p[1] - edge.a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
    const d = Math.hypot(p[0] - (edge.a[0] + t * ab[0]), p[1] - (edge.a[1] + t * ab[1]));
    if (!best || d < best.d) best = { edge, d };
  }
  return best;
}

/** Unit normal of the edge pointing into the polygon. */
export function inwardNormal(poly: Vec2[], edge: FaceEdge): Vec2 {
  const d = sub(edge.b, edge.a);
  const l = Math.hypot(...d) || 1;
  const n: Vec2 = [-d[1] / l, d[0] / l];
  const c: Vec2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  return dot(sub(c, edge.a), n) >= 0 ? n : [-n[0], -n[1]];
}

/** Distance from p to the edge's line, measured inward (negative outside). */
export function inwardDistance(poly: Vec2[], edge: FaceEdge, p: Vec2): number {
  return dot(sub(p, edge.a), inwardNormal(poly, edge));
}

/** Clips a polygon to the half-plane dot(p − origin, n) ≥ 0 (Sutherland–Hodgman). */
function clipHalf(poly: Vec2[], origin: Vec2, n: Vec2): Vec2[] {
  const out: Vec2[] = [];
  const side = (p: Vec2) => dot(sub(p, origin), n);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Vec2;
    const q = poly[(i + 1) % poly.length] as Vec2;
    const sp = side(p);
    const sq = side(q);
    if (sp >= -MERGE) out.push(p);
    if ((sp > MERGE && sq < -MERGE) || (sp < -MERGE && sq > MERGE)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Where the distances are measured from: a line through `origin`, distances growing along the unit `normal`. */
export interface StripReference {
  origin: Vec2;
  normal: Vec2;
}

/** Reference of an edge: its own line, distances measured into the face. */
export function edgeReference(poly: Vec2[], edge: FaceEdge): StripReference {
  return { origin: edge.a, normal: inwardNormal(poly, edge) };
}

/**
 * Reference of a corner of the face (as DIO starting from a point): the line through the corner across the face,
 * distances measured along the side the pointer goes along from the corner (of the two sides meeting there, the
 * one most in the pointer's direction). Null when the pointer is on the corner itself.
 */
export function cornerReference(poly: Vec2[], index: number, pointer: Vec2): StripReference | null {
  const n = poly.length;
  const corner = poly[index] as Vec2;
  const away = sub(pointer, corner);
  if (Math.hypot(...away) < MERGE) return null;
  let best: Vec2 | null = null;
  for (const next of [poly[(index + 1) % n] as Vec2, poly[(index + n - 1) % n] as Vec2]) {
    const d = sub(next, corner);
    const l = Math.hypot(...d) || 1;
    const u: Vec2 = [d[0] / l, d[1] / l];
    if (!best || dot(away, u) > dot(away, best)) best = u;
  }
  return best ? { origin: corner, normal: best } : null;
}

/** Distance from the reference to p, along its normal. */
export function referenceDistance(ref: StripReference, p: Vec2): number {
  return dot(sub(p, ref.origin), ref.normal);
}

/**
 * Distances from p to the boundary of the face on both sides of a line through p (perpendicular to `normal`):
 * backwards (−normal) and forwards (+normal), the nearest crossing each way. Null on a side with no boundary.
 */
export function sideDistances(poly: Vec2[], p: Vec2, normal: Vec2): { back: number | null; ahead: number | null } {
  let back: number | null = null;
  let ahead: number | null = null;
  for (const { a, b } of polygonEdges(poly)) {
    // Crossing of the ray p + t·normal with the segment a–b.
    const e = sub(b, a);
    const den = normal[0] * e[1] - normal[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, p);
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const u = (w[0] * normal[1] - w[1] * normal[0]) / den;
    if (u < -MERGE || u > 1 + MERGE) continue;
    if (t >= -MERGE && (ahead === null || t < ahead)) ahead = Math.max(0, t);
    if (t <= MERGE && (back === null || -t < back)) back = Math.max(0, -t);
  }
  return { back, ahead };
}

/** Where a double line sits with respect to the pointer line: it starts there, ends there, or is centred on it. */
export type GrooveAnchor = "start" | "end" | "center";

/** Distances (from, to) of the band from the reference: one line, or a double line of `width` placed by `anchor`. */
export function bandRange(mode: "line" | "groove", anchor: GrooveAnchor, distance: number, width: number): [number, number] {
  if (mode === "line") return [0, distance];
  if (anchor === "end") return [distance - width, distance];
  if (anchor === "center") return [distance - width / 2, distance + width / 2];
  return [distance, distance + width];
}

/** The part of the face between the lines at distances `from` and `to` from the edge (inward), or null when empty. */
export function bandPolygon(poly: Vec2[], edge: FaceEdge, from: number, to: number): Vec2[] | null {
  return stripPolygon(poly, edgeReference(poly, edge), from, to);
}

/** The part of the face between the lines at distances `from` and `to` from a reference, or null when empty. */
export function stripPolygon(poly: Vec2[], ref: StripReference, from: number, to: number): Vec2[] | null {
  if (!(to > from + MERGE)) return null;
  const n = ref.normal;
  const near: Vec2 = [ref.origin[0] + n[0] * from, ref.origin[1] + n[1] * from];
  const far: Vec2 = [ref.origin[0] + n[0] * to, ref.origin[1] + n[1] * to];
  const clipped = clipHalf(clipHalf(poly, near, n), far, [-n[0], -n[1]]);
  // Drop repeated corners left by the clipping.
  const unique = clipped.filter((p, i) => {
    const q = clipped[(i + 1) % clipped.length] as Vec2;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > MERGE;
  });
  return unique.length >= 3 && area(unique) > MERGE ? unique : null;
}

/**
 * The sketch on the face: its projected outline (fixed references) and the band as real lines, a closed
 * area that an extrusion can push in or pull out.
 */
export function bandSketch(outline: FaceOutline, frame: SketchFrame, band: Vec2[]): SketchGeometry {
  const g = projectOutline(outline, frame);
  const ids = band.map((p, i) => {
    const id = `t${i + 1}`;
    g.points.push({ id, x: p[0], y: p[1] });
    return id;
  });
  ids.forEach((id, i) => g.curves.push({ id: `b${i + 1}`, kind: "line", p1: id, p2: ids[(i + 1) % ids.length] as string }));
  return g;
}
