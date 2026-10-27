/**
 * Choosing a closed area of the sketch (a profile) by clicking inside it: the smallest area under the pointer, and the
 * curves that make up its boundary (what the click selects). Pure geometry on the sketch.
 */
import type { SketchCurve, SketchGeometry } from "../document/sketch";
import { pointPos, type Vec2 } from "./edit";
import { pointInPolygon, type Region } from "./loops";

/** Samples closer than this (mm) to a boundary are on it. */
const ON_BOUNDARY = 1e-4;

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const l2 = d[0] * d[0] + d[1] * d[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
}

function distanceToBoundary(p: Vec2, polygon: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) best = Math.min(best, segmentDistance(p, polygon[i] as Vec2, polygon[(i + 1) % polygon.length] as Vec2));
  return best;
}

const area = (polygon: Vec2[]): number => Math.abs(polygon.reduce((s, p, i) => s + p[0] * (polygon[(i + 1) % polygon.length] as Vec2)[1] - (polygon[(i + 1) % polygon.length] as Vec2)[0] * p[1], 0)) / 2;

/** The smallest closed area containing the point (not in one of its holes), or null. */
export function regionAt(regions: Region[], p: Vec2): Region | null {
  const inside = regions.filter((r) => pointInPolygon(p, r.outer) && !r.holes.some((h) => pointInPolygon(p, h)));
  return inside.sort((a, b) => area(a.outer) - area(b.outer))[0] ?? null;
}

/** Points along a curve (ends included), to test whether it runs along a boundary. */
function samples(g: SketchGeometry, curve: SketchCurve, n = 9): Vec2[] {
  if (curve.kind === "line") {
    const [a, b] = [pointPos(g, curve.p1), pointPos(g, curve.p2)];
    return Array.from({ length: n }, (_, i): Vec2 => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);
  }
  const c = pointPos(g, curve.center);
  const [from, to] = curve.kind === "circle" ? [0, 2 * Math.PI] : [curve.startAngle, curve.endAngle <= curve.startAngle ? curve.endAngle + 2 * Math.PI : curve.endAngle];
  return Array.from({ length: n }, (_, i): Vec2 => [c[0] + curve.radius * Math.cos(from + ((to - from) * i) / (n - 1)), c[1] + curve.radius * Math.sin(from + ((to - from) * i) / (n - 1))]);
}

/** The curves that run along the boundary of the area (outer outline and holes), construction left out. */
export function boundaryCurves(g: SketchGeometry, region: Region): string[] {
  const outlines = [region.outer, ...region.holes];
  return g.curves
    .filter((c) => !c.construction && !c.projected)
    .filter((c) => samples(g, c).filter((s) => outlines.some((o) => distanceToBoundary(s, o) <= ON_BOUNDARY)).length >= 2)
    .map((c) => c.id);
}
