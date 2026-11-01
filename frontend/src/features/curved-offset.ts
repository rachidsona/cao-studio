/**
 * Le décalage sur une face courbe (le dessus d'une voûte, un chant arrondi), en géométrie pure.
 *
 * La face est un morceau de cylindre d'axe X, Y ou Z, bordé de deux arcs et de deux droites. Son contour décalé de
 * `d` reste sur la face : à `d` de chaque arc le long de l'axe, à `d` (mesurés sur la face) de chaque droite le long
 * de l'arc. Creusé de `depth` (en relief si négatif), il donne un panneau courbe en creux (un trou s'il traverse la
 * paroi) ou en saillie : une couronne dessinée sur le plan d'un bout, extrudée le long de l'axe.
 */
import type { SketchGeometry } from "../document/sketch";
import type { PlaneName, Vec3 } from "../document/types";

/** A cylindrical face in the sketch plane of its ends: centre (u, v), radius, angles (CCW from a0 to a1), axial span. */
export interface CurvedFace {
  axis: 0 | 1 | 2;
  center: [number, number];
  radius: number;
  a0: number;
  a1: number;
  s0: number;
  s1: number;
}

/** The plane of the ends of a face of this axis (sketcher/frame.ts: YZ looks towards +X, XZ towards −Y, XY up). */
const PLANES: Record<0 | 1 | 2, PlaneName> = { 0: "YZ", 1: "XZ", 2: "XY" };
/** Model coordinates of (u, v) in that plane: which axis u and v are. */
const UV: Record<0 | 1 | 2, [number, number]> = { 0: [1, 2], 1: [0, 2], 2: [0, 1] };

/** A point of the face: at axial position s, at angle a, at radius r. */
export function onFace(f: CurvedFace, s: number, a: number, r = f.radius): Vec3 {
  const p: Vec3 = [0, 0, 0];
  const [u, v] = UV[f.axis];
  p[f.axis] = s;
  p[u] = f.center[0] + r * Math.cos(a);
  p[v] = f.center[1] + r * Math.sin(a);
  return p;
}

/** How far a point of the face is from its nearest edge, measured on the face (positive inside). */
export function curvedPointerOffset(f: CurvedFace, p: Vec3): number {
  const [u, v] = UV[f.axis];
  let a = Math.atan2(p[v]! - f.center[1], p[u]! - f.center[0]);
  while (a < f.a0) a += 2 * Math.PI;
  const along = Math.min(p[f.axis] - f.s0, f.s1 - p[f.axis]);
  const around = f.radius * Math.min(a - f.a0, f.a1 - a);
  return Math.min(along, around);
}

/** The offset outline on the face, as segments (arcs as short pieces); null when `d` leaves nothing. */
export function curvedOutline(f: CurvedFace, d: number): [Vec3, Vec3][] | null {
  const [b0, b1] = [f.a0 + d / f.radius, f.a1 - d / f.radius];
  const [s0, s1] = [f.s0 + d, f.s1 - d];
  if (!(d > 0) || b1 - b0 < 1e-3 || s1 - s0 < 1e-3) return null;
  const steps = Math.max(4, Math.ceil((b1 - b0) / (Math.PI / 32)));
  const out: [Vec3, Vec3][] = [];
  for (const s of [s0, s1]) for (let k = 0; k < steps; k++) out.push([onFace(f, s, b0 + ((b1 - b0) * k) / steps), onFace(f, s, b0 + ((b1 - b0) * (k + 1)) / steps)]);
  for (const a of [b0, b1]) out.push([onFace(f, s0, a), onFace(f, s1, a)]);
  return out;
}

export interface CurvedRecess {
  plane: PlaneName;
  offset: number;
  geometry: SketchGeometry;
  /** Along the plane's normal: the span of the panel between its two arcs. */
  distance: number;
  operation: "cut" | "join";
}

/** The panel offset by `d` on the face, dug `depth` into it (raised when negative), or why not. */
export function curvedRecess(f: CurvedFace, d: number, depth: number): CurvedRecess | string {
  if (!(d > 0)) return "Le décalage doit être positif.";
  if (!curvedOutline(f, d)) return "Ce décalage est trop grand pour la face.";
  if (Math.abs(depth) < 0.1) return "Donnez une profondeur (négative : en relief).";
  if (depth >= f.radius) return "Plus profond que le rayon de la face.";
  const [b0, b1] = [f.a0 + d / f.radius, f.a1 - d / f.radius];
  const [rIn, rOut] = depth > 0 ? [f.radius - depth, f.radius] : [f.radius, f.radius - depth];
  const [cu, cv] = f.center;
  const at = (r: number, a: number) => ({ x: cu + r * Math.cos(a), y: cv + r * Math.sin(a) });
  const geometry: SketchGeometry = {
    points: [{ id: "pc", x: cu, y: cv }, { id: "o0", ...at(rOut, b0) }, { id: "o1", ...at(rOut, b1) }, { id: "i0", ...at(rIn, b0) }, { id: "i1", ...at(rIn, b1) }],
    curves: [
      { id: "ao", kind: "arc", center: "pc", start: "o0", end: "o1", radius: rOut, startAngle: b0, endAngle: b1 },
      { id: "ai", kind: "arc", center: "pc", start: "i0", end: "i1", radius: rIn, startAngle: b0, endAngle: b1 },
      { id: "l0", kind: "line", p1: "o0", p2: "i0" },
      { id: "l1", kind: "line", p1: "o1", p2: "i1" },
    ],
    constraints: [],
  };
  const [s0, s1] = [f.s0 + d, f.s1 - d];
  // XZ looks towards −Y: its sketch starts at the high end and goes down.
  const plane = PLANES[f.axis];
  return { plane, offset: f.axis === 1 ? -s1 : s0, geometry, distance: s1 - s0, operation: depth > 0 ? "cut" : "join" };
}

/**
 * A cylindrical face from its edges read by the kernel: its two arcs (centre, ends, middle) give the axis, the
 * radius and the angles; null when it is not a piece of cylinder of axis X, Y or Z bounded by two arcs.
 */
export function curvedFaceOf(arcs: { center: Vec3; radius: number; a: Vec3; b: Vec3; mid: Vec3 }[]): CurvedFace | null {
  if (arcs.length !== 2) return null;
  const [e, g] = arcs as [(typeof arcs)[0], (typeof arcs)[0]];
  const dir = [0, 1, 2].map((i) => g.center[i]! - e.center[i]!);
  const axis = [0, 1, 2].reduce((m, i) => (Math.abs(dir[i]!) > Math.abs(dir[m]!) ? i : m), 0) as 0 | 1 | 2;
  const length = Math.hypot(...dir);
  if (length < 1 || [0, 1, 2].some((i) => i !== axis && Math.abs(dir[i]!) > 1e-3 * length) || Math.abs(e.radius - g.radius) > 1e-3) return null;
  const [u, v] = UV[axis];
  const center: [number, number] = [e.center[u]!, e.center[v]!];
  const angle = (p: Vec3) => Math.atan2(p[v]! - center[1], p[u]! - center[0]);
  const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // Counter-clockwise from one end to the other, through the middle.
  let [a0, a1] = [angle(e.a), angle(e.b)];
  if (turn(angle(e.mid) - a0) > turn(a1 - a0)) [a0, a1] = [a1, a0];
  while (a1 <= a0) a1 += 2 * Math.PI;
  const [s0, s1] = [e.center[axis]!, g.center[axis]!].sort((x, y) => x - y) as [number, number];
  return { axis, center, radius: e.radius, a0, a1, s0, s1 };
}
