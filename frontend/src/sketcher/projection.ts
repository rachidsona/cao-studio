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
import type { EdgeOutline, FaceOutline } from "../geometry/protocol";
import { orientedArc } from "./arc";
import { cloneGeometry } from "./edit";
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

/**
 * Projects one body edge into a sketch as fixed reference geometry (purple, to snap on): a line stays a line; a
 * circle or an arc parallel to the sketch plane stays exact; any other edge becomes points along it joined by lines.
 * Points already there (within a micron) are reused. A reason (string) when the edge projects to a point.
 */
export function projectEdge(g: SketchGeometry, outline: EdgeOutline, frame: SketchFrame): SketchGeometry | string {
  const next: SketchGeometry = cloneGeometry(g);
  const used = new Set<string>([...next.points, ...next.curves, ...next.constraints].map((e) => e.id));
  const fresh = (prefix: string) => {
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    used.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
  const point2 = ([x, y]: [number, number]): string => {
    const existing = next.points.find((q) => q.fixed && Math.hypot(q.x - x, q.y - y) <= MERGE);
    if (existing) return existing.id;
    const id = fresh("q");
    next.points.push({ id, x: Number(x.toFixed(9)), y: Number(y.toFixed(9)), fixed: true });
    return id;
  };
  const flags = { construction: true, projected: true } as const;
  const before = next.curves.length;
  const n = frame.normal;
  const parallel = (samples: Vec3[]) => {
    const [a, b, c] = [samples[0]!, samples[Math.floor(samples.length / 3)]!, samples[Math.floor((2 * samples.length) / 3)]!];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const m = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const l = Math.hypot(...m) || 1;
    return Math.abs((m[0]! * n[0] + m[1]! * n[1] + m[2]! * n[2]) / l) >= ALIGNED;
  };
  const exactRound = outline.edges.length === 1 && outline.edges[0]!.kind !== "line" && parallel(outline.samples);
  if (outline.edges.every((e) => e.kind === "line") || exactRound) {
    const geometry = projectOutline({ surface: "PLANE", center: [0, 0, 0], normal: n, edges: outline.edges }, frame);
    // Re-number the projected entities into the sketch, reusing the points already there.
    const ids = new Map(geometry.points.map((p) => [p.id, point2([p.x, p.y])]));
    for (const c of geometry.curves) {
      const id = fresh("r");
      if (c.kind === "line") {
        const [p1, p2] = [ids.get(c.p1)!, ids.get(c.p2)!];
        if (p1 !== p2) next.curves.push({ ...c, id, p1, p2, ...flags });
      } else if (c.kind === "circle") next.curves.push({ ...c, id, center: ids.get(c.center)!, ...flags });
      else next.curves.push({ ...c, id, center: ids.get(c.center)!, start: ids.get(c.start)!, end: ids.get(c.end)!, ...flags });
    }
  } else {
    // Slanted or free curve: its points, seen along the sketch's normal, joined by lines.
    const pts = outline.samples.map((p) => point2(toSketch(frame, p)));
    for (let i = 1; i < pts.length; i++) if (pts[i] !== pts[i - 1]) next.curves.push({ id: fresh("r"), kind: "line", p1: pts[i - 1]!, p2: pts[i]!, ...flags });
  }
  return next.curves.length === before ? "Cette arête est vue de bout depuis le plan de l'esquisse : sa projection est un point." : next;
}
