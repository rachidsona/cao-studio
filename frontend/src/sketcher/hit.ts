/** Hit testing and snapping in sketch coordinates (tolerances in mm). */
import { AXIS_X, AXIS_Y, ORIGIN, type SketchGeometry } from "../document/sketch";
import { pointPos, type Vec2 } from "./edit";

export interface Hit {
  id: string;
  kind: "point" | "line" | "circle" | "arc";
  /** Closest position on the entity. */
  foot: Vec2;
  distance: number;
}

function onSegment(p: Vec2, a: Vec2, b: Vec2, infinite: boolean): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (!infinite) t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

function angleInArc(angle: number, start: number, end: number): boolean {
  const twoPi = 2 * Math.PI;
  const norm = (x: number) => ((x % twoPi) + twoPi) % twoPi;
  const sweep = norm(end - start) || twoPi;
  return norm(angle - start) <= sweep;
}

/** All entities within `tolerance`, points first, then by distance. */
export function hitTest(g: SketchGeometry, p: Vec2, tolerance: number, exclude: ReadonlySet<string> = new Set()): Hit[] {
  const hits: Hit[] = [];
  const dist = (q: Vec2) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  for (const point of [{ id: ORIGIN, x: 0, y: 0 }, ...g.points]) {
    if (exclude.has(point.id)) continue;
    const d = dist([point.x, point.y]);
    if (d <= tolerance) hits.push({ id: point.id, kind: "point", foot: [point.x, point.y], distance: d });
  }
  for (const curve of g.curves) {
    if (exclude.has(curve.id)) continue;
    let foot: Vec2;
    if (curve.kind === "line") {
      foot = onSegment(p, pointPos(g, curve.p1), pointPos(g, curve.p2), false);
    } else {
      const c = pointPos(g, curve.center);
      const angle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      if (curve.kind === "arc" && !angleInArc(angle, curve.startAngle, curve.endAngle)) continue;
      foot = [c[0] + curve.radius * Math.cos(angle), c[1] + curve.radius * Math.sin(angle)];
    }
    const d = dist(foot);
    if (d <= tolerance) hits.push({ id: curve.id, kind: curve.kind, foot, distance: d });
  }
  for (const [id, dir] of [[AXIS_X, [1, 0]], [AXIS_Y, [0, 1]]] as const) {
    if (exclude.has(id)) continue;
    const foot = onSegment(p, [0, 0], [dir[0], dir[1]], true);
    const d = dist(foot);
    if (d <= tolerance) hits.push({ id, kind: "line", foot, distance: d });
  }
  return hits.sort((a, b) => (a.kind === "point" ? 0 : 1) - (b.kind === "point" ? 0 : 1) || a.distance - b.distance);
}

export interface Snap {
  pos: Vec2;
  /** Existing point snapped to (reused as a shared vertex). */
  pointId?: string;
  /** Curve the position lies on (becomes a point-on-curve constraint). */
  curveId?: string;
}

export function snap(g: SketchGeometry, p: Vec2, tolerance: number, exclude: ReadonlySet<string> = new Set()): Snap {
  const [best] = hitTest(g, p, tolerance, exclude);
  if (!best) return { pos: p };
  if (best.kind === "point") return { pos: best.foot, pointId: best.id };
  return { pos: best.foot, curveId: best.id };
}

/**
 * Element a click toggles: an already selected element under the pointer wins
 * over a closer neighbour (so a second click deselects), otherwise the nearest.
 */
export function toggleTarget(hits: Hit[], selection: ReadonlySet<string>): Hit | undefined {
  return hits.find((h) => selection.has(h.id)) ?? hits[0];
}
