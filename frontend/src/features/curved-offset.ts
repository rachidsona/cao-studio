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
  // The whole side of a cylinder has no straight edge to keep away from: only its two rims.
  if (whole(f)) return along;
  const around = f.radius * Math.min(a - f.a0, f.a1 - a);
  return Math.min(along, around);
}

/** The offset outline on the face, as segments (arcs as short pieces); null when `d` leaves nothing. */
export function curvedOutline(f: CurvedFace, d: number): [Vec3, Vec3][] | null {
  const [b0, b1] = whole(f) ? [f.a0, f.a1] : [f.a0 + d / f.radius, f.a1 - d / f.radius];
  const [s0, s1] = [f.s0 + d, f.s1 - d];
  if (!(d > 0) || b1 - b0 < 1e-3 || s1 - s0 < 1e-3) return null;
  const steps = Math.max(4, Math.ceil((b1 - b0) / (Math.PI / 32)));
  const out: [Vec3, Vec3][] = [];
  for (const s of [s0, s1]) for (let k = 0; k < steps; k++) out.push([onFace(f, s, b0 + ((b1 - b0) * k) / steps), onFace(f, s, b0 + ((b1 - b0) * (k + 1)) / steps)]);
  if (!whole(f)) for (const a of [b0, b1]) out.push([onFace(f, s0, a), onFace(f, s1, a)]);
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
  return whole(f) ? sectorRecess(f, f.a0, f.a1, f.s0 + d, f.s1 - d, depth) : sectorRecess(f, f.a0 + d / f.radius, f.a1 - d / f.radius, f.s0 + d, f.s1 - d, depth);
}

/** The whole side of a cylinder (all round), not a piece of one. */
const whole = (f: CurvedFace) => f.a1 - f.a0 >= 2 * Math.PI - 1e-6;

/**
 * A piece of the face between the angles b0 and b1 (counter-clockwise) and the axial positions s0 and s1, dug `depth`
 * into it (raised when negative): a crown sector drawn on the plane of an end, extruded along the axis — the whole
 * ring when it goes all round (a groove round a cylinder, a collar). Or why not.
 */
export function sectorRecess(f: CurvedFace, b0: number, b1: number, s0: number, s1: number, depth: number): CurvedRecess | string {
  if (Math.abs(depth) < 0.1) return "Donnez une profondeur (négative : en relief).";
  if (depth >= f.radius) return "Plus profond que le rayon de la face.";
  if (b1 - b0 < 1e-3 || s1 - s0 < 0.1) return "Ce tracé est trop petit.";
  const [rIn, rOut] = depth > 0 ? [f.radius - depth, f.radius] : [f.radius, f.radius - depth];
  const [cu, cv] = f.center;
  const at = (r: number, a: number) => ({ x: cu + r * Math.cos(a), y: cv + r * Math.sin(a) });
  const whole = b1 - b0 >= 2 * Math.PI - 1e-6;
  const geometry: SketchGeometry = whole
    ? {
        points: [{ id: "pc", x: cu, y: cv }],
        curves: [
          { id: "co", kind: "circle", center: "pc", radius: rOut },
          { id: "ci", kind: "circle", center: "pc", radius: rIn },
        ],
        constraints: [],
      }
    : {
        points: [{ id: "pc", x: cu, y: cv }, { id: "o0", ...at(rOut, b0) }, { id: "o1", ...at(rOut, b1) }, { id: "i0", ...at(rIn, b0) }, { id: "i1", ...at(rIn, b1) }],
        curves: [
          { id: "ao", kind: "arc", center: "pc", start: "o0", end: "o1", radius: rOut, startAngle: b0, endAngle: b1 },
          { id: "ai", kind: "arc", center: "pc", start: "i0", end: "i1", radius: rIn, startAngle: b0, endAngle: b1 },
          { id: "l0", kind: "line", p1: "o0", p2: "i0" },
          { id: "l1", kind: "line", p1: "o1", p2: "i1" },
        ],
        constraints: [],
      };
  // XZ looks towards −Y: its sketch starts at the high end and goes down.
  const plane = PLANES[f.axis];
  return { plane, offset: f.axis === 1 ? -s1 : s0, geometry, distance: s1 - s0, operation: depth > 0 ? "cut" : "join" };
}

/** Where a point of the face is on it: its axial position and its angle, from a0 on (counter-clockwise). */
export function facePlace(f: CurvedFace, p: Vec3): { s: number; a: number } {
  const [u, v] = UV[f.axis];
  let a = Math.atan2(p[v]! - f.center[1], p[u]! - f.center[0]);
  while (a < f.a0) a += 2 * Math.PI;
  while (a >= f.a0 + 2 * Math.PI) a -= 2 * Math.PI;
  return { s: p[f.axis]!, a };
}

/** The outward normal of the face at angle a (model axes). */
export function faceNormal(f: CurvedFace, a: number): Vec3 {
  const n: Vec3 = [0, 0, 0];
  const [u, v] = UV[f.axis];
  n[u] = Math.cos(a);
  n[v] = Math.sin(a);
  return n;
}

/**
 * A circle drawn on the face, of `radius` round the point (s, a), dug `depth` into it as a hole bored towards the axis
 * (raised when negative: a boss): drawn on the plane tangent to the face there, from just outside it. Or why not.
 */
export function curvedCircle(f: CurvedFace, s: number, a: number, radius: number, depth: number): { frame: { origin: Vec3; xDir: Vec3; normal: Vec3 }; geometry: SketchGeometry; startOffset: number; distance: number; operation: "cut" | "join" } | string {
  if (!(radius > 0.5)) return "Ce cercle est trop petit.";
  if (radius >= f.radius) return "Ce cercle est plus large que la face courbe.";
  if (Math.abs(depth) < 0.1) return "Donnez une profondeur (négative : en relief).";
  if (depth >= 2 * f.radius) return "Plus profond que la face courbe.";
  const normal = faceNormal(f, a);
  const xDir: Vec3 = [0, 0, 0];
  xDir[f.axis] = 1;
  // Where the face falls away from the tangent plane at the circle's rim.
  const sag = f.radius - Math.sqrt(f.radius * f.radius - radius * radius);
  const geometry: SketchGeometry = { points: [{ id: "pc", x: 0, y: 0 }], curves: [{ id: "c", kind: "circle", center: "pc", radius }], constraints: [] };
  const frame = { origin: onFace(f, s, a), xDir, normal };
  // A hole: from just outside the face down to `depth` under its middle; a boss: from under its rim up to -depth.
  return depth > 0 ? { frame, geometry, startOffset: 1, distance: -(depth + 1), operation: "cut" } : { frame, geometry, startOffset: -sag - 0.5, distance: -depth + sag + 0.5, operation: "join" };
}

/** The whole side of a cylinder of axis X, Y or Z, from its two end circles; null otherwise. */
export function cylinderOf(circles: { center: Vec3; radius: number }[]): CurvedFace | null {
  if (circles.length !== 2) return null;
  const [e, g] = circles as [(typeof circles)[0], (typeof circles)[0]];
  const dir = [0, 1, 2].map((i) => g.center[i]! - e.center[i]!);
  const axis = [0, 1, 2].reduce((m, i) => (Math.abs(dir[i]!) > Math.abs(dir[m]!) ? i : m), 0) as 0 | 1 | 2;
  const length = Math.hypot(...dir);
  if (length < 1 || [0, 1, 2].some((i) => i !== axis && Math.abs(dir[i]!) > 1e-3 * length) || Math.abs(e.radius - g.radius) > 1e-3) return null;
  const [u, v] = UV[axis];
  const [s0, s1] = [e.center[axis]!, g.center[axis]!].sort((x, y) => x - y) as [number, number];
  return { axis, center: [e.center[u]!, e.center[v]!], radius: e.radius, a0: 0, a1: 2 * Math.PI, s0, s1 };
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
