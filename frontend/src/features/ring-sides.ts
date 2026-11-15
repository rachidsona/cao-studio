/**
 * « Séparer les côtés » : un corps déjà creux — un cadre, un caisson sans fond, tout contour fermé à trou extrudé
 * (triangle, rectangle, polygone, de biais) — séparé en ses côtés droits, chacun un corps. Les côtés se rejoignent en
 * onglet (le joint sur la bissectrice de chaque coin) ou bout à bout : les plus longs traversent (deux côtés
 * voisins ne traversent jamais tous les deux), les autres s'arrêtent contre eux ; deux côtés qui ne traversent ni
 * l'un ni l'autre se rejoignent en onglet. Le contour se lit sur la face du dessus du corps (son contour extérieur et
 * son trou, côtés parallèles deux à deux) ; chaque côté est le corps coupé par son prisme, sur toute la hauteur.
 * ringWalls est le calcul pur, dans le plan de cette face.
 */
import { basicFaceExtrusion, makePolygon, measureArea, Vector, type Face, type Shape3D } from "replicad";
import { GeometryError, isShapeValid } from "../geometry/kernel";

export type P2 = [number, number];
type P3 = [number, number, number];

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const area = (poly: readonly P2[]) => poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]!), 0) / 2;
const near = (a: P2, b: P2) => len(sub(a, b)) < 1e-6;

/** Where the line through `p` along `d` meets the line through `a` and `b` (null: parallel). */
function meet(p: P2, d: P2, a: P2, b: P2): P2 | null {
  const e = sub(b, a);
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(a, p), e) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/** The joint at each corner: where the split from the inner corner reaches the outside (on the corner, or past it). */
type Split = { at: P2; on: "corner" | "previous" | "next" };

/**
 * The sides of a ring, as polygons in its plane: `outer` and `inner` its two outlines (any turning sense), each side of
 * one parallel to a side of the other. A string: why the ring cannot be split so.
 */
export function ringWalls(outerIn: readonly P2[], innerIn: readonly P2[], joint: "miter" | "butt", widen = 0): P2[][] | string {
  const n = outerIn.length;
  if (n < 3 || innerIn.length !== n) return "le contour et son trou n'ont pas le même nombre de côtés droits.";
  // Both turning counter-clockwise.
  const outer = area(outerIn) < 0 ? [...outerIn].reverse() : [...outerIn];
  const inner = area(innerIn) < 0 ? [...innerIn].reverse() : [...innerIn];
  const dir = (poly: P2[], i: number): P2 => {
    const d = sub(poly[(i + 1) % n]!, poly[i]!);
    return [d[0] / len(d), d[1] / len(d)];
  };
  // The inner side facing the first outer side, then the others in turn.
  const shift = Array.from({ length: n }, (_, j) => j).find((j) => Array.from({ length: n }, (_, i) => i).every((i) => {
    const [a, b] = [dir(outer, i), dir(inner, (i + j) % n)];
    return Math.abs(cross(a, b)) < 1e-6 && dot(a, b) > 0;
  }));
  if (shift === undefined) return "les côtés du trou ne sont pas parallèles à ceux du contour.";
  const I = (k: number) => inner[(((k + shift) % n) + n) % n]!;
  const O = (k: number) => outer[((k % n) + n) % n]!;
  const lengths = Array.from({ length: n }, (_, i) => len(sub(O(i + 1), O(i))));
  // Butted: the longest sides run through, never two neighbours.
  const through = new Set<number>();
  if (joint === "butt") {
    for (const i of lengths.map((l, i) => ({ l, i })).sort((a, b) => b.l - a.l || a.i - b.i).map((x) => x.i)) {
      if (!through.has((i + n - 1) % n) && !through.has((i + 1) % n)) through.add(i);
    }
  }
  const splits: Split[] = Array.from({ length: n }, (_, k): Split => {
    const before = (k + n - 1) % n;
    // The side before runs through: the next one stops at its inner face, met on the outside of the next side.
    if (through.has(before) && !through.has(k)) {
      const at = meet(I(k), dir(outer, before), O(k), O(k + 1));
      if (at) return { at, on: "next" };
    }
    if (through.has(k) && !through.has(before)) {
      const back: P2 = [-dir(outer, k)[0], -dir(outer, k)[1]];
      const at = meet(I(k), back, O(before), O(k));
      if (at) return { at, on: "previous" };
    }
    return { at: O(k), on: "corner" };
  });
  // `widen`: each wall pushed out of the ring by that much, along its joints (the split from each inner corner), so
  // a boolean meets none of the body's faces edge-on, and two walls never overlap.
  const along = (from: P2, to: P2, by: number): P2 => {
    const d = sub(to, from);
    const l = len(d) || 1;
    return [to[0] + (d[0] / l) * by, to[1] + (d[1] / l) * by];
  };
  const S = (k: number) => (widen ? along(I(k), splits[k]!.at, widen) : splits[k]!.at);
  const In = (k: number) => (widen ? along(splits[k]!.at, I(k), widen) : I(k));
  const Out = (k: number) => (widen ? along(I(k), O(k), widen) : O(k));
  return Array.from({ length: n }, (_, i) => {
    const j = (i + 1) % n;
    const [s, e] = [splits[i]!, splits[j]!];
    const poly: P2[] = [S(i), ...(s.on === "previous" ? [Out(i)] : []), ...(e.on === "next" ? [Out(j)] : []), S(j), In(j), In(i)];
    return poly.filter((p, k) => !near(p, poly[(k + 1) % poly.length]!));
  });
}

/** A planar face's straight outline loops, as 3D points in order; null when one of its edges is curved. */
function loops(face: Face): P3[][] | null {
  const out: P3[][] = [];
  const same = (p: P3, q: P3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-5;
  for (const wire of face.wires) {
    const segments: [P3, P3][] = [];
    for (const edge of wire.edges) {
      if (edge.geomType !== "LINE") return null;
      const [a, b] = [edge.startPoint, edge.endPoint];
      segments.push([[a.x, a.y, a.z], [b.x, b.y, b.z]]);
    }
    // Chained end to end: the kernel does not turn every edge of a loop the same way.
    const points: P3[] = [segments[0]![0]];
    let end = segments[0]![1];
    const left = segments.slice(1);
    while (left.length) {
      const i = left.findIndex(([a, b]) => same(a, end) || same(b, end));
      if (i < 0) return null;
      const [a, b] = left.splice(i, 1)[0]!;
      points.push(end);
      end = same(a, end) ? b : a;
    }
    // Straight sides only: a corner between two edges in line is no corner.
    out.push(points.filter((p, k) => {
      const [q, r] = [points[(k + points.length - 1) % points.length]!, points[(k + 1) % points.length]!];
      const [d1, d2] = [[p[0] - q[0], p[1] - q[1], p[2] - q[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]];
      const c = [d1[1]! * d2[2]! - d1[2]! * d2[1]!, d1[2]! * d2[0]! - d1[0]! * d2[2]!, d1[0]! * d2[1]! - d1[1]! * d2[0]!];
      return Math.hypot(...c) > 1e-6 * Math.hypot(...d1) * Math.hypot(...d2);
    }));
  }
  return out;
}

/** The body's sides, each a solid: the ring read on its top face, cut into its sides through its whole height. */
export function splitRing(name: string, target: Shape3D, joint: "miter" | "butt"): Shape3D[] {
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
  const rings = loops(top.face);
  if (!rings || rings.length !== 2) throw new GeometryError(`${name} : seuls des côtés droits se séparent (le contour ou le trou est courbe).`);
  // The plane of the top: u along its first side, v across.
  const o = top.centre;
  const first = rings[0]!;
  const e0: P3 = [first[1]![0] - first[0]![0], first[1]![1] - first[0]![1], first[1]![2] - first[0]![2]];
  const l0 = Math.hypot(...e0);
  const u: P3 = [e0[0] / l0, e0[1] / l0, e0[2] / l0];
  const v: P3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const flat = (p: P3): P2 => [(p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1] + (p[2] - o[2]) * u[2], (p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1] + (p[2] - o[2]) * v[2]];
  const at = (p: P2, w: number): P3 => [0, 1, 2].map((i) => o[i]! + u[i]! * p[0] + v[i]! * p[1] + n[i]! * w) as P3;
  const [a, b] = rings.map((r) => r.map(flat)) as [P2[], P2[]];
  const [outer, inner] = Math.abs(area(a)) >= Math.abs(area(b)) ? [a, b] : [b, a];
  const walls = ringWalls(outer, inner, joint, 1);
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
