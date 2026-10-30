/**
 * Courbes lisses faites d'arcs tangents, que tout l'atelier sait traiter (ajuster, décaler, extruder, DXF en arcs) :
 * l'ovale à quatre centres du tracé de menuiserie (deux petits arcs aux bouts, deux grands sur les côtés) et la
 * courbe lissée passant par des points cliqués (deux arcs entre chaque paire de points, tangents partout : des
 * « biarcs »). À chaque raccord entre deux arcs, les deux centres et le point de raccord restent alignés (la
 * tangence est gardée quand on modifie la forme). Fonctions pures.
 */
import type { SketchCurve, SketchGeometry, SketchConstraint } from "../document/sketch";
import { cloneGeometry, nextId, type Vec2 } from "./edit";

const EPS = 1e-9;
const round = (v: number) => Number(v.toFixed(9));
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit = (a: Vec2): Vec2 => scale(a, 1 / (len(a) || 1));
const left = (a: Vec2): Vec2 => [-a[1], a[0]];

/** A piece of a smooth curve: a straight line, or an arc of centre `c` from `a` to `b` (counter-clockwise when `ccw`). */
export type Piece = { a: Vec2; b: Vec2 } & ({ kind: "line" } | { kind: "arc"; c: Vec2; r: number; ccw: boolean });

/** The arc leaving `a` along the tangent `t` and reaching `b` (a line when `b` is straight ahead). */
export function arcFrom(a: Vec2, t: Vec2, b: Vec2): Piece {
  const n = left(unit(t));
  const ab = sub(b, a);
  const side = dot(n, ab);
  if (Math.abs(side) < 1e-9 * Math.max(1, dot(ab, ab))) return { kind: "line", a, b };
  const signed = dot(ab, ab) / (2 * side);
  return { kind: "arc", a, b, c: add(a, scale(n, signed)), r: Math.abs(signed), ccw: signed > 0 };
}

/** Two arcs from `p0` (tangent `t0`) to `p1` (tangent `t1`), tangent to each other where they meet. */
export function biarc(p0: Vec2, t0: Vec2, p1: Vec2, t1: Vec2): Piece[] {
  const [u0, u1] = [unit(t0), unit(t1)];
  const v = sub(p1, p0);
  const t = add(u0, u1);
  const qa = 2 * (1 - dot(u0, u1));
  const qb = 2 * dot(v, t);
  const qc = -dot(v, v);
  let d: number;
  if (Math.abs(qa) < EPS) d = Math.abs(qb) < EPS ? len(v) / 2 : -qc / qb;
  else d = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
  const m = scale(add(add(p0, scale(u0, d)), sub(p1, scale(u1, d))), 0.5);
  const first = arcFrom(p0, u0, m);
  // The second arc, walked backwards from p1 along −t1, reaches the same junction.
  const back = arcFrom(p1, scale(u1, -1), m);
  const second: Piece = back.kind === "line" ? { kind: "line", a: m, b: p1 } : { ...back, a: m, b: p1, ccw: !back.ccw };
  return [first, second];
}

/** The pieces of a smooth curve through `points` (closed: back to the first), tangents from the neighbours. */
export function smoothPieces(points: Vec2[], closed = false): Piece[] {
  const n = points.length;
  if (n < 2) return [];
  if (n === 2 && !closed) return [{ kind: "line", a: points[0]!, b: points[1]! }];
  const tangent = (i: number): Vec2 => {
    if (closed) return sub(points[(i + 1) % n]!, points[(i - 1 + n) % n]!);
    if (i === 0) return sub(points[1]!, points[0]!);
    if (i === n - 1) return sub(points[n - 1]!, points[n - 2]!);
    return sub(points[i + 1]!, points[i - 1]!);
  };
  const pieces: Piece[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) pieces.push(...biarc(points[i]!, tangent(i), points[(i + 1) % n]!, tangent((i + 1) % n)));
  return pieces;
}

/** The four arcs of an oval of half-axes `rx`, `ry` around `center` (the classic four-centre layout). */
export function ovalPieces(center: Vec2, rx: number, ry: number): Piece[] | string {
  if (!(rx > 1e-6) || !(ry > 1e-6)) return "L'ovale doit avoir une largeur et une hauteur.";
  const turned = ry > rx;
  const [a, b] = turned ? [ry, rx] : [rx, ry];
  if (a - b < 1e-6) return "C'est un cercle : utilisez l'outil Cercle.";
  // Small radius: the curvature of the ellipse at its ends, kept below the half-height.
  const r1 = Math.min((b * b) / a, b * 0.98);
  const r2 = ((a - r1) ** 2 + b * b - r1 * r1) / (2 * (b - r1));
  const local = (p: Vec2): Vec2 => (turned ? [center[0] - p[1], center[1] + p[0]] : [center[0] + p[0], center[1] + p[1]]);
  const smallR: Vec2 = [a - r1, 0];
  const smallL: Vec2 = [-(a - r1), 0];
  const bigT: Vec2 = [0, -(r2 - b)];
  const bigB: Vec2 = [0, r2 - b];
  const joint = (small: Vec2, big: Vec2) => add(small, scale(unit(sub(small, big)), r1));
  const [jRT, jLT, jLB, jRB] = [joint(smallR, bigT), joint(smallL, bigT), joint(smallL, bigB), joint(smallR, bigB)];
  const arc = (c: Vec2, r: number, s: Vec2, e: Vec2): Piece => ({ kind: "arc", c: local(c), r, a: local(s), b: local(e), ccw: true });
  return [arc(smallR, r1, jRB, jRT), arc(bigT, r2, jRT, jLT), arc(smallL, r1, jLT, jLB), arc(bigB, r2, jLB, jRB)];
}

/**
 * Adds pieces to a sketch: points shared where pieces meet (and with `ids` given for the clicked points), arcs
 * counter-clockwise, and at each joint of two arcs the construction line between their centres through the joint.
 */
export function addPieces(g: SketchGeometry, pieces: Piece[], closed: boolean, construction = false): { geometry: SketchGeometry; created: string[] } {
  const next = cloneGeometry(g);
  const created: string[] = [];
  const flag = construction ? { construction: true } : {};
  const pointAt = (p: Vec2): string => {
    const existing = next.points.find((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 1e-7);
    if (existing) return existing.id;
    const id = nextId(next, "p");
    next.points.push({ id, x: round(p[0]), y: round(p[1]) });
    return id;
  };
  const centres: (string | null)[] = [];
  for (const piece of pieces) {
    const [a, b] = [pointAt(piece.a), pointAt(piece.b)];
    if (piece.kind === "line") {
      const id = nextId(next, "l");
      next.curves.push({ id, kind: "line", p1: a, p2: b, ...flag });
      created.push(id);
      centres.push(null);
      continue;
    }
    const c = nextId(next, "p");
    next.points.push({ id: c, x: round(piece.c[0]), y: round(piece.c[1]) });
    const [start, end, ps, pe] = piece.ccw ? [a, b, piece.a, piece.b] : [b, a, piece.b, piece.a];
    const sa = Math.atan2(ps[1] - piece.c[1], ps[0] - piece.c[0]);
    let ea = Math.atan2(pe[1] - piece.c[1], pe[0] - piece.c[0]);
    if (ea <= sa) ea += 2 * Math.PI;
    const id = nextId(next, "a");
    next.curves.push({ id, kind: "arc", center: c, start, end, radius: round(piece.r), startAngle: sa, endAngle: ea, ...flag } as SketchCurve);
    created.push(id);
    centres.push(c);
  }
  // Tangency kept at the joints of two arcs: their centres and the joint stay in line.
  const joints = closed ? pieces.length : pieces.length - 1;
  for (let i = 0; i < joints; i++) {
    const [c1, c2] = [centres[i], centres[(i + 1) % pieces.length]];
    if (!c1 || !c2) continue;
    const line = nextId(next, "l");
    next.curves.push({ id: line, kind: "line", p1: c1, p2: c2, construction: true });
    next.constraints.push({ id: nextId(next, "c"), kind: "pointOnCurve", point: pointAt(pieces[i]!.b), curve: line } as SketchConstraint);
  }
  return { geometry: next, created };
}
