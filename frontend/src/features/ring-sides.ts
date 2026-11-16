/**
 * « Séparer les côtés » : un corps déjà creux — un cadre, un caisson sans fond, tout contour fermé à trou extrudé
 * (triangle, rectangle, polygone, de biais, côtés droits ou courbes) — séparé en ses côtés, chacun un corps. Les côtés se rejoignent en
 * onglet (le joint sur la bissectrice de chaque coin) ou bout à bout : les plus longs traversent (deux côtés
 * voisins ne traversent jamais tous les deux), les autres s'arrêtent contre eux ; deux côtés qui ne traversent ni
 * l'un ni l'autre se rejoignent en onglet. Le contour se lit sur la face du dessus du corps (son contour extérieur et
 * son trou ; autant de coins l'un que l'autre, chaque coin du contour va avec le coin du trou le plus proche : la paroi
 * peut être d'épaisseur inégale ; sinon — un contour à encoches vidé —, la séparation suit la forme : ring-follow.ts) ;
 * chaque côté est le corps coupé par son prisme, sur toute la hauteur.
 * ringWalls est le calcul pur, dans le plan de cette face.
 */
import { basicFaceExtrusion, makePolygon, measureArea, Vector, type Face, type Shape3D } from "replicad";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { followWalls } from "./ring-follow";

export type P2 = [number, number];
type P3 = [number, number, number];

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const area = (poly: readonly P2[]) => poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]!), 0) / 2;
const near = (a: P2, b: P2) => len(sub(a, b)) < 1e-6;

/** One outline of a ring: its corners, and between two corners its side, as points (two for a straight side). */
export interface Outline {
  corners: P2[];
  /** `sides[k]` runs from corners[k] to corners[k + 1] (both included). */
  sides: P2[][];
}

/** A polygon as an outline of straight sides. */
export const polygon = (points: readonly P2[]): Outline => ({ corners: [...points], sides: points.map((p, k) => [p, points[(k + 1) % points.length]!]) });

/** The outline turning counter-clockwise. */
function ccw(o: Outline): Outline {
  const all = o.sides.flatMap((side) => side.slice(0, -1));
  if (area(all) >= 0) return o;
  const n = o.corners.length;
  // Reversed: corner k becomes corner n − k, side k (from k to k+1) the side from n−k−1 to n−k, read backwards.
  return { corners: o.corners.map((_, k) => o.corners[(n - k) % n]!), sides: o.sides.map((_, k) => [...o.sides[(2 * n - k - 1) % n]!].reverse()) };
}

const unit = (d: P2): P2 => {
  const l = len(d) || 1;
  return [d[0] / l, d[1] / l];
};
const lengthOf = (side: P2[]) => side.slice(1).reduce((sum, p, i) => sum + len(sub(p, side[i]!)), 0);

/** Where the ray from `p` along `d` first meets the side (its segment index and the point), forwards only. */
function hit(p: P2, d: P2, side: P2[]): { seg: number; at: P2 } | null {
  let best: { seg: number; at: P2; t: number } | null = null;
  for (let s = 0; s + 1 < side.length; s++) {
    const [a, b] = [side[s]!, side[s + 1]!];
    const e = sub(b, a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(sub(a, p), e) / den;
    const u = cross(sub(a, p), d) / den;
    if (t > -1e-9 && u > -1e-9 && u < 1 + 1e-9 && (!best || t < best.t)) best = { seg: s, at: [p[0] + d[0] * t, p[1] + d[1] * t], t };
  }
  return best ? { seg: best.seg, at: best.at } : null;
}

/** The joint at a corner: where the split from the inner corner meets the outside — on the corner, or on the side
 * before or after it, in its segment `seg`. */
type Split = { at: P2; on: "corner" | "previous" | "next"; seg: number };

/**
 * The sides of a ring, as polygons in its plane: `outer` and `inner` its two outlines (any turning sense, straight or
 * curved sides, the same number of corners; a side of the hole need not be parallel to its side of the outline). A
 * string: why the ring cannot be split so. `widen`: each wall pushed out of the ring by that much — along its joints
 * at the ends, square to its faces elsewhere —, so a boolean meets none of the body's faces edge-on.
 */
export function ringWalls(outerIn: Outline | readonly P2[], innerIn: Outline | readonly P2[], joint: "miter" | "butt", widen = 0, pass?: { mode: "sides" | "boards"; up: P2 }): P2[][] | string {
  const outer = ccw("corners" in outerIn ? outerIn : polygon(outerIn));
  const inner0 = ccw("corners" in innerIn ? innerIn : polygon(innerIn));
  const n = outer.corners.length;
  // Each corner of the outline with its corner of the hole: the turn of the hole that keeps them closest.
  const shift = inner0.corners.length !== n ? 0 : Array.from({ length: n }, (_, j) => j).reduce((best, j) => {
    const cost = (s: number) => outer.corners.reduce((sum, p, k) => sum + len(sub(p, inner0.corners[(k + s) % n]!)), 0);
    return cost(j) < cost(best) ? j : best;
  }, 0);
  const inner: Outline = { corners: inner0.corners.map((_, k) => inner0.corners[(k + shift) % n]!), sides: inner0.sides.map((_, k) => inner0.sides[(k + shift) % n]!) };
  const O = (k: number) => outer.corners[((k % n) + n) % n]!;
  const I = (k: number) => inner.corners[((k % n) + n) % n]!;
  const side = (o: Outline, k: number) => o.sides[((k % n) + n) % n]!;
  // Butted: the longest sides run through, never two neighbours — or first those chosen: upright (the sides) or across
  // (the top and the bottom), as the walls stand.
  const through = new Set<number>();
  const upright = (sd: P2[]) => {
    const up = pass ? unit(pass.up) : null;
    return !!up && Math.abs(dot(unit(sub(sd[sd.length - 1]!, sd[0]!)), up)) > Math.SQRT1_2;
  };
  const chosen = (sd: P2[]) => (!pass ? 0 : upright(sd) === (pass.mode === "sides") ? 0 : 1);
  if (joint === "butt") {
    for (const i of outer.sides.map((sd, i) => ({ l: lengthOf(sd), c: chosen(sd), i })).sort((a, b) => a.c - b.c || b.l - a.l || a.i - b.i).map((x) => x.i)) {
      if (!through.has((i + n - 1) % n) && !through.has((i + 1) % n)) through.add(i);
    }
  }
  // Not as many corners in the hole (a notched, rounded outline emptied: its hole is rounded at each corner going
  // in): the split follows the shape, one wall a side of the outline.
  if (n < 3 || inner0.corners.length !== n) return followWalls(outer, inner0, joint, through, widen);
  /** Whether the outline turns at corner k (not two sides meeting tangent, as a rounded corner's arc and its side). */
  const sharp = (k: number) => {
    const [a, b] = [side(outer, k - 1), side(outer, k)];
    const [t1, t2] = [unit(sub(a[a.length - 1]!, a[a.length - 2]!)), unit(sub(b[1]!, b[0]!))];
    return dot(t1, t2) < Math.cos((5 * Math.PI) / 180);
  };
  const splits: Split[] = Array.from({ length: n }, (_, k): Split => {
    const before = (k + n - 1) % n;
    // Where the sides meet tangent, nothing butts: the joint goes straight across.
    if (!sharp(k)) return { at: O(k), on: "corner", seg: 0 };
    // The side before runs through: the next one stops against its inside face (its tangent at the inner corner).
    if (through.has(before) && !through.has(k)) {
      const sd = side(inner, before);
      const at = hit(I(k), unit(sub(sd[sd.length - 1]!, sd[sd.length - 2]!)), side(outer, k));
      if (at) return { at: at.at, on: "next", seg: at.seg };
    }
    if (through.has(k) && !through.has(before)) {
      const sd = side(inner, k);
      const at = hit(I(k), unit(sub(sd[0]!, sd[1]!)), side(outer, before));
      if (at) return { at: at.at, on: "previous", seg: at.seg };
    }
    return { at: O(k), on: "corner", seg: 0 };
  });
  /**
   * A point of the wall's outline (turning counter-clockwise) pushed out of it by `widen`: its two segments moved out
   * square to themselves, the point where they meet — a sharp corner keeps its tip inside.
   */
  const pushed = (pts: P2[], k: number): P2 => {
    const [a, p, b] = [pts[k - 1]!, pts[k]!, pts[k + 1]!];
    const [d1, d2] = [unit(sub(p, a)), unit(sub(b, p))];
    const n1: P2 = [d1[1], -d1[0]];
    const n2: P2 = [d2[1], -d2[0]];
    const f = widen / Math.max(0.2, 1 + dot(n1, n2));
    return [p[0] + (n1[0] + n2[0]) * f, p[1] + (n1[1] + n2[1]) * f];
  };
  const along = (from: P2, to: P2): P2 => {
    const d = unit(sub(to, from));
    return [to[0] + d[0] * widen, to[1] + d[1] * widen];
  };
  return Array.from({ length: n }, (_, i) => {
    const j = (i + 1) % n;
    const [s, e] = [splits[i]!, splits[j]!];
    // The outside from one joint to the next.
    const out: P2[] = [];
    if (s.on === "previous") out.push(...side(outer, i - 1).slice(s.seg + 1, -1));
    const own = side(outer, i);
    const from = s.on === "next" ? s.seg + 1 : 0;
    const to = e.on === "previous" ? e.seg + 1 : own.length - 1;
    out.push(...own.slice(from, to));
    if (e.on === "next") out.push(own[own.length - 1]!, ...side(outer, j).slice(1, e.seg + 1));
    const outside = [s.at, ...out.filter((p) => !near(p, s.at)), e.at].filter((p, k, all) => k === 0 || !near(p, all[k - 1]!));
    const hole = [...side(inner, i)].reverse();
    const ends = widen ? [along(I(i), s.at), along(I(j), e.at)] : [s.at, e.at];
    const outsideWide = widen ? outside.map((p, k) => (k === 0 ? ends[0]! : k === outside.length - 1 ? ends[1]! : pushed(outside, k))) : outside;
    const holeWide = widen ? hole.map((p, k) => (k === 0 ? along(e.at, I(j)) : k === hole.length - 1 ? along(s.at, I(i)) : pushed(hole, k))) : hole;
    const poly = [...outsideWide, ...holeWide];
    return poly.filter((p, k) => !near(p, poly[(k + 1) % poly.length]!));
  });
}

/** A curved edge as points close enough that their chords stay within the widening (the chord of an arc of 5 mm). */
const STEP = 5;

/** A planar face's outline loops, each its corners and its sides as points; null when a loop does not close. */
function outlines(face: Face): P3[][][] | null {
  const out: P3[][][] = [];
  const same = (p: P3, q: P3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-5;
  for (const wire of face.wires) {
    const edges: P3[][] = wire.edges.map((edge) => {
      const pt = (t: number): P3 => {
        const v = edge.pointAt(t);
        const p: P3 = [v.x, v.y, v.z];
        v.delete();
        return p;
      };
      if (edge.geomType === "LINE") return [pt(0), pt(1)];
      const count = Math.max(4, Math.ceil(edge.length / STEP));
      return Array.from({ length: count + 1 }, (_, i) => pt(i / count));
    });
    // Chained end to end: the kernel does not turn every edge of a loop the same way.
    const chain: P3[][] = [edges[0]!];
    const left = edges.slice(1);
    while (left.length) {
      const end = chain[chain.length - 1]!.at(-1)!;
      const i = left.findIndex((e) => same(e[0]!, end) || same(e.at(-1)!, end));
      if (i < 0) return null;
      const [e] = left.splice(i, 1);
      chain.push(same(e![0]!, end) ? e! : [...e!].reverse());
    }
    // Two straight edges in line are one side.
    const straight = (e: P3[]) => e.length === 2;
    const dir = (e: P3[]) => {
      const d: P3 = [e[1]![0] - e[0]![0], e[1]![1] - e[0]![1], e[1]![2] - e[0]![2]];
      const l = Math.hypot(...d) || 1;
      return d.map((c) => c / l);
    };
    const merged: P3[][] = [];
    for (const e of chain) {
      const last = merged[merged.length - 1];
      const d1 = last && straight(last) && straight(e) ? dir(last) : null;
      const d2 = d1 ? dir(e) : null;
      if (d1 && d2 && d1[0]! * d2[0]! + d1[1]! * d2[1]! + d1[2]! * d2[2]! > 1 - 1e-9) merged[merged.length - 1] = [last![0]!, e[1]!];
      else merged.push(e);
    }
    const first = merged[0]!;
    const final = merged[merged.length - 1]!;
    if (merged.length > 1 && straight(first) && straight(final)) {
      const [d1, d2] = [dir(final), dir(first)];
      if (d1[0]! * d2[0]! + d1[1]! * d2[1]! + d1[2]! * d2[2]! > 1 - 1e-9) merged.splice(0, 1, [final[0]!, first[1]!]) && merged.pop();
    }
    out.push(merged);
  }
  return out;
}

/** The body's sides, each a solid: the ring read on its top face, cut into its sides through its whole height. */
export function splitRing(name: string, target: Shape3D, joint: "miter" | "butt", pass?: "sides" | "boards"): Shape3D[] {
  // The top: the largest flat face with a hole, and the one facing the other way at the bottom.
  const caps = target.faces
    .filter((f) => f.geomType === "PLANE" && f.wires.length === 2)
    .map((face) => {
      const c = face.center;
      const v = face.normalAt(c);
      const out = { face, area: measureArea(face), centre: [c.x, c.y, c.z] as P3, normal: [v.x, v.y, v.z] as P3 };
      return out;
    })
    .sort((a, b) => b.area - a.area);
  const top = caps[0];
  if (!top) throw new GeometryError(`${name} : ce corps n'est pas creux (aucune face à trou) ; videz-le d'abord, ou utilisez « Vider un corps ».`);
  const n = top.normal;
  const bottom = caps.find((c) => c.normal[0] * n[0] + c.normal[1] * n[1] + c.normal[2] * n[2] < -0.9999);
  const height = bottom ? (top.centre[0] - bottom.centre[0]) * n[0] + (top.centre[1] - bottom.centre[1]) * n[1] + (top.centre[2] - bottom.centre[2]) * n[2] : 0;
  if (!(height > 0.01)) throw new GeometryError(`${name} : le dessus et le dessous du corps ne se font pas face.`);
  const rings = outlines(top.face);
  if (!rings || rings.length !== 2) throw new GeometryError(`${name} : le contour du dessus du corps ne se lit pas.`);
  // The plane of the top: u along the first side of its outline, v across.
  const o = top.centre;
  const first = rings[0]![0]!;
  const e0: P3 = [first[1]![0] - first[0]![0], first[1]![1] - first[0]![1], first[1]![2] - first[0]![2]];
  const l0 = Math.hypot(...e0);
  const u: P3 = [e0[0] / l0, e0[1] / l0, e0[2] / l0];
  const v: P3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const flat = (p: P3): P2 => [(p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1] + (p[2] - o[2]) * u[2], (p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1] + (p[2] - o[2]) * v[2]];
  const at = (p: P2, w: number): P3 => [0, 1, 2].map((i) => o[i]! + u[i]! * p[0] + v[i]! * p[1] + n[i]! * w) as P3;
  const [a, b] = rings.map((r): Outline => ({ corners: r.map((e) => flat(e[0]!)), sides: r.map((e) => e.map(flat)) })) as [Outline, Outline];
  const size = (x: Outline) => Math.abs(area(x.sides.flatMap((sd) => sd.slice(0, -1))));
  const [outer, inner] = size(a) >= size(b) ? [a, b] : [b, a];
  // Up, as the frame stands: the world's up, or for a frame lying flat (its axis up) the depth (y), as seen from above.
  const up3: P3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const up: P2 = [up3[0] * u[0] + up3[1] * u[1] + up3[2] * u[2], up3[0] * v[0] + up3[1] * v[1] + up3[2] * v[2]];
  const walls = ringWalls(outer, inner, joint, 1, pass ? { mode: pass, up } : undefined);
  if (typeof walls === "string") throw new GeometryError(`${name} : ${walls}`);
  const shapes: Shape3D[] = [];
  try {
    for (const wall of walls) {
      // Over the whole height, a little more each end and on each face, so the cut meets no face edge-on.
      const face = makePolygon(wall.map((p) => at(p, 1)));
      const along = new Vector([-n[0] * (height + 2), -n[1] * (height + 2), -n[2] * (height + 2)]);
      const prism = basicFaceExtrusion(face, along) as Shape3D;
      face.delete();
      along.delete();
      const part = target.intersect(prism) as Shape3D;
      prism.delete();
      if (!isShapeValid(part) || part.solids.length !== 1) {
        part.delete();
        throw new GeometryError(`${name} : un côté obtenu est invalide ; le corps n'est peut-être pas un cadre droit sur toute sa hauteur.`);
      }
      shapes.push(part);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  // Numbered by position (x, then y, then z): the same bodies at each regeneration.
  const placed = shapes.map((part) => {
    const box = part.boundingBox;
    const c = [...box.center];
    box.delete();
    return { part, c };
  });
  placed.sort((p, q) => p.c[0]! - q.c[0]! || p.c[1]! - q.c[1]! || p.c[2]! - q.c[2]!);
  return placed.map((p) => p.part);
}

/** Whether the body is already hollow as a frame: a flat face with a hole through it. */
export const isFrame = (target: Shape3D): boolean => target.faces.some((f) => f.geomType === "PLANE" && f.wires.length === 2);

/**
 * The two ends of a solid body taken as a frame, to open: two flat faces facing away from each other, every other face
 * square to them (the ends of a prism) — the top and the bottom when there are such, else the largest; or, a way given
 * (the normal of a face clicked), the largest pair of faces square to it. With the sides' `thickness`, only ends wide
 * enough to be emptied to it come first (a board's top, 18 mm wide, cannot hold two sides of 18 mm: its faces can).
 */
export function frameEnds(target: Shape3D, along?: readonly number[], thickness = 0): [Face, Face] | null {
  const flat = target.faces.filter((f) => f.geomType === "PLANE").map((face) => {
    const v = face.normalAt(face.center);
    return { face, normal: [v.x, v.y, v.z] as P3, area: measureArea(face) };
  });
  const others = target.faces.filter((f) => f.geomType !== "PLANE");
  const d3 = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pairs = flat.flatMap((a, i) => flat.slice(i + 1).flatMap((b) => (d3(a.normal, b.normal) < -0.9999 ? [[a, b] as const] : [])));
  // A prism's ends: every other flat face square to them, no curved face (a curved side would not be one).
  const ends = pairs.filter(([a]) => !others.length && flat.every((f) => f === a || Math.abs(d3(f.normal, a.normal)) > 0.9999 || Math.abs(d3(f.normal, a.normal)) < 1e-4));
  // A way chosen (a face clicked): the pair of faces square to it, the largest.
  if (along) {
    const chosen = pairs.filter(([a]) => Math.abs(d3(a.normal, along as P3)) > 0.999).sort((p, q) => q[0].area - p[0].area)[0];
    return chosen ? [chosen[0].face, chosen[1].face] : null;
  }
  // Wide enough: the end's two sizes (its box, less the way it faces) more than two sides.
  const roomy = (face: Face) => {
    const box = face.boundingBox;
    const sizes = [box.width, box.height, box.depth].sort((a, b) => b - a);
    box.delete();
    return sizes[1]! > 2 * thickness + 1;
  };
  // A prism's ends wide enough; else any pair of faces facing away that is (a mitred side: its ends cut at 45°, its
  // top too narrow, its two large faces); else the ends as they are.
  const wide = (list: typeof pairs) => list.filter((c) => roomy(c[0].face));
  const candidates = wide(ends).length ? ends : wide(pairs).length ? pairs : ends.length ? ends : pairs;
  const fits = new Map(candidates.map((c) => [c, roomy(c[0].face)]));
  const best = [...candidates].sort((p, q) => Number(fits.get(q)) - Number(fits.get(p)) || Number(Math.abs(q[0].normal[2]) > 0.9999) - Number(Math.abs(p[0].normal[2]) > 0.9999) || q[0].area - p[0].area)[0];
  return best ? [best[0].face, best[1].face] : null;
}
