/**
 * Les meubles de cuisine qui ne sont pas des boîtes droites, en planches au contour libre vu de dessus (un caisson
 * ordinaire est une boîte : ceux-ci sont bâtis planche par planche) :
 * - le **terminal arrondi** au bout d'un linéaire : dessous, étagères et dessus en quart de rond (un quart d'ellipse
 *   de sa largeur sur sa profondeur), un côté droit contre son voisin, ouvert, sur un socle arrondi en retrait ; le plan
 *   de travail s'arrondit au-dessus de lui ;
 * - l'**angle en biais** : un caisson pentagone sur les deux murs (90 × 90 d'origine), dessous, étagère et dessus en
 *   pentagone, deux côtés, une porte à 45° et sa plinthe ; un morceau de plan de travail en triangle couvre son devant.
 * - le **caisson d'angle en L** : un seul caisson sur les deux murs (90 × 90 d'origine), dessous, deux étagères et dessus
 *   en L, un fond contre chaque mur, un côté au bout de chaque bras, jusqu'au sol, entaillé pour la plinthe ; sa porte
 *   pliante (un battant devant chaque bras), sa plinthe et le plan de travail sont ceux des linéaires, comme au meuble en L.
 * Chaque planche est une pièce du plan (document/kitchen-plan.ts dessine son contour à plat et le monte en hauteur) ;
 * le débit la compte dans son rectangle. Pur.
 */
import type { KitchenBox } from "../features/kitchen-layout";
import type { Vec3 } from "./types";

/** A point along the run (`u`) and off its back (`a`) in the kitchen frame. */
export type At = (u: number, a: number) => [number, number];
type BoxOf = (name: string, kind: KitchenBox["kind"], at: [Vec3, Vec3], extra?: Partial<KitchenBox>) => void;

const T = 18;
/** The L caisson's backs, as thin as the kitchen units' (document/kitchen-plan.ts `backThickness`). */
const BACK = 3;
/** Segments of a quarter round. */
const STEPS = 12;

/** An outline (run frame) as a box: its points in the kitchen frame, its bounds, from `z0` to `z1`. */
function shaped(at: At, points: [number, number][], z0: number, z1: number): { at: [Vec3, Vec3]; outline: [number, number][] } {
  const outline = points.map(([u, a]) => at(u, a));
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  return { at: [[Math.min(...xs), Math.min(...ys), z0], [Math.max(...xs), Math.max(...ys), z1]], outline };
}

/**
 * A quarter round from `u0` to `u1` along the run, `depth` off its back: square on the side of `u0` (`round` the side
 * that is rounded), a quarter of an ellipse to the other, `inset` in from its edge (a socle set back).
 */
export function quarterRound(u0: number, u1: number, depth: number, round: "left" | "right", inset = 0): [number, number][] {
  const [w, d] = [u1 - u0 - inset, depth - inset];
  const c = round === "right" ? u0 : u1;
  const sign = round === "right" ? 1 : -1;
  const arc = Array.from({ length: STEPS + 1 }, (_, i): [number, number] => {
    const t = (Math.PI / 2) * (i / STEPS);
    return [c + sign * w * Math.cos(t), d * Math.sin(t)];
  });
  return [[c, 0], ...arc];
}

/** A rounded end unit at `u0`…`u1` (`round` its rounded side), `depth` deep, from `z0` up to `z1`; a socle under it from the floor when `socle`. */
export function roundTerminal(name: string, at: At, [u0, u1]: [number, number], round: "left" | "right", depth: number, [z0, z1]: [number, number], shelves: number, socle: number, box: BoxOf): void {
  const plate = (label: string, z: number) => {
    const s = shaped(at, quarterRound(u0, u1, depth, round), z, z + T);
    box(`${name} — ${label}`, "panel", s.at, { outline: s.outline, carcass: true });
  };
  if (socle > 0) {
    const s = shaped(at, quarterRound(u0, u1, depth, round, 30), 0, socle - 3);
    box(`${name} — socle`, "kick", s.at, { outline: s.outline });
  }
  plate("dessous", z0);
  for (let k = 1; k <= shelves; k++) plate(`étagère ${k}`, z0 + ((z1 - z0) * k) / (shelves + 1) - T / 2);
  plate("dessus", z1 - T);
  // Its straight side, against its neighbour.
  const [s0, s1] = round === "right" ? [u0, u0 + T] : [u1 - T, u1];
  const [p, q] = [at(s0, 0), at(s1, depth)];
  box(`${name} — côté`, "panel", [[Math.min(p[0], q[0]), Math.min(p[1], q[1]), z0 + T], [Math.max(p[0], q[0]), Math.max(p[1], q[1]), z1 - T]], { carcass: true });
}

/**
 * The worktop's outline over a run with a rounded end unit at `u0`…`u1` (`round` its side), the worktop from `a` to `b`
 * along the run and `depth` off its back: its end rounded as the unit under it.
 */
export function roundedWorktop(at: At, [a, b]: [number, number], [u0, u1]: [number, number], round: "left" | "right", depth: number): [number, number][] {
  const end = quarterRound(u0, u1, depth, round);
  // The arc runs from the back of the rounded end to the front of its square side.
  const points: [number, number][] = [[round === "right" ? a : b, 0], ...end.slice(1), [round === "right" ? a : b, depth]];
  return points.map(([u, v]) => at(u, v));
}

/**
 * A corner unit cut at 45°, its arms `arm` long on both walls from the corner, `depth` deep (run frame of the run that
 * passes: `u` along it from the corner's wall, `a` off its back towards the room), from `z0` up to `z1`; its socle
 * `socle` high; `front` the fronts' thickness; `top` the worktop's depth, `z2` its top: the triangle of worktop over its front.
 */
export function diagonalCorner(name: string, at: At, arm: number, depth: number, [z0, z1]: [number, number], socle: number, front: number, [top, z2, thick]: [number, number, number], own: BoxOf): void {
  // Marked as the corner's: built even on a run with nothing else on it yet.
  const box: BoxOf = (n, k, where, extra) => own(n, k, where, { ...extra, corner: true });
  const plate = (label: string, z: number, inner = 0) => {
    const pts: [number, number][] = [[0, 0], [arm - inner, 0], [arm - inner, depth + inner], [depth + inner, arm - inner], [0, arm - inner]];
    const s = shaped(at, pts, z, z + T);
    box(`${name} — ${label}`, "panel", s.at, { outline: s.outline, carcass: true });
  };
  plate("dessous", z0);
  plate("étagère", (z0 + z1) / 2 - T / 2, T);
  plate("dessus", z1 - T);
  const side = (label: string, pts: [number, number][]) => {
    const s = shaped(at, pts, z0 + T, z1 - T);
    box(`${name} — ${label}`, "panel", s.at, { outline: s.outline, carcass: true });
  };
  side("côté", [[arm - T, 0], [arm, 0], [arm, depth], [arm - T, depth]]);
  side("côté (2)", [[0, arm - T], [depth, arm - T], [depth, arm], [0, arm]]);
  // The door on the diagonal, in front of it by its thickness.
  const f = front / Math.SQRT2;
  const door = shaped(at, [[arm, depth], [depth, arm], [depth + f, arm + f], [arm + f, depth + f]], z0 + 1.5, z1 - 1.5);
  box(`${name} — porte en biais`, "panel", door.at, { outline: door.outline });
  // The plinth, set back under the door.
  const k = shaped(at, [[arm, depth - 30], [depth - 30, arm], [depth - 46, arm], [arm, depth - 46]], 0, socle - 3);
  box(`${name} — plinthe`, "kick", k.at, { outline: k.outline });
  // The worktop over its front: a triangle between the two runs' worktops, as far over the door as they are.
  const o = (top - depth) * (Math.SQRT2 - 1);
  const w = shaped(at, [[top, top], [arm + o, top], [top, arm + o]], z2 - thick, z2);
  box(`${name} — plan de travail`, "worktop", w.at, { outline: w.outline });
}

/**
 * A caisson in L, its arms `arm` long on both walls from the corner, `depth` deep (as `diagonalCorner`): bottom, two
 * shelves and top in L, a back against each wall (between bottom, top and the sides, as thin as the units' backs), a
 * side at the end of each arm down to the floor, notched at its front over `socle` for the plinth (`notch` deep, at the
 * end of the arm of the run that passes, and of the other's; 0: square). Its folding door and its plinth are the runs'
 * (document/kitchen-plan-build.ts, from its corner's fronts), as the L corner unit's.
 */
export function lCorner(name: string, at: At, arm: number, depth: number, [z0, z1]: [number, number], notch: [number, number], box: BoxOf): void {
  const put: BoxOf = (label, kind, where, extra) => box(`${name} — ${label}`, kind, where, { ...extra, corner: true, carcass: true });
  const plate = (label: string, z: number, inner = 0, back = 0) => {
    const s = shaped(at, [[back, back], [arm - inner, back], [arm - inner, depth], [depth, depth], [depth, arm - inner], [back, arm - inner]], z, z + T);
    put(label, "panel", s.at, { outline: s.outline });
  };
  // The bottom between the sides; the shelves too, in front of the backs, at a third and two thirds.
  plate("dessous", z0, T);
  for (const k of [1, 2]) plate(`étagère ${k}`, z0 + ((z1 - z0) * k) / 3 - T / 2, T, BACK);
  plate("dessus", z1 - T);
  /** A side from the wall (`w`) to the front, across `c`…`c + T`: its outline seen from its face, the notch cut out. */
  const side = (label: string, onU: boolean, c: number, cut: number) => {
    const p = (w: number, k: number) => (onU ? at(c + k, w) : at(w, c + k));
    const [q0, q1] = [p(0, 0), p(depth, T)];
    const axis = Math.abs(p(1, 0)[0] - p(0, 0)[0]) > 0.5 ? 0 : 1;
    const x = (w: number) => p(w, 0)[axis]!;
    const n = z0 > 0 && cut > 0 ? Math.min(cut, depth - T) : 0;
    const points: [number, number][] = n ? [[x(0), 0], [x(depth - n), 0], [x(depth - n), z0], [x(depth), z0], [x(depth), z1 - T], [x(0), z1 - T]] : [[x(0), 0], [x(depth), 0], [x(depth), z1 - T], [x(0), z1 - T]];
    put(label, "panel", [[Math.min(q0[0], q1[0]), Math.min(q0[1], q1[1]), 0], [Math.max(q0[0], q1[0]), Math.max(q0[1], q1[1]), z1 - T]], { profile: { along: axis as 0 | 1, points } });
  };
  side("côté", true, arm - T, notch[0]);
  side("côté (2)", false, arm - T, notch[1]);
  // A back against each wall, the first through the corner, in the units' backs' board.
  const back = (label: string, pts: [number, number][]) => {
    const s = shaped(at, pts, z0 + T, z1 - T);
    box(`${name} — ${label}`, "panel", s.at, { outline: s.outline, corner: true, material: "hdf" });
  };
  back("fond", [[0, 0], [arm - T, 0], [arm - T, BACK], [0, BACK]]);
  back("fond (2)", [[0, BACK], [BACK, BACK], [BACK, arm - T], [0, arm - T]]);
}
