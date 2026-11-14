/**
 * Cotes en chaîne d'un clic : une rangée de cotes d'un point au suivant, utile pour placer des étagères, des
 * perçages ou des cloisons.
 *  - un côté choisi seul : les points posés sur ce côté (ses bouts, les traits qui y aboutissent), du premier au
 *    dernier, le long du côté (cotes horizontales, verticales ou alignées selon le côté) ;
 *  - plusieurs éléments : leurs points (bouts des traits, centres des cercles et des arcs), rangés le long de l'axe où
 *    ils s'étalent le plus, une cote par écart.
 * Chaque cote fige sa mesure quand l'esquisse la prend ; celle qui serait déjà imposée par les autres (la dernière
 * d'une chaîne dont le total est coté) devient une cote de référence, qui suit sans contredire. Pur.
 */
import { solveSketch } from "../constraints/solver";
import { ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import { addConstraint, findCurve, pointPos, type Vec2 } from "./edit";

type NewConstraint = Omit<SketchConstraint, "id">;

/** What the chain is laid along: the points of the selection (ids, in selection order). */
export interface ChainPick {
  points: string[];
  lines: string[];
  circles: string[];
  arcs: string[];
}

/** Two points closer than this (mm) are one level of the chain. */
const SAME = 1e-3;

/** The points of the sketch on the side `line`, from one end to the other (none: not a drawn line). */
export function pointsOnSide(g: SketchGeometry, line: string): string[] {
  const curve = findCurve(g, line);
  if (curve?.kind !== "line") return [];
  const [a, b] = [pointPos(g, curve.p1), pointPos(g, curve.p2)];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return [];
  const along = (p: Vec2) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
  const off = (p: Vec2) => Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
  const ids = [ORIGIN, ...g.points.map((p) => p.id)];
  const on = ids
    .map((id) => ({ id, p: pointPos(g, id) }))
    .filter(({ p }) => off(p) < SAME && along(p) > -SAME && along(p) < length + SAME)
    .map((q) => ({ ...q, t: along(q.p) }));
  // Its own ends first, so they stand for their level.
  const rank = (id: string) => (id === curve.p1 || id === curve.p2 ? 0 : 1);
  on.sort((m, n) => m.t - n.t || rank(m.id) - rank(n.id));
  return on.filter((q, i) => i === 0 || Math.abs(q.t - on[i - 1]!.t) >= SAME).map((q) => q.id);
}

/** The points a multiple selection stands for: points, ends of lines, centres of circles and arcs. */
function pickedPoints(g: SketchGeometry, pick: ChainPick): string[] {
  const out: string[] = [...pick.points];
  for (const id of pick.lines) {
    const c = findCurve(g, id);
    if (c?.kind === "line") out.push(c.p1, c.p2);
  }
  for (const id of [...pick.circles, ...pick.arcs]) {
    const c = findCurve(g, id);
    if (c && c.kind !== "line") out.push(c.center);
  }
  return [...new Set(out)];
}

/** The dimensions of the chain, measured; each driving if the sketch can take it, otherwise a reference. */
export function chainDimensions(g: SketchGeometry, pick: ChainPick): NewConstraint[] {
  const side = pick.lines.length === 1 && pick.points.length + pick.circles.length + pick.arcs.length === 0 ? pick.lines[0]! : null;
  let order: string[];
  let kind: "distanceX" | "distanceY" | "distance";
  if (side) {
    order = pointsOnSide(g, side);
    const c = findCurve(g, side);
    const [a, b] = c?.kind === "line" ? [pointPos(g, c.p1), pointPos(g, c.p2)] : [[0, 0] as Vec2, [1, 0] as Vec2];
    kind = Math.abs(b[1] - a[1]) < 1e-9 ? "distanceX" : Math.abs(b[0] - a[0]) < 1e-9 ? "distanceY" : "distance";
  } else {
    const pos = pickedPoints(g, pick).map((id) => ({ id, p: pointPos(g, id) }));
    if (pos.length < 2) return [];
    const spread = (axis: 0 | 1) => Math.max(...pos.map((q) => q.p[axis])) - Math.min(...pos.map((q) => q.p[axis]));
    const axis: 0 | 1 = spread(0) >= spread(1) ? 0 : 1;
    kind = axis === 0 ? "distanceX" : "distanceY";
    pos.sort((m, n) => m.p[axis] - n.p[axis]);
    order = pos.filter((q, i) => i === 0 || Math.abs(q.p[axis] - pos[i - 1]!.p[axis]) >= SAME).map((q) => q.id);
  }
  if (order.length < 2) return [];
  const out: NewConstraint[] = [];
  let work = g;
  // A row clear of the drawing, as the automatic dimensions lay theirs.
  const [first, last] = [pointPos(g, order[0]!), pointPos(g, order.at(-1)!)];
  const offset = Number((Math.max(Math.hypot(last[0] - first[0], last[1] - first[1]) * 0.12, 1)).toFixed(3));
  for (let i = 0; i + 1 < order.length; i++) {
    let [a, b] = [order[i]!, order[i + 1]!];
    // From the lower to the higher, so that the value is positive.
    const axis = kind === "distanceY" ? 1 : 0;
    if (kind !== "distance" && pointPos(g, b)[axis] < pointPos(g, a)[axis]) [a, b] = [b, a];
    const [pa, pb] = [pointPos(g, a), pointPos(g, b)];
    const value = kind === "distanceX" ? pb[0] - pa[0] : kind === "distanceY" ? pb[1] - pa[1] : Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const dim = { kind, a, b, value: Number(value.toFixed(6)), offset } as NewConstraint;
    const added = addConstraint(work, dim).geometry;
    let driving = false;
    try {
      driving = solveSketch(added).state === "ok";
    } catch {
      // A reference.
    }
    if (driving) work = added;
    out.push(driving ? dim : ({ ...dim, driving: false } as NewConstraint));
  }
  return out;
}
