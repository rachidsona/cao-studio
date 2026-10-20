/**
 * Planar arrangement of the curves of a sketch: every curve is cut where it
 * crosses or touches another one (crossings, T-junctions, shared ends), and
 * the closed areas the pieces enclose are extracted, like the profiles a
 * desktop CAD tool offers. Two rectangles sharing an edge give two areas; two
 * overlapping ones give three; a line across a rectangle splits it in two.
 *
 * Pure geometry on the solved sketch (lines, arcs, circles; construction and
 * projected curves are left out). Curves that enclose nothing (a stray line,
 * an open chain) are ignored here: whether that is an error is for the caller.
 */
import type { SketchGeometry } from "../document/sketch";
import { ORIGIN } from "../document/sketch";

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

type Vec = [number, number];

/** One piece of a closed boundary, walked from the previous point to `to`. */
export type CycleStep =
  | { kind: "line"; to: Vec }
  /** `reversed`: walked clockwise (the model's arcs run counter-clockwise). */
  | { kind: "arc"; to: Vec; center: Vec; radius: number; reversed: boolean };

export interface Cycle {
  start: Vec;
  steps: CycleStep[];
}

export interface Arrangement {
  /** Boundaries of the closed areas (each area is on the left of its boundary: counter-clockwise). */
  cycles: Cycle[];
  /** Circles that cross nothing: closed areas on their own. */
  circles: { center: Vec; radius: number }[];
  /** When no closed area exists: where a free end is, to tell the user the profile is open. */
  open: Vec | null;
}

/** Points closer than this (mm) are the same vertex. */
export const NODE_TOLERANCE = 1e-6;
const EPS = 1e-9;
const TWO_PI = 2 * Math.PI;
/** Smallest area (mm²) of a closed area. */
const MIN_AREA = 1e-9;

interface LinePrim {
  kind: "line";
  a: Vec;
  b: Vec;
}
interface ArcPrim {
  kind: "arc";
  c: Vec;
  r: number;
  /** Angle of the start; the arc runs counter-clockwise by `sweep` (radians, in (0, 2π)). */
  a0: number;
  sweep: number;
  a: Vec;
  b: Vec;
}
interface CirclePrim {
  kind: "circle";
  c: Vec;
  r: number;
}
type Prim = LinePrim | ArcPrim | CirclePrim;
type Round = ArcPrim | CirclePrim;

const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleOf = (p: Vec, c: Vec) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];

// ---- parameters along a primitive ------------------------------------------------

/** Parameter of the point of the primitive nearest to `p`: t in [0, 1] for a line, an angle (from the start) otherwise. */
function paramOf(p: Vec, prim: Prim): number {
  if (prim.kind === "line") {
    const d = sub(prim.b, prim.a);
    return Math.max(0, Math.min(1, ((p[0] - prim.a[0]) * d[0] + (p[1] - prim.a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])));
  }
  if (prim.kind === "circle") return norm(angleOf(p, prim.c));
  const s = norm(angleOf(p, prim.c) - prim.a0);
  if (s <= prim.sweep) return s;
  return TWO_PI - s < s - prim.sweep ? 0 : prim.sweep; // off the arc: the nearer end
}

function pointAt(prim: Prim, param: number): Vec {
  if (prim.kind === "line") return [prim.a[0] + param * (prim.b[0] - prim.a[0]), prim.a[1] + param * (prim.b[1] - prim.a[1])];
  const angle = (prim.kind === "arc" ? prim.a0 : 0) + param;
  return [prim.c[0] + prim.r * Math.cos(angle), prim.c[1] + prim.r * Math.sin(angle)];
}

/** Whether `p` (on the circle) lies within the arc. */
function inSweep(prim: Round, p: Vec): boolean {
  if (prim.kind === "circle") return true;
  const s = norm(angleOf(p, prim.c) - prim.a0);
  const slack = NODE_TOLERANCE / prim.r;
  return s <= prim.sweep + slack || s >= TWO_PI - slack;
}

/** Whether `p` lies on the primitive (within the vertex tolerance). */
function onCurve(p: Vec, prim: Prim): boolean {
  if (prim.kind === "line") {
    const d = sub(prim.b, prim.a);
    const length = Math.hypot(d[0], d[1]);
    const t = ((p[0] - prim.a[0]) * d[0] + (p[1] - prim.a[1]) * d[1]) / (length * length);
    return Math.abs(cross(d, sub(p, prim.a))) / length <= NODE_TOLERANCE && t >= -NODE_TOLERANCE / length && t <= 1 + NODE_TOLERANCE / length;
  }
  return Math.abs(dist(p, prim.c) - prim.r) <= NODE_TOLERANCE && inSweep(prim, p);
}

// ---- crossings ---------------------------------------------------------------------

function lineLine(p: LinePrim, q: LinePrim): Vec[] {
  const d1 = sub(p.b, p.a);
  const d2 = sub(q.b, q.a);
  const denominator = cross(d1, d2);
  if (Math.abs(denominator) < 1e-12 * Math.hypot(...d1) * Math.hypot(...d2)) return []; // parallel (overlaps are found through the ends)
  const w = sub(q.a, p.a);
  const t = cross(w, d2) / denominator;
  const u = cross(w, d1) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [[p.a[0] + t * d1[0], p.a[1] + t * d1[1]]] : [];
}

function lineRound(line: LinePrim, round: Round): Vec[] {
  const d = sub(line.b, line.a);
  const f = sub(line.a, round.c);
  const a = d[0] * d[0] + d[1] * d[1];
  const b = 2 * (f[0] * d[0] + f[1] * d[1]);
  const c = f[0] * f[0] + f[1] * f[1] - round.r * round.r;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-9 * (b * b + Math.abs(4 * a * c) + 1)) return [];
  discriminant = Math.max(discriminant, 0);
  const root = Math.sqrt(discriminant);
  const slack = NODE_TOLERANCE / Math.sqrt(a);
  const found: Vec[] = [];
  for (const t of root < 1e-9 ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < -slack || t > 1 + slack) continue;
    const point: Vec = [line.a[0] + t * d[0], line.a[1] + t * d[1]];
    if (inSweep(round, point)) found.push(point);
  }
  return found;
}

function roundRound(p: Round, q: Round): Vec[] {
  const d = dist(p.c, q.c);
  if (d < EPS || d > p.r + q.r + NODE_TOLERANCE || d < Math.abs(p.r - q.r) - NODE_TOLERANCE) return []; // concentric, apart or nested
  const along = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, p.r * p.r - along * along));
  const ux = (q.c[0] - p.c[0]) / d;
  const uy = (q.c[1] - p.c[1]) / d;
  const base: Vec = [p.c[0] + along * ux, p.c[1] + along * uy];
  const candidates: Vec[] = h < 1e-9 ? [base] : [[base[0] - h * uy, base[1] + h * ux], [base[0] + h * uy, base[1] - h * ux]];
  return candidates.filter((point) => inSweep(p, point) && inSweep(q, point));
}

function crossings(p: Prim, q: Prim): Vec[] {
  if (p.kind === "line") return q.kind === "line" ? lineLine(p, q) : lineRound(p, q);
  return q.kind === "line" ? lineRound(q, p) : roundRound(p, q);
}

// ---- the planar graph --------------------------------------------------------------

interface Edge {
  a: number;
  b: number;
  kind: "line" | "arc";
  /** Arc pieces only: centre, radius and the angles they run through (counter-clockwise from a0 to a1). */
  c: Vec;
  r: number;
  a0: number;
  a1: number;
}

export function arrange(geometry: SketchGeometry): Arrangement {
  const points = new Map(geometry.points.map((p) => [p.id, [p.x, p.y] as Vec]));
  points.set(ORIGIN, [0, 0]);
  const coord = (id: string): Vec => {
    const p = points.get(id);
    if (!p) throw new ProfileError(`Point « ${id} » introuvable.`);
    return p;
  };

  const prims: Prim[] = [];
  for (const curve of geometry.curves) {
    if (curve.construction) continue;
    if (curve.kind === "line") {
      const [a, b] = [coord(curve.p1), coord(curve.p2)];
      if (dist(a, b) <= NODE_TOLERANCE) throw new ProfileError(`La courbe « ${curve.id} » a une longueur nulle.`);
      prims.push({ kind: "line", a, b });
    } else if (curve.kind === "circle") {
      prims.push({ kind: "circle", c: coord(curve.center), r: curve.radius });
    } else {
      const [c, a, b] = [coord(curve.center), coord(curve.start), coord(curve.end)];
      const a0 = angleOf(a, c);
      const sweep = norm(angleOf(b, c) - a0);
      // An arc whose ends meet is a full circle.
      prims.push(sweep < EPS || sweep > TWO_PI - EPS ? { kind: "circle", c, r: curve.radius } : { kind: "arc", c, r: curve.radius, a0, sweep, a, b });
    }
  }

  // Vertices: the ends of the curves first (exact), then crossings and touches (merged into them).
  const nodes: Vec[] = [];
  const node = (p: Vec): number => {
    const found = nodes.findIndex((n) => dist(n, p) <= NODE_TOLERANCE);
    if (found >= 0) return found;
    nodes.push(p);
    return nodes.length - 1;
  };
  const cuts: { param: number; node: number }[][] = prims.map(() => []);
  const cut = (i: number, p: Vec) => cuts[i]!.push({ param: paramOf(p, prims[i]!), node: node(p) });
  prims.forEach((prim, i) => {
    if (prim.kind === "line" || prim.kind === "arc") {
      cut(i, prim.a);
      cut(i, prim.b);
    }
  });
  for (let i = 0; i < prims.length; i++) {
    for (let j = i + 1; j < prims.length; j++) {
      for (const p of crossings(prims[i]!, prims[j]!)) {
        cut(i, p);
        cut(j, p);
      }
    }
    // The end of a curve resting on another curve (T-junction, overlap): the other one is cut there.
    const prim = prims[i]!;
    if (prim.kind === "circle") continue;
    for (let j = 0; j < prims.length; j++) {
      if (j !== i) for (const end of [prim.a, prim.b]) if (onCurve(end, prims[j]!)) cut(j, end);
    }
  }

  // Pieces between consecutive cuts.
  const edges: Edge[] = [];
  const circles: Arrangement["circles"] = [];
  const seen = new Set<string>();
  const addEdge = (edge: Edge) => {
    if (edge.a === edge.b) return;
    // Two curves along each other give the same piece twice: keep one.
    const key = edge.kind === "line" ? `L${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}` : `A${edge.a}>${edge.b}:${edge.c[0].toFixed(5)},${edge.c[1].toFixed(5)},${edge.r.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };
  prims.forEach((prim, i) => {
    const sorted = [...cuts[i]!].sort((x, y) => x.param - y.param);
    if (prim.kind === "line") {
      for (let k = 0; k + 1 < sorted.length; k++) addEdge({ a: sorted[k]!.node, b: sorted[k + 1]!.node, kind: "line", c: [0, 0], r: 0, a0: 0, a1: 0 });
      return;
    }
    if (prim.kind === "arc") {
      for (let k = 0; k + 1 < sorted.length; k++) {
        const [from, to] = [sorted[k]!, sorted[k + 1]!];
        if (to.param - from.param > EPS) addEdge({ a: from.node, b: to.node, kind: "arc", c: prim.c, r: prim.r, a0: prim.a0 + from.param, a1: prim.a0 + to.param });
      }
      return;
    }
    if (sorted.length === 0) {
      circles.push({ center: prim.c, radius: prim.r }); // crosses nothing: an area of its own
      return;
    }
    if (sorted.length === 1) sorted.push({ param: norm(sorted[0]!.param + Math.PI), node: node(pointAt(prim, sorted[0]!.param + Math.PI)) });
    sorted.forEach((from, k) => {
      const to = sorted[(k + 1) % sorted.length]!;
      const end = k + 1 < sorted.length ? to.param : to.param + TWO_PI;
      if (end - from.param > EPS) addEdge({ a: from.node, b: to.node, kind: "arc", c: prim.c, r: prim.r, a0: from.param, a1: end });
    });
  });

  // Half-edges: 2e walks edge e from a to b, 2e + 1 from b to a. Around each vertex they are sorted counter-clockwise.
  const origin = (h: number) => (h % 2 === 0 ? edges[h >> 1]!.a : edges[h >> 1]!.b);
  const target = (h: number) => (h % 2 === 0 ? edges[h >> 1]!.b : edges[h >> 1]!.a);
  const direction = (h: number): { angle: number; curvature: number } => {
    const e = edges[h >> 1]!;
    const forward = h % 2 === 0;
    if (e.kind === "line") {
      const d = forward ? sub(nodes[e.b]!, nodes[e.a]!) : sub(nodes[e.a]!, nodes[e.b]!);
      return { angle: norm(Math.atan2(d[1], d[0])), curvature: 0 };
    }
    // Tangent of a counter-clockwise arc at its start, or of the same arc walked back from its end.
    return forward ? { angle: norm(e.a0 + Math.PI / 2), curvature: 1 / e.r } : { angle: norm(e.a1 - Math.PI / 2), curvature: -1 / e.r };
  };

  const alive = edges.map(() => true);
  const pointsOf = (walk: number[]): Vec[] =>
    walk.flatMap((h) => {
      const e = edges[h >> 1]!;
      const out: Vec[] = [nodes[origin(h)]!];
      if (e.kind === "arc") {
        const [from, to] = h % 2 === 0 ? [e.a0, e.a1] : [e.a1, e.a0];
        for (let s = 1; s < 8; s++) {
          const t = from + ((to - from) * s) / 8;
          out.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]);
        }
      }
      return out;
    });
  const signedArea = (polygon: Vec[]) => polygon.reduce((sum, p, i) => sum + cross(p, polygon[(i + 1) % polygon.length]!), 0) / 2;

  let walks: number[][] = [];
  for (let guard = 0; guard <= edges.length; guard++) {
    // Free ends carry no area: peel them off, however long the chain.
    for (let again = true; again; ) {
      again = false;
      const degree = new Array<number>(nodes.length).fill(0);
      edges.forEach((e, i) => {
        if (alive[i]) {
          degree[e.a]!++;
          degree[e.b]!++;
        }
      });
      edges.forEach((e, i) => {
        if (alive[i] && (degree[e.a] === 1 || degree[e.b] === 1)) {
          alive[i] = false;
          again = true;
        }
      });
    }
    const around: number[][] = nodes.map(() => []);
    for (let h = 0; h < edges.length * 2; h++) if (alive[h >> 1]) around[origin(h)]!.push(h);
    for (const list of around) {
      const key = new Map(list.map((h) => [h, direction(h)]));
      list.sort((x, y) => {
        const [dx, dy] = [key.get(x)!, key.get(y)!];
        return Math.abs(dx.angle - dy.angle) > EPS ? dx.angle - dy.angle : dx.curvature - dy.curvature;
      });
    }
    // Next piece of a boundary: at the end of h, the one just clockwise of the way back, so the area stays on the left.
    const next = (h: number): number => {
      const list = around[target(h)]!;
      return list[(list.indexOf(h ^ 1) - 1 + list.length) % list.length]!;
    };
    walks = [];
    const done = new Set<number>();
    for (let h = 0; h < edges.length * 2; h++) {
      if (!alive[h >> 1] || done.has(h)) continue;
      const walk: number[] = [];
      for (let at = h; !done.has(at); at = next(at)) {
        done.add(at);
        walk.push(at);
      }
      walks.push(walk);
    }
    // A piece walked in both directions inside one boundary is a bridge between two shapes: it bounds no area.
    const bridges = new Set<number>();
    for (const walk of walks) {
      const inWalk = new Set(walk);
      for (const h of walk) if (inWalk.has(h ^ 1)) bridges.add(h >> 1);
    }
    if (bridges.size === 0) break;
    for (const e of bridges) alive[e] = false;
  }

  const cycles: Cycle[] = [];
  for (const walk of walks) {
    // The outer boundary of each connected shape is walked clockwise: only counter-clockwise walks are areas.
    if (signedArea(pointsOf(walk)) <= MIN_AREA) continue;
    cycles.push({
      start: nodes[origin(walk[0]!)]!,
      steps: walk.map((h): CycleStep => {
        const e = edges[h >> 1]!;
        const to = nodes[target(h)]!;
        return e.kind === "line" ? { kind: "line", to } : { kind: "arc", to, center: e.c, radius: e.r, reversed: h % 2 === 1 };
      }),
    });
  }

  let open: Vec | null = null;
  if (cycles.length === 0 && circles.length === 0 && prims.length > 0) {
    const degree = new Array<number>(nodes.length).fill(0);
    for (const e of edges) {
      degree[e.a]!++;
      degree[e.b]!++;
    }
    open = nodes[degree.findIndex((d) => d === 1)] ?? nodes[0] ?? null;
  }
  return { cycles, circles, open };
}
