/**
 * Le décalage sur tout un toit à deux pans d'un seul tenant (comme sur une voûte : features/curved-offset.ts), en
 * géométrie pure.
 *
 * Le toit court le long de X ou de Y. Sa coupe est l'égout d'un pan, le faîtage, puis l'égout de l'autre pan. Le
 * contour décalé de `d` passe par-dessus le faîtage : à `d` des deux égouts (mesurés le long des pans) et des deux
 * pignons. Creusé de `depth` sous les pans (en relief si négatif), il donne un panneau en V d'épaisseur constante : une
 * coupe dessinée sur le plan d'un pignon, extrudée le long du faîtage.
 */
import type { SketchGeometry } from "../document/sketch";
import type { PlaneName, Vec3 } from "../document/types";

type V2 = [number, number];

/** A two-sloped roof in the plane of its gables: (u, v) of its eave, ridge and other eave; axial span. */
export interface RoofFace {
  axis: 0 | 1;
  profile: [V2, V2, V2];
  s0: number;
  s1: number;
}

const PLANES: Record<0 | 1, PlaneName> = { 0: "YZ", 1: "XZ" };
const UV: Record<0 | 1, [number, number]> = { 0: [1, 2], 1: [0, 2] };

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];
const unit = (a: V2): V2 => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** A point of the section at axial position s, in the model. */
export function roofPoint(f: RoofFace, s: number, p: V2): Vec3 {
  const out: Vec3 = [0, 0, 0];
  const [u, v] = UV[f.axis];
  out[f.axis] = s;
  out[u] = p[0];
  out[v] = p[1];
  return out;
}

/**
 * The roof a slanted face belongs to: its edges along the axis (the higher one the ridge, the lower one the eave),
 * the other eave at the same height on the far side of the body's box. Null when the face is not such a slope.
 */
export function roofOf(lines: { a: Vec3; b: Vec3 }[], body: [Vec3, Vec3]): RoofFace | null {
  const along = lines.filter((l) => Math.hypot(...l.a.map((x, i) => x - l.b[i]!)) > 1);
  for (const axis of [0, 1] as const) {
    const parallel = along.filter((l) => [0, 1, 2].every((i) => i === axis || Math.abs(l.a[i]! - l.b[i]!) < 1e-3));
    if (parallel.length !== 2) continue;
    const [low, high] = [...parallel].sort((p, q) => p.a[2] - q.a[2]) as [(typeof parallel)[0], (typeof parallel)[0]];
    if (high.a[2] - low.a[2] < 1) continue;
    const [u] = UV[axis];
    const eave: V2 = [low.a[u]!, low.a[2]];
    const ridge: V2 = [high.a[u]!, high.a[2]];
    // The other eave: on the far side of the ridge, at the edge of the body, as high as this one.
    const far = eave[0] < ridge[0] ? body[1][u]! : body[0][u]!;
    if (Math.abs(far - ridge[0]) < 1) continue;
    const ends = [low.a[axis]!, low.b[axis]!].sort((x, y) => x - y) as [number, number];
    return { axis, profile: [eave, ridge, [far, eave[1]]], s0: ends[0], s1: ends[1] };
  }
  return null;
}

/** Along each slope from its eave: the points `d` up the slopes, and the slopes' lengths. */
function slopes(f: RoofFace, d: number) {
  const [e1, r, e2] = f.profile;
  const [l1, l2] = [Math.hypot(...sub(r, e1)), Math.hypot(...sub(r, e2))];
  return { l1, l2, p1: add(e1, unit(sub(r, e1)), d), p2: add(e2, unit(sub(r, e2)), d) };
}

/** How far a point of the roof is from its nearest edge, measured on the roof (eaves along the slopes, gables). */
export function roofPointerOffset(f: RoofFace, p: Vec3): number {
  const [u] = UV[f.axis];
  const [e1, r, e2] = f.profile;
  // Up the slope it is on, from its eave.
  const onFirst = (p[u]! - r[0]) * (e1[0] - r[0]) > 0;
  const [e, top] = onFirst ? [e1, r] : [e2, r];
  const t = Math.abs(p[u]! - e[0]) / Math.abs(top[0] - e[0]);
  const up = t * Math.hypot(...sub(top, e));
  return Math.min(up, p[f.axis]! - f.s0, f.s1 - p[f.axis]!);
}

/** The offset outline on the roof, as segments; null when `d` leaves nothing. */
export function roofOutline(f: RoofFace, d: number): [Vec3, Vec3][] | null {
  const { l1, l2, p1, p2 } = slopes(f, d);
  const [s0, s1] = [f.s0 + d, f.s1 - d];
  if (!(d > 0) || d >= l1 || d >= l2 || s1 - s0 < 1e-3) return null;
  const r = f.profile[1];
  const out: [Vec3, Vec3][] = [];
  for (const s of [s0, s1]) out.push([roofPoint(f, s, p1), roofPoint(f, s, r)], [roofPoint(f, s, r), roofPoint(f, s, p2)]);
  for (const q of [p1, p2]) out.push([roofPoint(f, s0, q), roofPoint(f, s1, q)]);
  return out;
}

export interface RoofRecess {
  plane: PlaneName;
  offset: number;
  geometry: SketchGeometry;
  distance: number;
  operation: "cut" | "join";
}

/** The panel offset by `d` over the whole roof, dug `depth` under the slopes (raised when negative), or why not. */
export function roofRecess(f: RoofFace, d: number, depth: number): RoofRecess | string {
  if (!(d > 0)) return "Le décalage doit être positif.";
  if (!roofOutline(f, d)) return "Ce décalage est trop grand pour le toit.";
  if (Math.abs(depth) < 0.1) return "Donnez une profondeur (négative : en relief).";
  const [e1, r, e2] = f.profile;
  const { p1, p2 } = slopes(f, d);
  // Into the roof: the normal of each slope towards the inside (the side of the other eave from it).
  const inward = (a: V2, b: V2, other: V2): V2 => {
    const t = unit(sub(b, a));
    const n: V2 = [-t[1], t[0]];
    return (other[0] - a[0]) * n[0] + (other[1] - a[1]) * n[1] > 0 ? n : [-n[0], -n[1]];
  };
  const [n1, n2] = [inward(e1, r, e2), inward(e2, r, e1)];
  const q1 = add(p1, n1, depth);
  const q2 = add(p2, n2, depth);
  // Where the two slopes shifted by `depth` meet: under (or over) the ridge.
  const [a, da] = [add(e1, n1, depth), unit(sub(r, e1))];
  const [b, db] = [add(e2, n2, depth), unit(sub(r, e2))];
  const den = da[0] * db[1] - da[1] * db[0];
  if (Math.abs(den) < 1e-9) return "Ce toit est plat.";
  const k = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
  const q = add(a, da, k);
  const ring: V2[] = [p1, r, p2, q2, q, q1];
  if (depth > 0 && Math.hypot(...sub(q, r)) >= Math.hypot(...sub(r, p1))) return "Plus profond que le toit.";
  const ids = ring.map((_, i) => `r${i + 1}`);
  const geometry: SketchGeometry = {
    points: ring.map((p, i) => ({ id: ids[i]!, x: p[0], y: p[1] })),
    curves: ids.map((id, i) => ({ id: `rl${i + 1}`, kind: "line" as const, p1: id, p2: ids[(i + 1) % ids.length]! })),
    constraints: [],
  };
  const [s0, s1] = [f.s0 + d, f.s1 - d];
  // XZ looks towards −Y: its sketch starts at the high end and goes down.
  return { plane: PLANES[f.axis], offset: f.axis === 1 ? -s1 : s0, geometry, distance: s1 - s0, operation: depth > 0 ? "cut" : "join" };
}
