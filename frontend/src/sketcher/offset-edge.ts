/**
 * « Décaler l'arête » de l'esquisse (comme l'outil de Shapr3D), côté calcul : des arêtes des corps (ou toutes les
 * arêtes d'une face cliquée) sont projetées dans l'esquisse comme repères fixes, puis décalées par le Décalage, du
 * côté de la matière de la face : le contour extérieur rentre dans la face, un trou s'élargit dans la matière.
 *
 * Pure geometry: the kernel does the offset itself (geometry/offset.ts); this only projects the body edges without
 * doubling those already in the sketch, and says on which side the face is.
 */
import type { SketchGeometry } from "../document/sketch";
import type { OffsetCurve, OffsetPath } from "../geometry/offset";
import type { EdgeOutline, FaceOutline, OutlineEdge } from "../geometry/protocol";
import type { Vec2 } from "./edit";
import type { SketchFrame, Vec3 } from "./frame";
import { handleFor, pathsFromCurves } from "./offset";
import { projectEdge } from "./projection";

/** The closed paths of a face boundary as polygons (arcs through their middle point, circles as 48-gons). */
export function ringsOf(paths: OffsetPath[]): Vec2[][] {
  const rings: Vec2[][] = [];
  for (const path of paths) {
    if (path.kind === "circle") {
      rings.push(Array.from({ length: 48 }, (_, i): Vec2 => [path.center[0] + path.radius * Math.cos((i * Math.PI) / 24), path.center[1] + path.radius * Math.sin((i * Math.PI) / 24)]));
    } else if (path.closed) {
      const ring: Vec2[] = [path.start];
      for (const step of path.steps) {
        if (step.kind === "arc") ring.push(step.mid);
        ring.push(step.to);
      }
      rings.push(ring);
    }
  }
  return rings;
}

/** Inside the face: inside an odd number of its rings (the outer loop, not a hole). */
export function insideRings(p: Vec2, rings: Vec2[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as Vec2;
      const [xj, yj] = ring[j] as Vec2;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * The sign to give the kernel so that a path is offset into the face: +1 when the kernel's positive side (outside
 * of a closed path, left of an open one) is inside the face, −1 otherwise. The outer loop goes in with −1, a hole
 * with +1; an open chain of edges is tested the same way. Without any face around, the kernel's side is kept.
 */
export function intoFaceSign(path: OffsetPath, rings: Vec2[][]): 1 | -1 {
  const handle = handleFor([path]);
  if (!handle || rings.length === 0) return 1;
  // A little step off the path, scaled to the size of the face.
  const size = Math.max(1, ...rings.flat().map(([x, y]) => Math.hypot(x - handle.at[0], y - handle.at[1])));
  const step = size * 1e-3;
  const probe: Vec2 = [handle.at[0] + handle.normal[0] * step, handle.at[1] + handle.normal[1] * step];
  return insideRings(probe, rings) ? 1 : -1;
}

/** The faces drawn by the projected body edges of the sketch (a sketch on a face has its outline). */
export function projectedRings(g: SketchGeometry): Vec2[][] {
  const ids = g.curves.filter((c) => c.projected).map((c) => c.id);
  if (!ids.length) return [];
  try {
    return ringsOf(pathsFromCurves(g, ids));
  } catch {
    return []; // branching edges (a T): no side can be told from them
  }
}

export interface Projected {
  geometry: SketchGeometry;
  /** The sketch curves that are these edges (new, or already in the sketch). */
  ids: string[];
  /** The face these edges bound (a whole face was clicked), to tell its inside. */
  rings?: Vec2[][];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Projects a body edge into the sketch; an edge already there (same points) is reused, not doubled. */
export function projectEdgeOnce(g: SketchGeometry, outline: EdgeOutline, frame: SketchFrame): Projected | string {
  const next = projectEdge(g, outline, frame);
  if (typeof next === "string") return next;
  const ids: string[] = [];
  const doubles = new Set<string>();
  for (const curve of next.curves.slice(g.curves.length)) {
    const twin = g.curves.find((c) => {
      if (c.kind === "line" && curve.kind === "line") return sameSet([c.p1, c.p2], [curve.p1, curve.p2]);
      if (c.kind === "circle" && curve.kind === "circle") return c.center === curve.center && Math.abs(c.radius - curve.radius) < 1e-6;
      if (c.kind === "arc" && curve.kind === "arc") return c.center === curve.center && sameSet([c.start, c.end], [curve.start, curve.end]);
      return false;
    });
    if (twin) doubles.add(curve.id);
    ids.push(twin?.id ?? curve.id);
  }
  if (doubles.size === next.curves.length - g.curves.length) return { geometry: g, ids };
  return { geometry: { ...next, curves: next.curves.filter((c) => !doubles.has(c.id)) }, ids };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Points along an edge of a planar face (its exact shape is kept, the samples serve a slanted projection). */
export function edgeSamples(edge: OutlineEdge, normal: Vec3): Vec3[] {
  if (edge.kind === "line") return [edge.a, edge.b];
  const n = unit(normal);
  const u = unit(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const v = cross(n, u);
  const at = (t: number): Vec3 => [0, 1, 2].map((i) => edge.center[i]! + edge.radius * (Math.cos(t) * u[i]! + Math.sin(t) * v[i]!)) as Vec3;
  if (edge.kind === "circle") return Array.from({ length: 33 }, (_, i) => at((i * Math.PI) / 16));
  const angle = (p: Vec3) => Math.atan2(dot(sub(p, edge.center), v), dot(sub(p, edge.center), u));
  const turn = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const [a, m, b] = [angle(edge.a), angle(edge.mid), angle(edge.b)];
  // Counter-clockwise from a to b, unless the middle point says the arc goes the other way.
  const ccw = turn(m - a) <= turn(b - a);
  const sweep = ccw ? turn(b - a) : -turn(a - b);
  return Array.from({ length: 17 }, (_, i) => at(a + (sweep * i) / 16));
}

/** Projects every edge of a face into the sketch (reusing those already there), and the face it bounds. */
export function projectFace(g: SketchGeometry, outline: FaceOutline, frame: SketchFrame): Projected | string {
  let geometry = g;
  const ids: string[] = [];
  for (const edge of outline.edges) {
    const done = projectEdgeOnce(geometry, { edges: [edge], samples: edgeSamples(edge, outline.normal) }, frame);
    if (typeof done === "string") continue; // an edge seen end-on adds nothing
    geometry = done.geometry;
    ids.push(...done.ids);
  }
  if (!ids.length) return "Cette face est vue de profil depuis le plan de l'esquisse : ses arêtes ne s'y projettent pas.";
  let rings: Vec2[][] = [];
  try {
    rings = ringsOf(pathsFromCurves(geometry, ids));
  } catch {
    // Seen slanted, the edges may cross: the side is then the kernel's.
  }
  return { geometry, ids: [...new Set(ids)], rings };
}

/**
 * The rule of « Décaler l'arête »: a new straight line goes no further than the lines already drawn that it meets —
 * from its middle, it stops at the first one on each side (the line offset from the side of a rectangle stops at the
 * line drawn across it, instead of running on past it). The source lines (`skip`) and construction lines do not stop
 * it. Curves are left as they are.
 */
export function trimToExisting(curves: readonly OffsetCurve[], g: SketchGeometry, skip: ReadonlySet<string>): OffsetCurve[] {
  const at = (id: string): Vec2 => {
    if (id === "origin") return [0, 0];
    const p = g.points.find((q) => q.id === id);
    return p ? [p.x, p.y] : [NaN, NaN];
  };
  const walls = g.curves.filter((c) => c.kind === "line" && !c.construction && !skip.has(c.id)).map((c) => (c.kind === "line" ? [at(c.p1), at(c.p2)] : null)).filter((w): w is [Vec2, Vec2] => !!w);
  return curves.map((curve) => {
    if (curve.kind !== "line") return curve;
    const [a, b] = [curve.a, curve.b];
    const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) return curve;
    let [low, high] = [0, 1];
    for (const [p, q] of walls) {
      const e: Vec2 = [q[0] - p[0], q[1] - p[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      // Parallel lines do not stop it.
      if (Math.abs(den) < 1e-9 * len * Math.hypot(e[0], e[1])) continue;
      const w: Vec2 = [p[0] - a[0], p[1] - a[1]];
      const t = (w[0] * e[1] - w[1] * e[0]) / den;
      const u = (w[0] * d[1] - w[1] * d[0]) / den;
      // Crossed inside the other line (its ends included), strictly inside this one.
      const tolerance = 1e-6;
      if (u < -tolerance || u > 1 + tolerance || t <= tolerance || t >= 1 - tolerance) continue;
      if (t < 0.5) low = Math.max(low, t);
      else high = Math.min(high, t);
    }
    if (low === 0 && high === 1) return curve;
    const point = (t: number): Vec2 => [Number((a[0] + d[0] * t).toFixed(6)), Number((a[1] + d[1] * t).toFixed(6))];
    return { kind: "line", a: point(low), b: point(high) };
  });
}
