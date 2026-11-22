/**
 * « Séparer les côtés » d'un profil ouvert extrudé — un L (2 côtés), un U (3), un V, un zigzag, autant de côtés et
 * d'angles qu'on veut : la section du corps (sa face de bout) est coupée à chaque coude, de son coin intérieur à son
 * coin extérieur (en onglet), ou bout à bout — le côté qui passe continue sa face intérieure jusqu'au bord, l'autre
 * s'arrête contre lui. Qui passe : les côtés debout, les planches couchées, les plus longs, ou au choix en haut et en
 * bas, comme pour un cadre (features/ring-sides.ts). chainWalls est le calcul pur, dans le plan de la section ;
 * splitChain coupe le corps sur toute sa longueur.
 */
import { basicFaceExtrusion, makePolygon, measureArea, measureVolume, Vector, type Face, type Shape3D } from "replicad";
import type { SideCorner } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { outlines, type P2 } from "./ring-sides";

type P3 = [number, number, number];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const near = (a: P2, b: P2) => len(sub(a, b)) < 1e-6;
const unit = (d: P2): P2 => {
  const l = len(d) || 1;
  return [d[0] / l, d[1] / l];
};
const area = (poly: readonly P2[]) => poly.reduce((s, p, i) => s + cross(p, poly[(i + 1) % poly.length]!), 0) / 2;

export interface ChainPass {
  mode?: "sides" | "boards";
  /** Up, in the section's plane: which sides stand (the sides) and which lie (the top, the bottom). */
  up?: P2;
  corners?: { top: SideCorner; bottom: SideCorner };
}

/** Whether `p` is inside the polygon (a ray to +x crossing its edges an odd number of times). */
function inside(p: P2, poly: readonly P2[]): boolean {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i]!, poly[j]!];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
  }
  return odd;
}

/** Whether the segment a–b crosses an edge of the polygon (not at its own ends). */
function crosses(a: P2, b: P2, poly: readonly P2[]): boolean {
  const d = sub(b, a);
  return poly.some((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    if (near(p, a) || near(p, b) || near(q, a) || near(q, b)) return false;
    const e = sub(q, p);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) return false;
    const t = cross(sub(p, a), e) / den;
    const u = cross(sub(p, a), d) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
  });
}

/** Where the ray from vertex `k` along `d` first meets the outline: the edge and the point. */
function rayHit(poly: readonly P2[], k: number, d: P2): { edge: number; at: P2 } | null {
  const n = poly.length;
  const p = poly[k]!;
  let best: { edge: number; at: P2; t: number } | null = null;
  for (let i = 0; i < n; i++) {
    if (i === k || (i + 1) % n === k) continue;
    const [a, b] = [poly[i]!, poly[(i + 1) % n]!];
    const e = sub(b, a);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(sub(a, p), e) / den;
    const u = cross(sub(a, p), d) / den;
    if (t > 1e-9 && u > -1e-9 && u < 1 + 1e-9 && (!best || t < best.t)) best = { edge: i, at: [p[0] + d[0] * t, p[1] + d[1] * t], t };
  }
  return best ? { edge: best.edge, at: best.at } : null;
}

/**
 * The sides of an open profile, as polygons in its plane: `outline` the section (any turning sense), cut at each bend.
 * Null: not a chain of sides cut so (no bend, a block; a shelf meeting a side, a T; cuts that would cross) — left to
 * the other ways. `widen`: each side pushed out
 * of the section by that much — along its cuts at the ends, square to its faces elsewhere —, so a boolean meets no
 * face of the body edge-on.
 */
export function chainWalls(outline: readonly P2[], joint: "miter" | "butt", widen = 0, pass: ChainPass = {}): P2[][] | null {
  const poly = (area(outline) < 0 ? [...outline].reverse() : [...outline]).filter((p, k, all) => !near(p, all[(k + 1) % all.length]!));
  const n = poly.length;
  const at = (k: number) => poly[((k % n) + n) % n]!;
  const turn = (k: number) => cross(sub(at(k), at(k - 1)), sub(at(k + 1), at(k)));
  // The bends: the corners turning in (the inner corners of the profile).
  const bends = poly.flatMap((_, k) => (turn(k) < -1e-9 ? [k] : []));
  // A chain of sides only (k sides, k − 1 bends, 2k + 2 corners): not a shelf meeting a side (a T), left to the others.
  if (!bends.length || n !== 2 * bends.length + 4) return null;
  const centre: P2 = [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  const upright = (a: P2, b: P2) => !!pass.up && Math.abs(dot(unit(sub(b, a)), unit(pass.up))) > Math.SQRT1_2;
  // Each cut: from the inner corner to the outer one (mitred) or along the face of the side that passes (butted).
  const cuts: { from: P2; to: P2; edge?: number }[] = [];
  for (const k of bends) {
    const [r, before, after] = [at(k), at(k - 1), at(k + 1)];
    let passes: "before" | "after" | null = null;
    const rule = pass.corners ? (pass.up && dot(sub(r, centre), pass.up) > 0 ? pass.corners.top : pass.corners.bottom) : joint === "miter" ? "miter" : pass.mode ?? "longest";
    if (rule === "longest") passes = len(sub(r, before)) >= len(sub(after, r)) ? "before" : "after";
    else if (rule !== "miter") {
      const [b, a] = [upright(before, r), upright(r, after)];
      if (b !== a) passes = (rule === "sides") === b ? "before" : "after";
    }
    if (passes) {
      const d = unit(passes === "before" ? sub(r, before) : sub(r, after));
      const hit = rayHit(poly, k, d);
      if (!hit) return null;
      cuts.push({ from: r, to: hit.at, edge: hit.edge });
      continue;
    }
    // Mitred: the outer corner across the side, the nearest corner turning out that a straight cut reaches inside.
    const outer = poly
      .map((p, j) => ({ p, j }))
      .filter(({ p, j }) => turn(j) > 1e-9 && j !== k && j !== (k + 1) % n && j !== (k - 1 + n) % n && inside([(p[0] + r[0]) / 2, (p[1] + r[1]) / 2], poly) && !crosses(r, p, poly))
      .sort((x, y) => len(sub(x.p, r)) - len(sub(y.p, r)))[0];
    if (!outer) return null;
    cuts.push({ from: r, to: outer.p });
  }
  // The cut ends on an edge (butted) put in the outline as corners, then each cut splits the piece holding its two ends.
  const points: P2[] = [];
  poly.forEach((p, i) => {
    points.push(p);
    const on = cuts.filter((c) => c.edge === i && !near(c.to, p) && !near(c.to, at(i + 1))).map((c) => c.to);
    on.sort((x, y) => len(sub(x, p)) - len(sub(y, p)));
    points.push(...on);
  });
  let pieces: P2[][] = [points];
  for (const cut of cuts) {
    const i = pieces.findIndex((piece) => piece.some((p) => near(p, cut.from)) && piece.some((p) => near(p, cut.to)));
    if (i < 0) return null;
    const piece = pieces[i]!;
    let [a, b] = [piece.findIndex((p) => near(p, cut.from)), piece.findIndex((p) => near(p, cut.to))];
    if (a > b) [a, b] = [b, a];
    if (b - a < 2 || a + piece.length - b < 2) return null;
    pieces.splice(i, 1, piece.slice(a, b + 1), [...piece.slice(b), ...piece.slice(0, a + 1)]);
  }
  if (pieces.some((p) => area(p) < 1e-6) || Math.abs(pieces.reduce((s, p) => s + area(p), 0) - area(poly)) > 1e-6 * Math.max(1, area(poly))) {
    return null;
  }
  if (!widen) return pieces;
  const isCut = (p: P2, q: P2) => cuts.some((c) => (near(c.from, p) && near(c.to, q)) || (near(c.from, q) && near(c.to, p)));
  pieces = pieces.map((piece) =>
    piece.map((p, k) => {
      const [a, b] = [piece[(k - 1 + piece.length) % piece.length]!, piece[(k + 1) % piece.length]!];
      // On a cut: along it, away from its other end.
      const along = isCut(a, p) ? a : isCut(p, b) ? b : null;
      if (along) {
        const d = unit(sub(p, along));
        return [p[0] + d[0] * widen, p[1] + d[1] * widen] as P2;
      }
      // Elsewhere: its two edges moved out square to themselves, where they meet.
      const [d1, d2] = [unit(sub(p, a)), unit(sub(b, p))];
      const n1: P2 = [d1[1], -d1[0]];
      const n2: P2 = [d2[1], -d2[0]];
      const f = widen / Math.max(0.2, 1 + dot(n1, n2));
      return [p[0] + (n1[0] + n2[0]) * f, p[1] + (n1[1] + n2[1]) * f] as P2;
    }),
  );
  return pieces;
}

/**
 * The body's sides, each a solid, when it is an open profile extruded straight (its ends two flat faces facing away,
 * every other face square to them): its end read, cut at its bends, through its whole length. Null: not such a body
 * (left to the other ways).
 */
/**
 * The two ends of an open profile extruded straight: two flat faces facing away, of the same area, their outline
 * turning in somewhere (an L, a U), every other face flat and square to them; the largest such. Null: none.
 */
function chainEnds(target: Shape3D): [Face, Face] | null {
  if (target.faces.some((f) => f.geomType !== "PLANE")) return null;
  const flat = target.faces.map((face) => {
    const v = face.normalAt(face.center);
    return { face, normal: [v.x, v.y, v.z] as P3, area: measureArea(face) };
  });
  const d3 = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const bent = (face: Face) => {
    if (face.wires.length !== 1) return false;
    const pts = outlines(face)?.[0]?.map((e) => e[0]!);
    if (!pts || pts.length < 5) return false;
    // In the face's plane, any two axes: a corner turning against the others.
    const [a, b] = [pts[0]!, pts[1]!];
    const nv = face.normalAt(face.center);
    const nn: P3 = [nv.x, nv.y, nv.z];
    const e: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: P3 = [nn[1] * e[2] - nn[2] * e[1], nn[2] * e[0] - nn[0] * e[2], nn[0] * e[1] - nn[1] * e[0]];
    const q = pts.map((p): P2 => [d3([p[0] - a[0], p[1] - a[1], p[2] - a[2]], e), d3([p[0] - a[0], p[1] - a[1], p[2] - a[2]], w)]);
    const turns = q.map((p, k) => cross(sub(p, q[(k - 1 + q.length) % q.length]!), sub(q[(k + 1) % q.length]!, p)));
    return turns.some((t) => t > 1e-9) && turns.some((t) => t < -1e-9);
  };
  const pairs = flat.flatMap((a, i) =>
    flat.slice(i + 1).flatMap((b) => (d3(a.normal, b.normal) < -0.9999 && Math.abs(a.area - b.area) < 1e-3 * a.area ? [[a, b] as const] : [])),
  );
  const ends = pairs
    .filter(([a]) => flat.every((f) => Math.abs(d3(f.normal, a.normal)) > 0.9999 || Math.abs(d3(f.normal, a.normal)) < 1e-4) && bent(a.face))
    .sort((p, q) => q[0].area - p[0].area)[0];
  return ends ? [ends[0].face, ends[1].face] : null;
}

export function splitChain(name: string, target: Shape3D, joint: "miter" | "butt", pass?: "sides" | "boards", corners?: { top: SideCorner; bottom: SideCorner }): Shape3D[] | null {
  const ends = chainEnds(target);
  if (!ends) return null;
  const [top, bottom] = ends;
  const c = top.center;
  const nv = top.normalAt(c);
  const n: P3 = [nv.x, nv.y, nv.z];
  const o: P3 = [c.x, c.y, c.z];
  const cb = bottom.center;
  const height = (o[0] - cb.x) * n[0] + (o[1] - cb.y) * n[1] + (o[2] - cb.z) * n[2];
  if (!(height > 0.01)) return null;
  const rings = outlines(top);
  if (!rings || rings.length !== 1) return null;
  const first = rings[0]![0]!;
  const e0: P3 = [first[1]![0] - first[0]![0], first[1]![1] - first[0]![1], first[1]![2] - first[0]![2]];
  const l0 = Math.hypot(...e0);
  const u: P3 = [e0[0] / l0, e0[1] / l0, e0[2] / l0];
  const v: P3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const flat = (p: P3): P2 => [(p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1] + (p[2] - o[2]) * u[2], (p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1] + (p[2] - o[2]) * v[2]];
  const at = (p: P2, w: number): P3 => [0, 1, 2].map((i) => o[i]! + u[i]! * p[0] + v[i]! * p[1] + n[i]! * w) as P3;
  // shortcut: a curved side counts by its corners (its chord); the volume check below refuses what that would lose.
  const outline = rings[0]!.map((e) => flat(e[0]!));
  const up3: P3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const up: P2 = [up3[0] * u[0] + up3[1] * u[1] + up3[2] * u[2], up3[0] * v[0] + up3[1] * v[1] + up3[2] * v[2]];
  const walls = chainWalls(outline, joint, 1, { mode: pass, up, corners });
  if (walls === null) return null;
  const shapes: Shape3D[] = [];
  try {
    for (const wall of walls) {
      const face = makePolygon(wall.map((p) => at(p, 1)));
      const along = new Vector([-n[0] * (height + 2), -n[1] * (height + 2), -n[2] * (height + 2)]);
      const prism = basicFaceExtrusion(face, along) as Shape3D;
      face.delete();
      along.delete();
      const part = target.intersect(prism) as Shape3D;
      prism.delete();
      if (!isShapeValid(part) || part.solids.length !== 1) {
        part.delete();
        throw new GeometryError(`${name} : un côté obtenu est invalide ; le profil n'est peut-être pas droit sur toute sa longueur.`);
      }
      shapes.push(part);
    }
    // Nothing lost, nothing doubled.
    const whole = measureVolume(target);
    const parts = shapes.reduce((s, p) => s + measureVolume(p), 0);
    if (Math.abs(parts - whole) > 1e-3 * whole) throw new GeometryError(`${name} : les côtés obtenus ne refont pas le corps (un côté courbe ?).`);
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  const placed = shapes.map((part) => {
    const box = part.boundingBox;
    const centre = [...box.center];
    box.delete();
    return { part, centre };
  });
  placed.sort((p, q) => p.centre[0]! - q.centre[0]! || p.centre[1]! - q.centre[1]! || p.centre[2]! - q.centre[2]!);
  return placed.map((p) => p.part);
}
