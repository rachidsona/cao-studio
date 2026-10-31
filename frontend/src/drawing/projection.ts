/**
 * Le dessin d'une vue de la mise en plan : les arêtes du modèle vues dans une direction quelconque (face, côté,
 * dessus, isométrique…), les cachées en pointillés, les cercles reconnus (pour les cotes de diamètre), et pour une
 * coupe ce qui reste derrière le plan de coupe avec ses faces coupées à hachurer. Le test des lignes cachées passe par
 * une grille des triangles : seuls ceux de la case du point sont regardés. Pur.
 */
import type { V3, Vec2, ViewSpec } from "./model";

export interface MeshInput {
  id: string;
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Edge segments, six numbers each (two end points). */
  edges: ArrayLike<number>;
  /** Vertex ranges of `edges` per B-rep edge (to recognise circles). */
  edgeGroups?: { start: number; count: number }[];
}

export interface DrawnLine {
  a: Vec2;
  b: Vec2;
  hidden: boolean;
  /** The body it is an edge of (for the balloons). */
  body?: string;
}

export interface ViewGeometry {
  lines: DrawnLine[];
  /** Circles and arcs seen square (holes, rounds): centre and radius in the view's frame. */
  circles: { center: Vec2; radius: number }[];
  /** End points of the edges and centres of the circles (what dimensions snap to). */
  points: Vec2[];
  /** Section: the cut faces, as closed loops, one list per body (hatched each its own way). */
  hatches: Vec2[][][];
  min: Vec2;
  max: Vec2;
}

/** A cutting plane: what lies on the side of `normal` (toward the viewer) is taken away. */
export interface Cut {
  point: V3;
  normal: V3;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** A surface this much nearer to the eye (mm) hides what is behind it. */
const HIDING = 0.3;
const GRID = 48;

interface Tri {
  x: [number, number, number];
  y: [number, number, number];
  d: [number, number, number];
}

const side = (cut: Cut | null, p: V3) => (cut ? dot([p[0] - cut.point[0], p[1] - cut.point[1], p[2] - cut.point[2]], cut.normal) : -1);

/** The part of a triangle behind the cutting plane (0, 1 or 2 triangles). */
function clipTriangle(t: V3[], cut: Cut | null): V3[][] {
  if (!cut) return [t];
  const s = t.map((p) => side(cut, p));
  const kept: V3[] = [];
  for (let i = 0; i < 3; i++) {
    const [p, q] = [t[i]!, t[(i + 1) % 3]!];
    const [sp, sq] = [s[i]!, s[(i + 1) % 3]!];
    if (sp <= 0) kept.push(p);
    if (sp * sq < 0) {
      const k = sp / (sp - sq);
      kept.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]);
    }
  }
  return kept.length < 3 ? [] : kept.length === 3 ? [kept] : [[kept[0]!, kept[1]!, kept[2]!], [kept[0]!, kept[2]!, kept[3]!]];
}

/** The triangles seen from the view, in buckets of a grid over the drawing (for the hidden-line test). */
class Depth {
  private cells: Tri[][] = [];
  private min: Vec2 = [Infinity, Infinity];
  private size: Vec2 = [1, 1];

  constructor(tris: Tri[]) {
    for (const t of tris) {
      this.min = [Math.min(this.min[0], ...t.x), Math.min(this.min[1], ...t.y)];
      this.size = [Math.max(this.size[0], ...t.x), Math.max(this.size[1], ...t.y)];
    }
    this.size = [Math.max(1e-6, this.size[0] - this.min[0]), Math.max(1e-6, this.size[1] - this.min[1])];
    this.cells = Array.from({ length: GRID * GRID }, () => []);
    for (const t of tris) {
      const [i0, i1] = [this.col(Math.min(...t.x)), this.col(Math.max(...t.x))];
      const [j0, j1] = [this.row(Math.min(...t.y)), this.row(Math.max(...t.y))];
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.cells[j * GRID + i]!.push(t);
    }
  }

  private col(x: number): number {
    return Math.max(0, Math.min(GRID - 1, Math.floor(((x - this.min[0]) / this.size[0]) * GRID)));
  }

  private row(y: number): number {
    return Math.max(0, Math.min(GRID - 1, Math.floor(((y - this.min[1]) / this.size[1]) * GRID)));
  }

  /** True when a surface lies in front of the point (x, y, depth d). */
  covered(x: number, y: number, d: number): boolean {
    for (const t of this.cells[this.row(y) * GRID + this.col(x)]!) {
      const det = (t.y[1] - t.y[2]) * (t.x[0] - t.x[2]) + (t.x[2] - t.x[1]) * (t.y[0] - t.y[2]);
      if (Math.abs(det) < 1e-12) continue;
      const l0 = ((t.y[1] - t.y[2]) * (x - t.x[2]) + (t.x[2] - t.x[1]) * (y - t.y[2])) / det;
      const l1 = ((t.y[2] - t.y[0]) * (x - t.x[2]) + (t.x[0] - t.x[2]) * (y - t.y[2])) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < 1e-6 || l1 < 1e-6 || l2 < 1e-6) continue;
      if (l0 * t.d[0] + l1 * t.d[1] + l2 * t.d[2] > d + HIDING) return true;
    }
    return false;
  }
}

/** A circle through three points (null when they are in line). */
function circleThrough(p: Vec2, q: Vec2, r: Vec2): { center: Vec2; radius: number } | null {
  const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
  if (Math.abs(d) < 1e-9) return null;
  const s = (v: Vec2) => v[0] * v[0] + v[1] * v[1];
  const cx = (s(p) * (q[1] - r[1]) + s(q) * (r[1] - p[1]) + s(r) * (p[1] - q[1])) / d;
  const cy = (s(p) * (r[0] - q[0]) + s(q) * (p[0] - r[0]) + s(r) * (q[0] - p[0])) / d;
  return { center: [cx, cy], radius: Math.hypot(p[0] - cx, p[1] - cy) };
}

/** Joins segments end to end into closed loops (the outlines of a cut face). */
function loops(segments: [Vec2, Vec2][]): Vec2[][] {
  const key = (p: Vec2) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  const next = new Map<string, Vec2[]>();
  for (const [a, b] of segments) {
    if (key(a) === key(b)) continue;
    next.set(key(a), [...(next.get(key(a)) ?? []), b]);
    next.set(key(b), [...(next.get(key(b)) ?? []), a]);
  }
  const used = new Set<string>();
  const out: Vec2[][] = [];
  for (const [a, b] of segments) {
    const edge = (p: Vec2, q: Vec2) => [key(p), key(q)].sort().join("|");
    if (used.has(edge(a, b)) || key(a) === key(b)) continue;
    const loop: Vec2[] = [a];
    let [prev, at] = [a, b];
    used.add(edge(a, b));
    for (let guard = 0; guard < 100000 && key(at) !== key(a); guard++) {
      loop.push(at);
      const go = (next.get(key(at)) ?? []).find((n) => !used.has(edge(at, n)) && key(n) !== key(prev));
      if (!go) break;
      used.add(edge(at, go));
      [prev, at] = [at, go];
    }
    if (loop.length >= 3) out.push(loop);
  }
  return out;
}

/** The drawing of the meshes seen along `spec`, optionally cut by a plane. */
export function projectSpec(meshes: readonly MeshInput[], spec: ViewSpec, showHidden = true, cut: Cut | null = null): ViewGeometry {
  const to2 = (p: V3): Vec2 => [dot(p, spec.right), dot(p, spec.up)];
  const depth = (p: V3) => dot(p, spec.toViewer);
  const vertex = (m: MeshInput, i: number): V3 => [m.vertices[i * 3]!, m.vertices[i * 3 + 1]!, m.vertices[i * 3 + 2]!];
  const tris: Tri[] = [];
  const hatches: Vec2[][][] = [];
  const hatchBodies: string[] = [];
  for (const m of meshes) {
    const cutSegments: [Vec2, Vec2][] = [];
    for (let i = 0; i + 2 < m.indices.length; i += 3) {
      const t = [0, 1, 2].map((k) => vertex(m, m.indices[i + k]!));
      for (const piece of clipTriangle(t, cut)) {
        const p2 = piece.map(to2);
        tris.push({ x: [p2[0]![0], p2[1]![0], p2[2]![0]], y: [p2[0]![1], p2[1]![1], p2[2]![1]], d: [depth(piece[0]!), depth(piece[1]!), depth(piece[2]!)] });
      }
      if (cut) {
        // Where the triangle crosses the plane: a piece of the outline of the cut face.
        const s = t.map((p) => side(cut, p));
        const cross: V3[] = [];
        for (let k = 0; k < 3; k++) {
          const [p, q, sp, sq] = [t[k]!, t[(k + 1) % 3]!, s[k]!, s[(k + 1) % 3]!];
          if (sp * sq < 0) {
            const f = sp / (sp - sq);
            cross.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]);
          }
        }
        if (cross.length === 2) cutSegments.push([to2(cross[0]!), to2(cross[1]!)]);
      }
    }
    if (cutSegments.length) {
      hatches.push(loops(cutSegments));
      hatchBodies.push(m.id);
    }
  }
  const grid = new Depth(tris);
  const found = new Map<string, DrawnLine>();
  const circles: ViewGeometry["circles"] = [];
  const points: Vec2[] = [];
  const key = (n: number) => Math.round(n * 100);
  const addPoint = (p: Vec2) => {
    if (!points.some((q) => Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01)) points.push(p);
  };
  for (const m of meshes) {
    const groups = m.edgeGroups ?? [{ start: 0, count: m.edges.length / 3 }];
    for (const g of groups) {
      const run: V3[] = [];
      for (let v = g.start; v < g.start + g.count; v++) run.push([m.edges[v * 3]!, m.edges[v * 3 + 1]!, m.edges[v * 3 + 2]!]);
      // The edge clipped by the cutting plane: its segments behind it.
      const segments: [V3, V3][] = [];
      for (let i = 0; i + 1 < run.length; i += 2) {
        let [a, b] = [run[i]!, run[i + 1]!];
        const [sa, sb] = [side(cut, a), side(cut, b)];
        if (sa > 0 && sb > 0) continue;
        if (sa > 0 || sb > 0) {
          const f = sa / (sa - sb);
          const x: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
          if (sa > 0) a = x;
          else b = x;
        }
        segments.push([a, b]);
      }
      if (!segments.length) continue;
      // A curved edge lying square to the view: a circle or an arc, kept for the diameter dimensions.
      if (segments.length >= 3) {
        const ds = segments.flatMap(([a, b]) => [depth(a), depth(b)]);
        const flat = Math.max(...ds) - Math.min(...ds) < 0.05;
        const pts = segments.map(([a]) => to2(a));
        const c = flat ? circleThrough(pts[0]!, pts[Math.floor(pts.length / 2)]!, pts.at(-1)!) : null;
        if (c && c.radius > 0.05 && pts.every((p) => Math.abs(Math.hypot(p[0] - c.center[0], p[1] - c.center[1]) - c.radius) < c.radius * 0.02 + 0.01)) {
          if (!circles.some((o) => Math.hypot(o.center[0] - c.center[0], o.center[1] - c.center[1]) < 0.01 && Math.abs(o.radius - c.radius) < 0.01)) circles.push(c);
          addPoint(c.center);
        }
      }
      addPoint(to2(segments[0]![0]));
      addPoint(to2(segments.at(-1)![1]));
      for (const [a, b] of segments) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const parts = Math.max(1, Math.min(48, Math.ceil(length / 8)));
        const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        let runStart = 0;
        let state: boolean | null = null;
        const flush = (end: number, hidden: boolean) => {
          const line: DrawnLine = { a: to2(at(runStart / parts)), b: to2(at(end / parts)), hidden, body: m.id };
          if (Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]) < 0.01 || (hidden && !showHidden)) return;
          const id = [`${key(line.a[0])},${key(line.a[1])}`, `${key(line.b[0])},${key(line.b[1])}`].sort().join("|");
          const known = found.get(id);
          if (!known || (known.hidden && !hidden)) found.set(id, line);
        };
        for (let k = 0; k < parts; k++) {
          const mid = at((k + 0.5) / parts);
          const [x, y] = to2(mid);
          const hidden = grid.covered(x, y, depth(mid));
          if (state === null) state = hidden;
          else if (hidden !== state) {
            flush(k, state);
            runStart = k;
            state = hidden;
          }
        }
        if (state !== null) flush(parts, state);
      }
    }
  }
  // The outlines of the cut faces are drawn too.
  const lines = [...found.values()];
  hatches.forEach((body, k) => {
    for (const loop of body) loop.forEach((p, i) => lines.push({ a: p, b: loop[(i + 1) % loop.length]!, hidden: false, body: hatchBodies[k] }));
  });
  const xs = lines.flatMap((l) => [l.a[0], l.b[0]]);
  const ys = lines.flatMap((l) => [l.a[1], l.b[1]]);
  return { lines, circles, points, hatches, min: [Math.min(...xs, 0), Math.min(...ys, 0)], max: [Math.max(...xs, 0), Math.max(...ys, 0)] };
}

/** A detail: the drawing of a view inside a circle (lines clipped to it, circles kept when inside). */
export function cropCircle(view: ViewGeometry, center: Vec2, radius: number): ViewGeometry {
  const inside = (p: Vec2) => Math.hypot(p[0] - center[0], p[1] - center[1]) <= radius + 1e-9;
  const lines: DrawnLine[] = [];
  for (const l of view.lines) {
    // Where the segment a + t (b − a) crosses the circle.
    const [dx, dy] = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
    const [fx, fy] = [l.a[0] - center[0], l.a[1] - center[1]];
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;
    const disc = B * B - 4 * A * C;
    if (A < 1e-12 || disc < 0) continue;
    const t0 = Math.max(0, (-B - Math.sqrt(disc)) / (2 * A));
    const t1 = Math.min(1, (-B + Math.sqrt(disc)) / (2 * A));
    if (t1 <= t0) continue;
    lines.push({ a: [l.a[0] + dx * t0, l.a[1] + dy * t0], b: [l.a[0] + dx * t1, l.a[1] + dy * t1], hidden: l.hidden });
  }
  const pts = lines.flatMap((l) => [l.a, l.b]);
  return {
    lines,
    circles: view.circles.filter((c) => inside(c.center) && Math.hypot(c.center[0] - center[0], c.center[1] - center[1]) + c.radius <= radius + 1e-6),
    points: view.points.filter(inside),
    hatches: [],
    min: [Math.min(...pts.map((p) => p[0]), center[0] - radius), Math.min(...pts.map((p) => p[1]), center[1] - radius)],
    max: [Math.max(...pts.map((p) => p[0]), center[0] + radius), Math.max(...pts.map((p) => p[1]), center[1] + radius)],
  };
}
