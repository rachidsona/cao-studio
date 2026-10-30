/**
 * The Curic tools on sketches (pure geometry, no kernel): where a sketch is
 * in the model (its box), a mirror copy across a plane perpendicular to an
 * axis, and a stretch across such a plane (the points beyond it move, the
 * lines crossing it get longer). Dimensions are measured again on the result,
 * so the sketch stays solvable as it is.
 */
import { isDimension, type SketchGeometry } from "../document/sketch";
import type { Axis, SketchFeature, Vec3 } from "../document/types";
import type { Box } from "../features/curic";
import { measure, pointPos, type Vec2 } from "./edit";
import { frameOf, toSketch, toWorld } from "./frame";
import { sketchCurves } from "./polylines";

const EPS = 1e-6;

/** Box of the sketch's drawn curves (and points) in model coordinates, or null when it draws nothing. */
export function sketchBox(sketch: SketchFeature): Box | null {
  const frame = frameOf(sketch);
  const points: Vec2[] = [...sketchCurves(sketch).flatMap((c) => c.points)];
  if (points.length === 0) points.push(...sketch.points.map((p): Vec2 => [p.x, p.y]));
  if (points.length === 0) return null;
  const world = points.map(([x, y]) => toWorld(frame, x, y));
  return [
    [0, 1, 2].map((i) => Math.min(...world.map((w) => w[i] as number))) as Vec3,
    [0, 1, 2].map((i) => Math.max(...world.map((w) => w[i] as number))) as Vec3,
  ];
}

/** How an axis lies in the sketch: along its normal, along u (x), along v (y), or slanted (not handled). */
function axisInSketch(sketch: SketchFeature, axis: Axis): { kind: "normal" | "u" | "v"; sign: number } | null {
  const { u, v, normal } = frameOf(sketch);
  for (const [kind, dir] of [["normal", normal], ["u", u], ["v", v]] as const) {
    if (Math.abs(Math.abs(dir[axis] as number) - 1) < EPS) return { kind, sign: dir[axis] as number };
  }
  return null;
}

/** Where the sketch's plane crosses `axis`, its normal (model coordinate, mm). */
const planeCoord = (sketch: SketchFeature, axis: Axis) => frameOf(sketch).origin[axis] as number;

/** The sketch with its plane moved to the coordinate `w` along `axis`, its normal (`sign`: the normal's direction). */
function atCoord(sketch: SketchFeature, axis: Axis, sign: number, w: number): SketchFeature {
  if (!sketch.frame) return { ...sketch, offset: Number((w * sign).toFixed(6)) };
  const origin = [...sketch.frame.origin] as Vec3;
  origin[axis] = Number(w.toFixed(6));
  return { ...sketch, frame: { ...sketch.frame, origin } };
}

/** Dimensions measured again (the geometry changed on purpose): driving ones stay satisfied. */
function remeasure(g: SketchGeometry): SketchGeometry["constraints"] {
  return g.constraints.map((c) => (isDimension(c) ? { ...c, value: Number(measure(g, c).toFixed(6)) } : c));
}

/** Arcs drawn the right way round again after a flip: start and end swapped, angles from the points. */
function reorientArcs(g: SketchGeometry): SketchGeometry["curves"] {
  return g.curves.map((c) => {
    if (c.kind !== "arc") return c;
    const centre = pointPos(g, c.center);
    const angle = (id: string) => {
      const p = pointPos(g, id);
      return Math.atan2(p[1] - centre[1], p[0] - centre[0]);
    };
    return { ...c, start: c.end, end: c.start, startAngle: angle(c.end), endAngle: angle(c.start) };
  });
}

/**
 * Mirror copy of a sketch across the plane perpendicular to `axis` at `position`: on a parallel plane when the
 * axis is its normal, flipped inside its plane otherwise. Null when the axis is slanted to the sketch.
 */
export function mirrorSketch(sketch: SketchFeature, axis: Axis, position: number, id: string, name: string): SketchFeature | null {
  const where = axisInSketch(sketch, axis);
  if (!where) return null;
  const { support: _support, offsets: _offsets, ...rest } = sketch;
  if (where.kind === "normal") return { ...atCoord(rest as SketchFeature, axis, where.sign, 2 * position - planeCoord(sketch, axis)), id, name };
  const origin = frameOf(sketch).origin[axis] as number;
  const k = where.kind === "u" ? 0 : 1;
  // x' such that origin + x'·s = 2p − (origin + x·s)
  const flip = (value: number) => Number(((2 * position - 2 * origin) * where.sign - value).toFixed(6));
  const points = sketch.points.map((p) => (k === 0 ? { ...p, x: flip(p.x) } : { ...p, y: flip(p.y) }));
  const constraints = sketch.constraints.map((c) => (c.kind === "fix" ? (k === 0 ? { ...c, x: flip(c.x) } : { ...c, y: flip(c.y) }) : c));
  const moved: SketchGeometry = { points, curves: sketch.curves, constraints };
  const g: SketchGeometry = { ...moved, curves: reorientArcs(moved) };
  return { ...rest, id, name, ...g, constraints: remeasure(g) };
}

/**
 * Stretch of a sketch across the plane perpendicular to `axis` at `position`: what lies beyond the plane moves by
 * `distance` along the axis (the whole sketch when the axis is its normal). Null when nothing moves.
 */
export function stretchSketch(sketch: SketchFeature, axis: Axis, position: number, distance: number): SketchFeature | null {
  const where = axisInSketch(sketch, axis);
  if (!where || Math.abs(distance) < EPS) return null;
  if (where.kind === "normal") {
    const w = planeCoord(sketch, axis);
    return w > position + EPS ? atCoord(sketch, axis, where.sign, w + distance) : null;
  }
  const origin = frameOf(sketch).origin[axis] as number;
  const k = where.kind === "u" ? 0 : 1;
  const beyond = (value: number) => origin + value * where.sign > position + EPS;
  const step = distance * where.sign;
  let moved = false;
  const points = sketch.points.map((p) => {
    const value = k === 0 ? p.x : p.y;
    if (!beyond(value)) return p;
    moved = true;
    return k === 0 ? { ...p, x: Number((p.x + step).toFixed(6)) } : { ...p, y: Number((p.y + step).toFixed(6)) };
  });
  if (!moved) return null;
  const constraints = sketch.constraints.map((c) => {
    if (c.kind !== "fix" || !beyond(k === 0 ? c.x : c.y)) return c;
    return k === 0 ? { ...c, x: c.x + step } : { ...c, y: c.y + step };
  });
  const g: SketchGeometry = { points, curves: sketch.curves, constraints };
  return { ...sketch, points, constraints: remeasure(g) };
}

/**
 * Rotation of a sketch by `angle` degrees around the axis parallel to `axis` through `center`, when that axis is
 * the sketch's normal (the sketch turns in its plane). Horizontal and vertical constraints swap on a quarter turn
 * and are dropped for any other angle (they could no longer hold). Null when the axis lies in the sketch plane.
 */
export function rotateSketch(sketch: SketchFeature, axis: Axis, angle: number, center: Vec3): SketchFeature | null {
  const where = axisInSketch(sketch, axis);
  if (!where || where.kind !== "normal") return null;
  const frame = frameOf(sketch);
  const [cx, cy] = toSketch(frame, center);
  const theta = ((angle * Math.PI) / 180) * where.sign;
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
  const turn = (x: number, y: number): [number, number] => [Number((cx + (x - cx) * cos - (y - cy) * sin).toFixed(6)), Number((cy + (x - cx) * sin + (y - cy) * cos).toFixed(6))];
  const quarter = Math.round(angle / 90);
  const square = Math.abs(angle - quarter * 90) < 1e-9;
  const points = sketch.points.map((p) => {
    const [x, y] = turn(p.x, p.y);
    return { ...p, x, y };
  });
  const curves = sketch.curves.map((c) => (c.kind === "arc" ? { ...c, startAngle: c.startAngle + theta, endAngle: c.endAngle + theta } : c));
  const constraints = sketch.constraints.flatMap((c): SketchGeometry["constraints"] => {
    if (c.kind === "fix") {
      const [x, y] = turn(c.x, c.y);
      return [{ ...c, x, y }];
    }
    if (c.kind !== "horizontal" && c.kind !== "vertical") return [c];
    if (!square) return [];
    return [quarter % 2 === 0 ? c : { ...c, kind: c.kind === "horizontal" ? "vertical" : "horizontal" }];
  });
  const g: SketchGeometry = { points, curves, constraints };
  return { ...sketch, points, curves, constraints: remeasure(g) };
}
