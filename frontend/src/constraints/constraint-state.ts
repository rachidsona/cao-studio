/**
 * L'état des contraintes de l'esquisse, trait par trait, comme dans Fusion : un trait que les cotes et contraintes
 * figent entièrement est dessiné en blanc (la vue est sombre), celui qui peut encore bouger en bleu. « Contraindre tout » pose les cotes
 * qui manquent pour tout figer, à leur mesure actuelle (le dessin ne bouge pas) : d'abord les longueurs, diamètres et
 * rayons, puis les angles des traits penchés, enfin la position des points depuis l'origine.
 *
 * Un point est figé quand le fixer en plus ne retire aucun degré de liberté à l'esquisse : sa place était déjà
 * imposée. Le rayon d'un cercle, de même. Pur ; un essai du solveur par point (au-delà de MAX_POINTS, on ne dit rien).
 */
import { AXIS_X, curvePoints, ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import { addConstraint, pointPos } from "../sketcher/edit";
import { probeSketch, type SolveResult } from "./solver";

/** Beyond this many points, the per-curve state is not worked out (too many solver runs). */
export const MAX_POINTS = 150;

type NewConstraint = Omit<SketchConstraint, "id">;

/** The degrees of freedom of the sketch with one more constraint (null: refused — in conflict, or no solution). */
function dofWith(g: SketchGeometry, extra: NewConstraint): number | null {
  try {
    const r = probeSketch(addConstraint(g, extra).geometry);
    return r.ok ? r.dof : null;
  } catch {
    return null;
  }
}

/** The curves the sketch holds entirely (all of them when nothing is left to fix; null: not worked out). */
export function fixedCurves(g: SketchGeometry, dof: number): Set<string> | null {
  if (dof === 0) return new Set(g.curves.map((c) => c.id));
  const used = new Set(g.curves.flatMap((c) => curvePoints(c)));
  if (used.size > MAX_POINTS) return null;
  const held = new Map<string, boolean>();
  const pointHeld = (id: string): boolean => {
    if (id === ORIGIN) return true;
    const known = held.get(id);
    if (known !== undefined) return known;
    const point = g.points.find((p) => p.id === id);
    let fixed = point?.fixed === true;
    if (!fixed && point) fixed = dofWith(g, { kind: "fix", point: id, x: point.x, y: point.y } as NewConstraint) === dof;
    held.set(id, fixed);
    return fixed;
  };
  const out = new Set<string>();
  for (const c of g.curves) {
    if (!curvePoints(c).every(pointHeld)) continue;
    // A circle's size is its own: its radius tried too (an arc's follows from its centre and ends).
    if (c.kind === "circle" && dofWith(g, { kind: "radius", curve: c.id, value: c.radius } as NewConstraint) !== dof) continue;
    out.add(c.id);
  }
  return out;
}

const cache = new WeakMap<SolveResult, Set<string> | null>();

/** The curves held, for a solve result (worked out once per result). */
export function fixedCurvesOf(result: SolveResult): Set<string> | null {
  if (result.state === "conflicting" || result.state === "failed") return null;
  if (!cache.has(result)) cache.set(result, fixedCurves(result.geometry, result.dof));
  return cache.get(result) ?? null;
}

/** The dimensions that would fix the sketch entirely, in the order they are tried. */
function candidates(g: SketchGeometry): NewConstraint[] {
  const curves = [...g.curves.filter((c) => !c.construction), ...g.curves.filter((c) => c.construction)].filter((c) => !c.projected);
  const sizes: NewConstraint[] = [];
  const angles: NewConstraint[] = [];
  for (const c of curves) {
    if (c.kind === "line") {
      const [a, b] = [pointPos(g, c.p1), pointPos(g, c.p2)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length > 1e-6) sizes.push({ kind: "length", line: c.id, value: Number(length.toFixed(6)) } as NewConstraint);
      const turn = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      angles.push({ kind: "angle", a: AXIS_X, b: c.id, value: Number(turn.toFixed(6)) } as NewConstraint);
    } else if (c.kind === "circle") sizes.push({ kind: "diameter", curve: c.id, value: Number((2 * c.radius).toFixed(6)) } as NewConstraint);
    else sizes.push({ kind: "radius", curve: c.id, value: Number(c.radius.toFixed(6)) } as NewConstraint);
  }
  const places: NewConstraint[] = [];
  for (const id of new Set(curves.flatMap((c) => curvePoints(c)))) {
    if (id === ORIGIN) continue;
    const [x, y] = pointPos(g, id);
    places.push({ kind: "distanceX", a: ORIGIN, b: id, value: Number(x.toFixed(6)) } as NewConstraint, { kind: "distanceY", a: ORIGIN, b: id, value: Number(y.toFixed(6)) } as NewConstraint);
  }
  return [...sizes, ...angles, ...places];
}

/** « Contraindre tout »: the sketch with the dimensions that fix it, and how many were laid. */
export function fullyDefine(g: SketchGeometry): { geometry: SketchGeometry; count: number; dof: number } {
  let dof: number;
  try {
    const first = probeSketch(g);
    if (!first.ok) return { geometry: g, count: 0, dof: first.dof };
    dof = first.dof;
  } catch {
    return { geometry: g, count: 0, dof: -1 };
  }
  let work = g;
  let count = 0;
  for (const c of candidates(g)) {
    if (dof === 0) break;
    // One equation that takes a degree of freedom off cannot repeat the others.
    const next = dofWith(work, c);
    if (next === null || next >= dof) continue;
    work = addConstraint(work, c).geometry;
    dof = next;
    count++;
  }
  return { geometry: work, count, dof };
}
