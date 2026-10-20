/**
 * Sketch on a body face: the sketch plane is taken from the face, and the
 * face boundary (outer and inner loops) is projected into the sketch as fixed
 * reference geometry, so new lines can snap onto the body's corners and edges
 * (drawing over them reproduces the body's exact dimensions).
 *
 * Sketch planes are the three principal planes with an offset, so only faces
 * parallel to them are supported.
 */
import type { SketchCurve, SketchGeometry, SketchPoint } from "../document/sketch";
import type { PlaneName, Vec3 } from "../document/types";
import type { FaceOutline } from "../geometry/protocol";
import { orientedArc } from "./arc";
import { toSketch, type SketchFrame } from "./frame";

const ALIGNED = 1 - 1e-6;
const MERGE = 1e-6;

/** Principal plane and offset of a planar face, or null when the face is inclined. */
export function planeForFace(normal: Vec3, center: Vec3): { plane: PlaneName; offset: number } | null {
  const [nx, ny, nz] = normal;
  // Offsets follow the plane conventions of frame.ts (XZ has its normal along −Y).
  if (Math.abs(nz) >= ALIGNED) return { plane: "XY", offset: center[2] };
  if (Math.abs(ny) >= ALIGNED) return { plane: "XZ", offset: -center[1] };
  if (Math.abs(nx) >= ALIGNED) return { plane: "YZ", offset: center[0] };
  return null;
}

/** Projected (fixed, construction) geometry reproducing the face boundary in the sketch. */
export function projectOutline(outline: FaceOutline, frame: SketchFrame): SketchGeometry {
  const points: SketchPoint[] = [];
  const curves: SketchCurve[] = [];
  const point2 = ([x, y]: [number, number]): string => {
    const existing = points.find((q) => Math.hypot(q.x - x, q.y - y) <= MERGE);
    if (existing) return existing.id;
    const id = `q${points.length + 1}`;
    points.push({ id, x, y, fixed: true });
    return id;
  };
  const point = (p: Vec3): string => point2(toSketch(frame, p));
  const curveId = () => `r${curves.length + 1}`;
  const flags = { construction: true, projected: true } as const;

  for (const edge of outline.edges) {
    if (edge.kind === "line") {
      const p1 = point(edge.a);
      const p2 = point(edge.b);
      if (p1 !== p2) curves.push({ id: curveId(), kind: "line", p1, p2, ...flags });
    } else if (edge.kind === "circle") {
      curves.push({ id: curveId(), kind: "circle", center: point(edge.center), radius: edge.radius, ...flags });
    } else {
      const center = point(edge.center);
      const arc = orientedArc(toSketch(frame, edge.center), toSketch(frame, edge.a), toSketch(frame, edge.mid), toSketch(frame, edge.b));
      curves.push({
        id: curveId(),
        kind: "arc",
        center,
        start: point2(arc.start),
        end: point2(arc.end),
        radius: edge.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
        ...flags,
      });
    }
  }
  return { points, curves, constraints: [] };
}
