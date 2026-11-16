/**
 * « Centrer » (esquisse) : deux dessins choisis — un rectangle dans un rectangle, un cercle dans un carré, un
 * polygone… — et le plus petit va au milieu du plus grand, et y reste : un point de construction au centre du grand
 * (le milieu de sa diagonale ; son centre pour un cercle), et le petit tenu symétrique autour de lui (sa diagonale ;
 * son centre pour un cercle). Le grand change de taille ou bouge, le petit reste au milieu. Pur.
 */
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import { addConstraint, findCurve, nextId, pointPos } from "./edit";

type Shape = { kind: "round"; center: string } | { kind: "outline"; a: string; b: string };

/** The drawings the selected curves belong to: each one, whole — every curve joined to it by a shared point. */
function drawings(g: SketchGeometry, ids: readonly string[]): string[][] {
  const pointsOf = (id: string): string[] => {
    const c = findCurve(g, id);
    return !c ? [] : c.kind === "line" ? [c.p1, c.p2] : c.kind === "circle" ? [c.center] : c.kind === "arc" ? [c.center, c.start, c.end] : [];
  };
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const id of ids.filter((x) => findCurve(g, x))) {
    if (seen.has(id)) continue;
    // Flood along shared points (a construction line does not join two drawings).
    const curves = new Set([id]);
    const points = new Set(pointsOf(id));
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of g.curves) {
        if (curves.has(c.id) || c.construction || !pointsOf(c.id).some((p) => points.has(p))) continue;
        curves.add(c.id);
        for (const p of pointsOf(c.id)) points.add(p);
        grew = true;
      }
    }
    for (const c of curves) seen.add(c);
    out.push([...curves]);
  }
  return out;
}

/** How a drawing is centred: its centre (a circle), or its two farthest points (the diagonal of a rectangle). */
function shapeOf(g: SketchGeometry, curves: readonly string[]): { shape: Shape; size: number } | null {
  const round = curves.map((id) => findCurve(g, id)).find((c) => c?.kind === "circle" || c?.kind === "arc");
  if (curves.length === 1 && round && (round.kind === "circle" || round.kind === "arc")) {
    // Its diameter, to compare with another's diagonal.
    return { shape: { kind: "round", center: round.center }, size: 2 * round.radius };
  }
  const points = [...new Set(curves.flatMap((id) => {
    const c = findCurve(g, id)!;
    return c.kind === "line" ? [c.p1, c.p2] : c.kind === "arc" ? [c.start, c.end] : [];
  }))];
  if (points.length < 2) return null;
  let best: { a: string; b: string; d: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [p, q] = [pointPos(g, points[i]!), pointPos(g, points[j]!)];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d > best.d) best = { a: points[i]!, b: points[j]!, d };
    }
  }
  return best ? { shape: { kind: "outline", a: best.a, b: best.b }, size: best.d } : null;
}

/** The middle of a drawing as it is now. */
function middleOf(g: SketchGeometry, s: Shape): [number, number] {
  if (s.kind === "round") return pointPos(g, s.center);
  const [p, q] = [pointPos(g, s.a), pointPos(g, s.b)];
  return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
}

/**
 * The sketch with the smaller of the two drawings chosen held in the middle of the larger (not solved yet: the
 * solver moves it there); or why it cannot be.
 */
export function withCentered(g: SketchGeometry, selected: readonly string[]): { geometry: SketchGeometry; inner: string[] } | string {
  const groups = drawings(g, selected);
  if (groups.length !== 2) return "Choisissez deux dessins (Maj + clic sur un trait de chacun, ou une fenêtre) : le plus petit ira au milieu du plus grand.";
  const shapes = groups.map((curves) => ({ curves, found: shapeOf(g, curves) }));
  if (shapes.some((s) => !s.found)) return "Un des dessins n'a pas de milieu à trouver : prenez un rectangle, un polygone ou un cercle.";
  const [outer, inner] = [...shapes].sort((a, b) => b.found!.size - a.found!.size) as [typeof shapes[number], typeof shapes[number]];
  const o = outer.found!.shape;
  const i = inner.found!.shape;
  // The smaller moved to the middle first: the constraints then hold it there, and the larger does not move.
  const [ox, oy] = middleOf(g, o);
  const [ix, iy] = middleOf(g, i);
  const moved = new Set(inner.curves.flatMap((id) => {
    const c = findCurve(g, id)!;
    return c.kind === "line" ? [c.p1, c.p2] : c.kind === "circle" ? [c.center] : c.kind === "arc" ? [c.center, c.start, c.end] : [];
  }));
  let geometry: SketchGeometry = { ...g, points: g.points.map((p) => (moved.has(p.id) && !p.fixed ? { ...p, x: p.x + ox - ix, y: p.y + oy - iy } : p)) };
  const add = (c: Omit<SketchConstraint, "id">) => (geometry = addConstraint(geometry, c).geometry);
  if (o.kind === "round" && i.kind === "round") {
    add({ kind: "coincident", a: i.center, b: o.center } as Omit<SketchConstraint, "id">);
    return { geometry, inner: inner.curves };
  }
  // The centre of the larger: its own (a circle), or a point at the middle of its diagonal.
  let centre: string;
  if (o.kind === "round") centre = o.center;
  else {
    centre = nextId(geometry, "p");
    geometry = { ...geometry, points: [...geometry.points, { id: centre, x: ox, y: oy }] };
    add({ kind: "symmetric", a: o.a, b: o.b, axis: centre } as Omit<SketchConstraint, "id">);
  }
  if (i.kind === "round") add({ kind: "coincident", a: i.center, b: centre } as Omit<SketchConstraint, "id">);
  else add({ kind: "symmetric", a: i.a, b: i.b, axis: centre } as Omit<SketchConstraint, "id">);
  return { geometry, inner: inner.curves };
}
