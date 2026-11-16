/**
 * « Séparer les côtés » quand le contour et son trou n'ont pas autant de coins — un contour à encoches, à coins
 * arrondis, vidé d'une épaisseur (le noyau arrondit le trou à chaque coin rentrant) — : la séparation suit la forme.
 * Chaque côté du contour est une pièce ; à chacun de ses coins, le joint va jusqu'au trou : sur la bissectrice du coin
 * (onglet, et tout coin rentrant), d'équerre au contour là où deux côtés se suivent sans angle (un arrondi), ou bout à
 * bout : le côté qui traverse va jusqu'au coin, l'autre s'arrête contre sa face intérieure. Entre deux joints, la pièce
 * prend tout ce que le contour et le trou font : arcs, encoches, arrondis. Pur, dans le plan de la face.
 */
type P2 = [number, number];

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const near = (a: P2, b: P2) => len(sub(a, b)) < 1e-6;
const unit = (d: P2): P2 => {
  const l = len(d) || 1;
  return [d[0] / l, d[1] / l];
};
const left = (d: P2): P2 => [-d[1], d[0]];

/** Both outlines turning counter-clockwise, each its corners and between them its sides as points. */
export interface RingOutline {
  corners: P2[];
  sides: P2[][];
}

/** A point on a closed polyline: on its segment `seg` (from point seg to seg + 1), at `at`. */
interface Spot {
  seg: number;
  at: P2;
  /** How far along its segment (0: on its first point). */
  t: number;
}

/** The outline as one closed polyline (its first point not repeated), and where each corner is in it. */
function loop(o: RingOutline): { pts: P2[]; corner: number[] } {
  const pts: P2[] = [];
  const corner: number[] = [];
  for (const side of o.sides) {
    corner.push(pts.length);
    pts.push(...side.slice(0, -1));
  }
  return { pts, corner };
}

const spot = (pts: P2[], seg: number, at: P2): Spot => {
  const [a, b] = [pts[seg]!, pts[(seg + 1) % pts.length]!];
  const l = len(sub(b, a));
  return { seg, at, t: l > 0 ? len(sub(at, a)) / l : 0 };
};

/** Where the ray from `p` along `d` first meets the closed polyline, forwards only. */
function rayHit(p: P2, d: P2, pts: P2[]): Spot | null {
  let best: { seg: number; at: P2; t: number } | null = null;
  for (let s = 0; s < pts.length; s++) {
    const [a, b] = [pts[s]!, pts[(s + 1) % pts.length]!];
    const e = sub(b, a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(sub(a, p), e) / den;
    const u = cross(sub(a, p), d) / den;
    if (t > 1e-9 && u > -1e-9 && u < 1 + 1e-9 && (!best || t < best.t)) best = { seg: s, at: [p[0] + d[0] * t, p[1] + d[1] * t], t };
  }
  return best ? spot(pts, best.seg, best.at) : null;
}

/** The point of the closed polyline closest to `p`. */
function closest(p: P2, pts: P2[]): Spot {
  let best: { seg: number; at: P2; d: number } = { seg: 0, at: pts[0]!, d: Infinity };
  for (let s = 0; s < pts.length; s++) {
    const [a, b] = [pts[s]!, pts[(s + 1) % pts.length]!];
    const e = sub(b, a);
    const l2 = dot(e, e);
    const u = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), e) / l2)) : 0;
    const at: P2 = [a[0] + e[0] * u, a[1] + e[1] * u];
    const d = len(sub(p, at));
    if (d < best.d - 1e-9) best = { seg: s, at, d };
  }
  return spot(pts, best.seg, best.at);
}

/** The points of the closed polyline after `from` and before `to`, going forwards (round the loop if need be). */
function between(pts: P2[], from: Spot, to: Spot): P2[] {
  const m = pts.length;
  const out: P2[] = [];
  if (from.seg === to.seg && to.t >= from.t) return out;
  for (let k = (from.seg + 1) % m, guard = 0; guard <= m; k = (k + 1) % m, guard++) {
    out.push(pts[k]!);
    if (k === to.seg) break;
  }
  return out;
}

/**
 * The walls of the ring, one a side of the outline, as polygons; `through`: the sides that run through at a butted
 * corner (none when mitred). A string: why it cannot be split so.
 */
export function followWalls(outer: RingOutline, inner: RingOutline, joint: "miter" | "butt", through: ReadonlySet<number>, widen = 0): P2[][] | string {
  const n = outer.corners.length;
  if (n < 2) return "le contour n'a pas de coin où le séparer.";
  const O = loop(outer);
  const I = loop(inner);
  const side = (k: number) => outer.sides[((k % n) + n) % n]!;
  const splits = Array.from({ length: n }, (_, k) => {
    const [a, b] = [side(k - 1), side(k)];
    const dA = unit(sub(a[a.length - 1]!, a[a.length - 2]!));
    const dB = unit(sub(b[1]!, b[0]!));
    const corner = O.corner[k]!;
    const at = spot(O.pts, corner, O.pts[corner]!);
    // Two sides meeting tangent (a rounded corner): the joint square to the outline, to the nearest of the hole.
    if (dot(dA, dB) > Math.cos((5 * Math.PI) / 180)) return { out: at, hole: closest(at.at, I.pts) };
    // Elsewhere, from the corner on its bisector to the hole (a corner going in: round the hole's arc, to its middle).
    const bis = unit([left(dA)[0] + left(dB)[0], left(dA)[1] + left(dB)[1]]);
    const hole = rayHit(at.at, bis, I.pts) ?? closest(at.at, I.pts);
    const before = (k + n - 1) % n;
    const convex = cross(dA, dB) > 0;
    if (joint !== "butt" || !convex || through.has(before) === through.has(k)) return { out: at, hole };
    // Butted: the side running through keeps the corner; the other stops against its inside face.
    const [from, d, on] = through.has(before) ? [hole.at, dA, k] : [hole.at, [-dB[0], -dB[1]] as P2, before];
    const sd = side(on);
    let found: Spot | null = null;
    for (let s = 0; s + 1 < sd.length && !found; s++) {
      const hit = rayHit(from, d, [sd[s]!, sd[s + 1]!]);
      // A segment as a two-point loop: only its own segment (0) counts.
      if (hit && hit.seg === 0) found = spot(O.pts, O.corner[on]! + s, hit.at);
    }
    return { out: found ?? at, hole };
  });
  const pushed = (pts: P2[], k: number): P2 => {
    const [a, p, b] = [pts[k - 1]!, pts[k]!, pts[k + 1]!];
    const [n1, n2] = [left(unit(sub(p, a))), left(unit(sub(b, p)))].map((v): P2 => [-v[0], -v[1]]) as [P2, P2];
    const f = widen / Math.max(0.2, 1 + dot(n1, n2));
    return [p[0] + (n1[0] + n2[0]) * f, p[1] + (n1[1] + n2[1]) * f];
  };
  const along = (from: P2, to: P2): P2 => {
    const d = unit(sub(to, from));
    return [to[0] + d[0] * widen, to[1] + d[1] * widen];
  };
  const walls: P2[][] = [];
  for (let i = 0; i < n; i++) {
    const [s, e] = [splits[i]!, splits[(i + 1) % n]!];
    const outside = [s.out.at, ...between(O.pts, s.out, e.out), e.out.at].filter((p, k, all) => k === 0 || !near(p, all[k - 1]!));
    const hole = [e.hole.at, ...between(I.pts, s.hole, e.hole).reverse(), s.hole.at].filter((p, k, all) => k === 0 || !near(p, all[k - 1]!));
    if (outside.length < 2 || hole.length < 1) return "un côté du contour n'a rien en face dans le trou.";
    const outsideWide = widen ? outside.map((p, k) => (k === 0 ? along(s.hole.at, p) : k === outside.length - 1 ? along(e.hole.at, p) : pushed(outside, k))) : outside;
    const holeWide = widen ? hole.map((p, k) => (k === 0 ? along(e.out.at, p) : k === hole.length - 1 ? along(s.out.at, p) : pushed(hole, k))) : hole;
    const poly = [...outsideWide, ...holeWide];
    walls.push(poly.filter((p, k) => !near(p, poly[(k + 1) % poly.length]!)));
  }
  return walls;
}
