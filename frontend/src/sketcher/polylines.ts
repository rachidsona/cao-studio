/**
 * Curves of a sketch as polylines in sketch coordinates, for drawing the
 * sketch in the 3D view when it is not being edited. Construction geometry and
 * curves projected from a body are left out: they only guide the drawing.
 */
import type { SketchGeometry } from "../document/sketch";
import { pointPos, type Vec2 } from "./edit";

const CIRCLE_SEGMENTS = 96;
const ARC_SEGMENTS = 48;

export function sketchPolylines(g: SketchGeometry): Vec2[][] {
  const lines: Vec2[][] = [];
  for (const curve of g.curves) {
    if (curve.construction || curve.projected) continue;
    if (curve.kind === "line") {
      lines.push([pointPos(g, curve.p1), pointPos(g, curve.p2)]);
      continue;
    }
    const [cx, cy] = pointPos(g, curve.center);
    const [from, to, segments] = curve.kind === "circle" ? [0, 2 * Math.PI, CIRCLE_SEGMENTS] : [curve.startAngle, curve.endAngle, ARC_SEGMENTS];
    const points: Vec2[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = from + ((to - from) * i) / segments;
      points.push([cx + curve.radius * Math.cos(t), cy + curve.radius * Math.sin(t)]);
    }
    lines.push(points);
  }
  return lines;
}
