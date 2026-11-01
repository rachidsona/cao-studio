/**
 * Closed areas of a sketch, and the nesting of their boundaries. The curves
 * are first cut where they cross or touch (arrangement.ts), so shapes that
 * share an edge, overlap, or are split by a line give separate areas. Loops
 * nested in another follow the even–odd rule (a loop inside another is a
 * hole, an island inside a hole is material again). Pure geometry: used by
 * the kernel (profiles.ts) and by the editor for profile selection and
 * extrusion previews.
 */
import type { SketchGeometry } from "../document/sketch";
import { arrange, type Cycle } from "./arrangement";

export { ProfileError } from "./arrangement";
import { ProfileError } from "./arrangement";

/** Points closer than this (mm) are the same vertex. */
export const VERTEX_TOLERANCE = 1e-6;

type Vec = [number, number];

/** Exact description of a loop, enough to rebuild it in the B-rep kernel. */
export type LoopShape =
  | { kind: "circle"; center: Vec; radius: number }
  | { kind: "chain"; start: Vec; steps: ({ kind: "line"; to: Vec } | { kind: "arc"; to: Vec; mid: Vec })[] };

export interface Loop {
  /** Polyline approximation used for containment, area and display. */
  polygon: Vec[];
  area: number;
  shape: LoopShape;
  /** A point strictly inside the loop (never on its boundary): what containment is tested with. */
  probe: Vec;
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

function loopOfCycle(cycle: Cycle): Loop {
  const polygon: Vec[] = [];
  const steps: Extract<LoopShape, { kind: "chain" }>["steps"] = [];
  let from = cycle.start;
  for (const step of cycle.steps) {
    if (step.kind === "line") {
      polygon.push(step.to);
      steps.push({ kind: "line", to: step.to });
    } else {
      polygon.push(...arcPoints(step.center, step.radius, from, step.to, step.reversed));
      steps.push({ kind: "arc", to: step.to, mid: arcPoints(step.center, step.radius, from, step.to, step.reversed, 2)[0] as Vec });
    }
    from = step.to;
  }
  return withProbe({ polygon, area: Math.abs(signedArea(polygon)), shape: { kind: "chain", start: cycle.start, steps }, probe: cycle.start });
}

function withProbe(loop: Loop): Loop {
  return { ...loop, probe: interiorPoint({ outer: loop.polygon, holes: [], loop: -1 }) };
}

/**
 * Closed areas of the solved, non-construction curves of a sketch. Curves that
 * enclose nothing (a stray line, a free end) are ignored; when there is no
 * closed area at all and such curves exist, the profile is reported open.
 */
export function extractLoops(geometry: SketchGeometry): Loop[] {
  const arrangement = arrange(geometry);
  const loops: Loop[] = [];
  for (const { center, radius } of arrangement.circles) {
    const polygon = Array.from({ length: 64 }, (_, i): Vec => {
      const t = (i / 64) * 2 * Math.PI;
      return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
    });
    loops.push(withProbe({ polygon, area: Math.PI * radius * radius, shape: { kind: "circle", center, radius }, probe: center }));
  }
  for (const cycle of arrangement.cycles) loops.push(loopOfCycle(cycle));
  if (loops.length === 0 && arrangement.open) {
    const [x, y] = arrangement.open;
    throw new ProfileError(`Profil ouvert au point (${x.toFixed(3)} ; ${y.toFixed(3)}).`);
  }
  return loops;
}

/** Nesting depth of each loop (number of larger loops containing it). */
export function loopDepths(loops: Loop[]): number[] {
  return loops.map((loop, i) => {
    return loops.filter((other, j) => j !== i && other.area > loop.area && pointInPolygon(loop.probe, other.polygon)).length;
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
      depth[j] === d + 1 && inner.area < loop.area && pointInPolygon(inner.probe, loop.polygon) ? [j] : [],
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

/**
 * A sketch drawn with lines only, without any closed area (a wall drawn as one stroke): Extruder has nothing to push,
 * its lines become boards instead (Panneaux).
 */
export function strokesOnly(geometry: SketchGeometry & { texts?: unknown[] }): boolean {
  if (geometry.texts?.length || !geometry.curves.some((c) => c.kind !== "circle" && !c.construction)) return false;
  try {
    return sketchFaces(extractLoops(geometry)).length === 0;
  } catch {
    return true;
  }
}
