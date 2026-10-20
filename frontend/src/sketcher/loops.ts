/**
 * Closed-loop extraction from the solved (non-construction) curves of a
 * sketch, and the regions they bound. Nested loops follow the even–odd rule
 * (a loop inside another is a hole, an island inside a hole is material
 * again). Pure geometry: used by the kernel (profiles.ts) and by the editor
 * for profile selection and extrusion previews.
 */
import type { SketchGeometry, SketchPoint } from "../document/sketch";
import { ORIGIN } from "../document/sketch";

/** Points closer than this (mm) are the same vertex. */
export const VERTEX_TOLERANCE = 1e-6;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

type Vec = [number, number];

interface Segment {
  curveId: string;
  kind: "line" | "arc";
  from: number;
  to: number;
  /** Arc only: centre and radius (always counter-clockwise from `from` to `to` in the model). */
  center?: Vec;
  radius?: number;
}

/** Exact description of a loop, enough to rebuild it in the B-rep kernel. */
export type LoopShape =
  | { kind: "circle"; center: Vec; radius: number }
  | { kind: "chain"; start: Vec; steps: ({ kind: "line"; to: Vec } | { kind: "arc"; to: Vec; mid: Vec })[] };

export interface Loop {
  /** Polyline approximation used for containment, area and display. */
  polygon: Vec[];
  area: number;
  shape: LoopShape;
}

class UnionFind {
  private parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(i: number): number {
    while (this.parent[i] !== i) i = this.parent[i] = this.parent[this.parent[i] as number] as number;
    return i;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

function signedArea(polygon: Vec[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i] as Vec;
    const [x2, y2] = polygon[(i + 1) % polygon.length] as Vec;
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function pointInPolygon([x, y]: Vec, polygon: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as Vec;
    const [xj, yj] = polygon[j] as Vec;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Counter-clockwise sweep from angle a to angle b, in (0, 2π]. */
function ccwSweep(a: number, b: number): number {
  const sweep = (b - a) % (2 * Math.PI);
  return sweep <= 0 ? sweep + 2 * Math.PI : sweep;
}

function arcPoints(center: Vec, radius: number, from: Vec, to: Vec, reversed: boolean, samples = 16): Vec[] {
  const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const a1 = Math.atan2(to[1] - center[1], to[0] - center[0]);
  // The model arc runs CCW from its start to its end; walking it backwards is CW.
  const sweep = reversed ? -ccwSweep(a1, a0) : ccwSweep(a0, a1);
  const out: Vec[] = [];
  for (let i = 1; i <= samples; i++) {
    const t = a0 + (sweep * i) / samples;
    out.push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
  }
  return out;
}

export function extractLoops(geometry: SketchGeometry): Loop[] {
  const points = new Map<string, SketchPoint>(geometry.points.map((p) => [p.id, p]));
  points.set(ORIGIN, { id: ORIGIN, x: 0, y: 0 });
  const coord = (id: string): Vec => {
    const p = points.get(id);
    if (!p) throw new ProfileError(`Point « ${id} » introuvable.`);
    return [p.x, p.y];
  };

  const loops: Loop[] = [];
  const uf = new UnionFind();
  const nodeOf = new Map<string, number>();
  const nodePos: Vec[] = [];
  const node = (pointId: string): number => {
    const existing = nodeOf.get(pointId);
    if (existing !== undefined) return existing;
    const pos = coord(pointId);
    const index = uf.add();
    nodePos.push(pos);
    nodeOf.set(pointId, index);
    // Merge with any vertex at the same position (coincident after solving).
    nodePos.forEach((other, i) => {
      if (i !== index && Math.hypot(other[0] - pos[0], other[1] - pos[1]) <= VERTEX_TOLERANCE) uf.union(index, i);
    });
    return index;
  };

  const segments: Segment[] = [];
  for (const curve of geometry.curves) {
    if (curve.construction) continue;
    if (curve.kind === "circle") {
      const center = coord(curve.center);
      const r = curve.radius;
      const polygon = Array.from({ length: 64 }, (_, i): Vec => {
        const t = (i / 64) * 2 * Math.PI;
        return [center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)];
      });
      loops.push({ polygon, area: Math.PI * r * r, shape: { kind: "circle", center, radius: r } });
      continue;
    }
    const [a, b] = curve.kind === "line" ? [curve.p1, curve.p2] : [curve.start, curve.end];
    const from = node(a);
    const to = node(b);
    if (uf.find(from) === uf.find(to)) throw new ProfileError(`La courbe « ${curve.id} » a une longueur nulle.`);
    segments.push(
      curve.kind === "line"
        ? { curveId: curve.id, kind: "line", from, to }
        : { curveId: curve.id, kind: "arc", from, to, center: coord(curve.center), radius: curve.radius },
    );
  }

  // Every vertex of a closed profile joins exactly two curves.
  const incident = new Map<number, number[]>();
  segments.forEach((s, i) => {
    for (const end of [uf.find(s.from), uf.find(s.to)]) incident.set(end, [...(incident.get(end) ?? []), i]);
  });
  for (const [vertex, list] of incident) {
    if (list.length !== 2) {
      const [x, y] = nodePos[vertex] as Vec;
      const where = `(${x.toFixed(3)} ; ${y.toFixed(3)})`;
      throw new ProfileError(
        list.length === 1 ? `Profil ouvert au point ${where}.` : `Profil ramifié au point ${where} (${list.length} courbes).`,
      );
    }
  }

  const used = new Set<number>();
  segments.forEach((_, start) => {
    if (used.has(start)) return;
    const chain: { segment: Segment; reversed: boolean }[] = [];
    let current = start;
    let vertex = uf.find((segments[start] as Segment).from);
    const first = vertex;
    do {
      const segment = segments[current] as Segment;
      used.add(current);
      const reversed = uf.find(segment.from) !== vertex;
      chain.push({ segment, reversed });
      vertex = uf.find(reversed ? segment.from : segment.to);
      const next = (incident.get(vertex) ?? []).find((i) => i !== current);
      if (next === undefined) break;
      current = next;
    } while (vertex !== first);

    const vertexPos = (s: Segment, end: "start" | "end", reversed: boolean): Vec => {
      const id = (end === "start") !== reversed ? s.from : s.to;
      return nodePos[uf.find(id)] as Vec;
    };
    const polygon: Vec[] = [];
    for (const { segment, reversed } of chain) {
      const from = vertexPos(segment, "start", reversed);
      const to = vertexPos(segment, "end", reversed);
      if (segment.kind === "line") polygon.push(to);
      else polygon.push(...arcPoints(segment.center as Vec, segment.radius as number, from, to, reversed));
    }
    const head = chain[0] as (typeof chain)[0];
    loops.push({
      polygon,
      area: Math.abs(signedArea(polygon)),
      shape: {
        kind: "chain",
        start: vertexPos(head.segment, "start", head.reversed),
        steps: chain.map(({ segment, reversed }) => {
          const from = vertexPos(segment, "start", reversed);
          const to = vertexPos(segment, "end", reversed);
          if (segment.kind === "line") return { kind: "line" as const, to };
          const mid = arcPoints(segment.center as Vec, segment.radius as number, from, to, reversed, 2)[0] as Vec;
          return { kind: "arc" as const, to, mid };
        }),
      },
    });
  });
  return loops;
}

/** Nesting depth of each loop (number of larger loops containing it). */
export function loopDepths(loops: Loop[]): number[] {
  return loops.map((loop, i) => {
    const probe = loop.polygon[0] as Vec;
    return loops.filter((other, j) => j !== i && other.area > loop.area && pointInPolygon(probe, other.polygon)).length;
  });
}

/** A material region: an outer loop minus the loops directly inside it. */
export interface Region {
  outer: Vec[];
  holes: Vec[][];
  /** Index of the outer loop in the loop list. */
  loop: number;
}

/** A bounded area of the sketch: a loop minus the loops directly inside it, at any nesting depth. */
export interface SketchFace extends Region {
  /** Number of loops that contain this one (even: material by the even–odd rule). */
  depth: number;
  /** Indices of the loops directly inside (the holes of this area). */
  children: number[];
}

/**
 * Every bounded area of the sketch, like the profiles a desktop CAD tool lets
 * you pick: the frame between two nested rectangles and the area inside the
 * inner one are two different faces.
 */
export function sketchFaces(loops: Loop[]): SketchFace[] {
  const depth = loopDepths(loops);
  return loops.map((loop, i) => {
    const d = depth[i] as number;
    const children = loops.flatMap((inner, j) =>
      depth[j] === d + 1 && inner.area < loop.area && pointInPolygon(inner.polygon[0] as Vec, loop.polygon) ? [j] : [],
    );
    return { outer: loop.polygon, holes: children.map((j) => (loops[j] as Loop).polygon), loop: i, depth: d, children };
  });
}

/** Material regions by the even–odd rule (what an extrusion without a chosen area uses). */
export function regions(loops: Loop[]): Region[] {
  return sketchFaces(loops).filter((face) => face.depth % 2 === 0);
}

/** Index of the innermost loop containing `p`, or -1: the face a point selects. */
export function loopAt(loops: Loop[], p: Vec): number {
  let best = -1;
  loops.forEach((loop, i) => {
    if (pointInPolygon(p, loop.polygon) && (best < 0 || loop.area < (loops[best] as Loop).area)) best = i;
  });
  return best;
}

/** A point strictly inside the face (not in a hole), used to refer to it from a feature. */
export function interiorPoint(face: Region): Vec {
  const rings = [face.outer, ...face.holes];
  const ys = face.outer.map((p) => p[1]);
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  let best: { width: number; point: Vec } | null = null;
  for (const t of [0.5, 0.37, 0.63, 0.25, 0.75, 0.13, 0.87]) {
    const y = lo + t * (hi - lo);
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] as Vec;
        const [xj, yj] = ring[j] as Vec;
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    }
    xs.sort((a, b) => a - b);
    // Between the 1st and 2nd crossing, the 3rd and 4th… the line is inside the face.
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const width = (xs[k + 1] as number) - (xs[k] as number);
      if (!best || width > best.width) best = { width, point: [((xs[k] as number) + (xs[k + 1] as number)) / 2, y] };
    }
  }
  return best ? best.point : centroid(face.outer);
}

/** Area-weighted centroid of a polygon. */
export function centroid(polygon: Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i] as Vec;
    const [x2, y2] = polygon[(i + 1) % polygon.length] as Vec;
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-12) return polygon[0] ?? [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}
