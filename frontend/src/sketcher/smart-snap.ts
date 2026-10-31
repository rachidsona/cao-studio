/**
 * Where the pointer of a drawing tool lands, with the three snaps of the sketch (as the buttons of Vectric Aspire):
 * - géométrie : on a point of the sketch (reused), else on a line or a curve;
 * - intelligent : in line with a point of the sketch, a middle of a line or a point just clicked — the same x, the
 *   same y, or both — shown by dashed guides from that point;
 * - grille : on the nearest grid point (on an axis the alignment did not take).
 * Pure, in sketch coordinates (mm).
 */
import { ORIGIN, type SketchGeometry } from "../document/sketch";
import { pointPos, type Vec2 } from "./edit";
import { gridPoint, snap, type Snap } from "./hit";

export interface SnapOptions {
  tolerance: number;
  geometry: boolean;
  smart: boolean;
  /** Step of the grid snapped on (mm), null: no grid snapping. */
  grid: number | null;
  /** Points the tool has just clicked (not in the sketch yet). */
  anchors?: readonly Vec2[];
  exclude?: ReadonlySet<string>;
}

export interface PointerSnap extends Snap {
  /** Dashed guides of the smart snapping: from the point aligned with to where the pointer lands. */
  guides: [Vec2, Vec2][];
}

/** The points the smart snapping aligns with: the sketch's points and origin, the middles of its lines, the anchors. */
export function alignmentPoints(g: SketchGeometry, anchors: readonly Vec2[] = [], exclude: ReadonlySet<string> = new Set()): Vec2[] {
  const points: Vec2[] = [[0, 0]];
  for (const p of g.points) if (!exclude.has(p.id) && p.id !== ORIGIN) points.push([p.x, p.y]);
  for (const c of g.curves) {
    if (c.kind !== "line" || exclude.has(c.id) || exclude.has(c.p1) || exclude.has(c.p2)) continue;
    const [a, b] = [pointPos(g, c.p1), pointPos(g, c.p2)];
    points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return [...points, ...anchors];
}

export function pointerSnap(g: SketchGeometry, p: Vec2, o: SnapOptions): PointerSnap {
  if (o.geometry) {
    const s = snap(g, p, o.tolerance, o.exclude);
    if (s.pointId || s.curveId) return { ...s, guides: [] };
  }
  const free = o.grid ? gridPoint(p, o.grid) : p;
  if (!o.smart) return { pos: free, guides: [] };
  // On each axis, the point most nearly in line (the nearer one when two are as near).
  let vertical: Vec2 | null = null;
  let horizontal: Vec2 | null = null;
  const better = (q: Vec2, best: Vec2 | null, axis: 0 | 1) => {
    const d = Math.abs(q[axis] - p[axis]);
    if (d > o.tolerance) return false;
    if (!best) return true;
    const e = Math.abs(best[axis] - p[axis]);
    return d < e - 1e-9 || (Math.abs(d - e) <= 1e-9 && Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]));
  };
  for (const q of alignmentPoints(g, o.anchors, o.exclude)) {
    if (better(q, vertical, 0)) vertical = q;
    if (better(q, horizontal, 1)) horizontal = q;
  }
  if (!vertical && !horizontal) return { pos: free, guides: [] };
  const pos: Vec2 = [vertical ? vertical[0] : free[0], horizontal ? horizontal[1] : free[1]];
  const guides: [Vec2, Vec2][] = [];
  if (vertical && Math.abs(vertical[1] - pos[1]) > 1e-9) guides.push([vertical, pos]);
  if (horizontal && Math.abs(horizontal[0] - pos[0]) > 1e-9) guides.push([horizontal, pos]);
  return { pos, guides };
}
