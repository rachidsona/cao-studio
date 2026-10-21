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

/** The outer boundary of the face as a polygon (its straight edges chained end to end), in sketch coordinates. */
export function facePolygon(outline: FaceOutline, frame: SketchFrame): Vec2[] | null {
  const segments: [Vec2, Vec2][] = [];
  for (const e of outline.edges) if (e.kind === "line") segments.push([toSketch(frame, e.a), toSketch(frame, e.b)]);
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

/** The part of the face between the lines at distances `from` and `to` from the edge (inward), or null when empty. */
export function bandPolygon(poly: Vec2[], edge: FaceEdge, from: number, to: number): Vec2[] | null {
  if (!(to > from + MERGE)) return null;
  const n = inwardNormal(poly, edge);
  const near: Vec2 = [edge.a[0] + n[0] * from, edge.a[1] + n[1] * from];
  const far: Vec2 = [edge.a[0] + n[0] * to, edge.a[1] + n[1] * to];
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
