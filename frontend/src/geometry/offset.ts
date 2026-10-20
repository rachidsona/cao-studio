/**
 * Planar offset of sketch paths with OpenCascade (BRepOffsetAPI_MakeOffset),
 * through replicad. Pure geometry: no DOM, no document; it runs in the
 * geometry worker and in Node tests.
 *
 * Sign convention, `distance` in mm:
 *  - closed path (circle, closed chain): positive = outside, negative = inside;
 *  - open chain: positive = left of the travel direction, negative = right
 *    (the kernel's own side for an open wire is not fixed, so it is verified).
 *
 * Results are trimmed by the kernel (corners, self-intersections); each result
 * curve is then checked to lie at the requested distance from its source, so
 * a piece that the kernel could not trim correctly is dropped, never returned.
 */
import { assembleWire, cast, getOC, makeCircle, makeLine, makeThreePointArc, type Edge } from "replicad";
import { GeometryError, assertKernelReady } from "./kernel";

export type Vec2 = [number, number];

export type OffsetStep = { kind: "line"; to: Vec2 } | { kind: "arc"; to: Vec2; mid: Vec2 };

/** A path of the sketch: a full circle, or a chain of lines and arcs (open or closed). */
export type OffsetPath =
  | { kind: "circle"; center: Vec2; radius: number }
  | { kind: "chain"; start: Vec2; steps: OffsetStep[]; closed: boolean };

/** Result curve; arcs are given by their two ends and a middle point. */
export type OffsetCurve =
  | { kind: "line"; a: Vec2; b: Vec2 }
  | { kind: "circle"; center: Vec2; radius: number }
  | { kind: "arc"; center: Vec2; radius: number; a: Vec2; b: Vec2; mid: Vec2 };

/** Corner treatment: rounded (arc around the corner) or sharp (edges extended to meet). */
export type OffsetJoin = "round" | "sharp";

export interface OffsetOutcome {
  curves: OffsetCurve[];
  /** Non-fatal remarks (pieces dropped because they were not at the requested distance). */
  warnings: string[];
}

const TOLERANCE = 1e-6;
/** A result curve is accepted when it is at least this fraction of |distance| from the source. */
const DISTANCE_SLACK = 1e-3;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const z3 = (p: Vec2): [number, number, number] => [p[0], p[1], 0];

// ---- distance from a point to a source path (validation of the result) ----------

function circleCentre(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] ** 2 + a[1] ** 2;
  const b2 = b[0] ** 2 + b[1] ** 2;
  const c2 = c[0] ** 2 + c[1] ** 2;
  return [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d];
}

interface Nearest {
  distance: number;
  /** +1 = left of the travel direction, -1 = right, 0 = on the path or at an end. */
  side: number;
}

const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const sign = (v: number) => (Math.abs(v) < TOLERANCE ? 0 : Math.sign(v));

function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Nearest {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  const offset = sub(p, [a[0] + t * ab[0], a[1] + t * ab[1]]);
  return { distance: len(offset), side: sign(cross(ab, offset) / (len(ab) || 1)) };
}

function nearestOnArc(p: Vec2, a: Vec2, mid: Vec2, b: Vec2): Nearest {
  const centre = circleCentre(a, mid, b);
  if (!centre) {
    const first = nearestOnSegment(p, a, mid);
    const second = nearestOnSegment(p, mid, b);
    return first.distance <= second.distance ? first : second;
  }
  const radius = len(sub(a, centre));
  const angle = (q: Vec2) => Math.atan2(q[1] - centre[1], q[0] - centre[0]);
  const twoPi = 2 * Math.PI;
  const norm = (x: number) => ((x % twoPi) + twoPi) % twoPi;
  // The arc is walked from a to b through mid, counter-clockwise or not.
  const ccw = norm(angle(mid) - angle(a)) <= norm(angle(b) - angle(a));
  const sweep = ccw ? norm(angle(b) - angle(a)) : norm(angle(a) - angle(b));
  const from = ccw ? angle(a) : angle(b);
  if (norm(angle(p) - from) <= sweep) {
    const k = len(sub(p, centre)) - radius; // > 0 outside the circle
    // Outside is to the right of a counter-clockwise walk, to the left of a clockwise one.
    return { distance: Math.abs(k), side: sign(ccw ? -k : k) };
  }
  const first = nearestOnSegment(p, a, a);
  const last = nearestOnSegment(p, b, b);
  return first.distance <= last.distance ? { ...first, side: 0 } : { ...last, side: 0 };
}

function nearestOnPath(p: Vec2, path: OffsetPath): Nearest {
  if (path.kind === "circle") return { distance: Math.abs(len(sub(p, path.center)) - path.radius), side: 0 };
  let best: Nearest = { distance: Infinity, side: 0 };
  let from = path.start;
  for (const step of path.steps) {
    const found = step.kind === "line" ? nearestOnSegment(p, from, step.to) : nearestOnArc(p, from, step.mid, step.to);
    if (found.distance < best.distance) best = found;
    from = step.to;
  }
  return best;
}

// ---- conversion kernel → curves -------------------------------------------------

function vec2(v: { x: number; y: number }): Vec2 {
  return [v.x, v.y];
}

function toCurves(edges: Edge[]): OffsetCurve[] {
  const curves: OffsetCurve[] = [];
  for (const edge of edges) {
    if (edge.length < TOLERANCE) continue;
    if (edge.geomType === "LINE") {
      curves.push({ kind: "line", a: vec2(edge.startPoint), b: vec2(edge.endPoint) });
    } else if (edge.geomType === "CIRCLE") {
      const at = (t: number) => vec2(edge.pointAt(t));
      const closed = edge.isClosed;
      const centre = circleCentre(at(0), at(closed ? 1 / 3 : 0.5), at(closed ? 2 / 3 : 1));
      if (!centre) continue;
      const radius = len(sub(at(0), centre));
      curves.push(closed ? { kind: "circle", center: centre, radius } : { kind: "arc", center: centre, radius, a: at(0), b: at(1), mid: at(0.5) });
    } else {
      // Other curves do not occur with arc/intersection joins on lines and arcs; keep a polyline.
      const steps = 16;
      for (let i = 0; i < steps; i++) curves.push({ kind: "line", a: vec2(edge.pointAt(i / steps)), b: vec2(edge.pointAt((i + 1) / steps)) });
    }
  }
  return curves;
}

function sampleOf(curve: OffsetCurve): Vec2[] {
  if (curve.kind === "line") return [[(curve.a[0] + curve.b[0]) / 2, (curve.a[1] + curve.b[1]) / 2]];
  if (curve.kind === "arc") return [curve.mid];
  return [[curve.center[0] + curve.radius, curve.center[1]], [curve.center[0] - curve.radius, curve.center[1]]];
}

// ---- straight chains (no plane for the kernel to work in) -----------------------

function straightOffset(path: Extract<OffsetPath, { kind: "chain" }>, distance: number): OffsetCurve[] | null {
  if (path.closed || path.steps.some((s) => s.kind !== "line")) return null;
  const points = [path.start, ...path.steps.map((s) => s.to)];
  const first = points[0] as Vec2;
  const last = points.at(-1) as Vec2;
  const dir = sub(last, first);
  const total = len(dir);
  if (total < TOLERANCE) return null;
  if (points.some((p) => Math.abs((p[0] - first[0]) * dir[1] - (p[1] - first[1]) * dir[0]) / total > TOLERANCE)) return null;
  // Left of the travel direction is positive.
  const shift: Vec2 = [(-dir[1] / total) * distance, (dir[0] / total) * distance];
  return points.slice(1).map((p, i): OffsetCurve => {
    const a = points[i] as Vec2;
    return { kind: "line", a: [a[0] + shift[0], a[1] + shift[1]], b: [p[0] + shift[0], p[1] + shift[1]] };
  });
}

// ---- kernel call ----------------------------------------------------------------

function buildWire(path: OffsetPath) {
  if (path.kind === "circle") return assembleWire([makeCircle(path.radius, z3(path.center), [0, 0, 1])]);
  const edges: Edge[] = [];
  let from = path.start;
  for (const step of path.steps) {
    if (len(sub(step.to, from)) < TOLERANCE) continue;
    edges.push(step.kind === "line" ? makeLine(z3(from), z3(step.to)) : makeThreePointArc(z3(from), z3(step.mid), z3(step.to)));
    from = step.to;
  }
  if (edges.length === 0) throw new GeometryError("Le chemin à décaler est de longueur nulle.");
  return assembleWire(edges);
}

/** Raw kernel call; `value` is the kernel's own signed distance (its side for an open wire is not fixed). */
function kernelOffset(path: OffsetPath, value: number, join: OffsetJoin): Edge[] {
  const oc = getOC();
  const open = path.kind === "chain" && !path.closed;
  const wire = buildWire(path);
  const kind = join === "round" ? oc.GeomAbs_JoinType.GeomAbs_Arc : oc.GeomAbs_JoinType.GeomAbs_Intersection;
  const offsetter = new oc.BRepOffsetAPI_MakeOffset(wire.wrapped, kind, open);
  try {
    offsetter.Perform(value, 0);
    const shape = offsetter.Shape();
    if (shape.IsNull()) return [];
    return cast(shape).edges;
  } catch {
    // The kernel throws when the offset curve vanishes (distance larger than the shape allows).
    return [];
  } finally {
    offsetter.delete();
  }
}

/**
 * Offsets one path. Returns the curves at `distance` from it (several pieces
 * when an inward offset splits the shape), or throws a GeometryError.
 */
function offsetPath(path: OffsetPath, distance: number, join: OffsetJoin): OffsetOutcome {
  const warnings: string[] = [];
  if (path.kind === "circle" && path.radius + distance < TOLERANCE) {
    throw new GeometryError("Le décalage fait disparaître le cercle : la distance dépasse son rayon.");
  }
  let curves = path.kind === "chain" ? straightOffset(path, distance) : null;
  if (!curves) {
    curves = toCurves(kernelOffset(path, distance, join));
    if (path.kind === "chain" && !path.closed && curves.length > 0) {
      // For an open wire the kernel picks the side from the normal it infers for the wire's plane:
      // check where the result landed and redo the other way when it is not on the requested side.
      const side = curves.reduce((sum, c) => sum + sampleOf(c).reduce((s, p) => s + nearestOnPath(p, path).side, 0), 0);
      if (side * Math.sign(distance) < 0) curves = toCurves(kernelOffset(path, -distance, join));
    }
  }
  if (curves.length === 0) {
    throw new GeometryError("Le décalage ne donne aucune géométrie : la distance est trop grande pour cette forme.");
  }
  const limit = Math.abs(distance) * (1 - DISTANCE_SLACK) - TOLERANCE;
  const valid = curves.filter((curve) => sampleOf(curve).every((p) => nearestOnPath(p, path).distance >= limit));
  if (valid.length === 0) {
    throw new GeometryError("Le décalage est invalide : la forme se recoupe elle-même à cette distance.");
  }
  if (valid.length < curves.length) {
    warnings.push(`${curves.length - valid.length} morceau(x) invalide(s) écarté(s) (auto-intersection).`);
  }
  return { curves: valid, warnings };
}

/** Offsets every path by the same signed distance. */
export function offsetPaths(paths: OffsetPath[], distance: number, join: OffsetJoin = "round"): OffsetOutcome {
  assertKernelReady();
  if (!Number.isFinite(distance) || Math.abs(distance) < TOLERANCE) throw new GeometryError("La distance de décalage doit être différente de zéro.");
  if (paths.length === 0) throw new GeometryError("Sélectionnez au moins une ligne, un arc ou un cercle.");
  const out: OffsetOutcome = { curves: [], warnings: [] };
  for (const path of paths) {
    const result = offsetPath(path, distance, join);
    out.curves.push(...result.curves);
    out.warnings.push(...result.warnings);
  }
  return out;
}
