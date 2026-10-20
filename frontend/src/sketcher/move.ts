/**
 * Move in a sketch, as pure functions on the geometry.
 *
 * The points to move are those selected plus the points of the selected
 * curves (a circle moves by its centre, its radius is kept). The move is not
 * a visual shift: the moved points are pinned at their new place, the sketch
 * is solved again with all its constraints, and the result is refused with
 * the constraints named when it cannot satisfy them. Points tied to the
 * moved ones (a coincidence, a perpendicular, a dimension) follow as the
 * solver decides; fixed points (projected body geometry, the origin) never
 * move.
 *
 * Also the move of a whole sketch in 3D: along its normal (its plane offset)
 * or inside its plane (its origin).
 */
import { solveSketch, SketchError } from "../constraints/solver";
import { describeConstraints } from "../constraints/catalog";
import { curvePoints, ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { SketchFeature, Vec3 } from "../document/types";
import { cloneGeometry, pointPos, type Vec2 } from "./edit";
import { sketchFrame } from "./frame";
import { connectedChain } from "./offset";
import type { Preview } from "./tools";

/** Prefix of the temporary pins that hold the moved points at their target while solving. */
const PIN = "mvpin";

/** Points that move with a selection: the selected points, and the points of the selected curves. */
export function movablePoints(g: SketchGeometry, selection: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  const points = new Set<string>([ORIGIN, ...g.points.map((p) => p.id)]);
  for (const id of selection) {
    if (points.has(id)) ids.add(id);
    const curve = g.curves.find((c) => c.id === id);
    if (curve) for (const p of curvePoints(curve)) ids.add(p);
  }
  return [...ids];
}

/** The curves of the contour a curve belongs to (a rectangle: its four sides). */
export function contourOf(g: SketchGeometry, curveId: string): string[] {
  return connectedChain(g, curveId);
}

/** Adds to `selection` the whole contour of each selected curve. */
export function withContours(g: SketchGeometry, selection: ReadonlySet<string>): Set<string> {
  const next = new Set(selection);
  for (const id of selection) if (g.curves.some((c) => c.id === id)) for (const c of contourOf(g, id)) next.add(c);
  return next;
}

/** The point the move is measured from: the one selected point, else the centre of the moved points. */
export function basePoint(g: SketchGeometry, selection: ReadonlySet<string>, pointIds: string[]): { pos: Vec2; label: string } | null {
  if (pointIds.length === 0) return null;
  const chosen = pointIds.filter((id) => selection.has(id));
  if (chosen.length === 1) return { pos: pointPos(g, chosen[0] as string), label: "point sélectionné" };
  const at = pointIds.map((id) => pointPos(g, id));
  const xs = at.map((p) => p[0]);
  const ys = at.map((p) => p[1]);
  return { pos: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], label: "centre de la sélection" };
}

export const polarToDelta = (distance: number, angleDeg: number): Vec2 => [distance * Math.cos((angleDeg * Math.PI) / 180), distance * Math.sin((angleDeg * Math.PI) / 180)];

export function deltaToPolar([dx, dy]: Vec2): { distance: number; angle: number } {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { distance: Math.hypot(dx, dy), angle: Math.abs(angle) < 1e-12 ? 0 : angle };
}

export type MoveOutcome = { ok: true; geometry: SketchGeometry; unchanged: boolean; dof: number } | { ok: false; reason: string };

/** Why these points cannot be moved at all, or null. */
export function immovable(g: SketchGeometry, pointIds: string[]): string | null {
  if (pointIds.includes(ORIGIN)) return "Le centre d'un élément est l'origine de l'esquisse : elle ne se déplace pas.";
  const fixed = pointIds.filter((id) => g.points.find((p) => p.id === id)?.fixed);
  if (fixed.length) return "La sélection contient un point fixe (géométrie projetée d'un corps) : il ne peut pas être déplacé.";
  return null;
}

/**
 * Moves `pointIds` by `delta` and solves the sketch with its constraints.
 * `ok: false` carries the reason in plain words (constraints named).
 */
export function moveGeometry(g: SketchGeometry, pointIds: string[], delta: Vec2): MoveOutcome {
  if (pointIds.length === 0) return { ok: false, reason: "Sélectionnez les éléments à déplacer." };
  const blocked = immovable(g, pointIds);
  if (blocked) return { ok: false, reason: blocked };
  if (!(Number.isFinite(delta[0]) && Number.isFinite(delta[1]))) return { ok: false, reason: "Le déplacement n'est pas un nombre." };
  if (Math.hypot(...delta) < 1e-9) return { ok: true, geometry: g, unchanged: true, dof: solveDof(g) };

  const moved = new Set(pointIds);
  const target = cloneGeometry(g);
  for (const p of target.points) {
    if (!moved.has(p.id)) continue;
    p.x += delta[0];
    p.y += delta[1];
  }
  const pins: SketchConstraint[] = target.points
    .filter((p) => moved.has(p.id))
    .map((p, i) => ({ id: `${PIN}${i + 1}`, kind: "fix", point: p.id, x: p.x, y: p.y }));
  let result;
  try {
    result = solveSketch({ ...target, constraints: [...target.constraints, ...pins] }, { diagnose: false });
  } catch (error) {
    return { ok: false, reason: error instanceof SketchError ? error.message : String(error) };
  }
  if (result.state === "conflicting") {
    const real = result.conflicting.filter((id) => !id.startsWith(PIN));
    const named = real.length ? describeConstraints(g, real) : "";
    return {
      ok: false,
      reason: named
        ? `Déplacement refusé : il contredit des contraintes (${named}). Supprimez-les, ou déplacez aussi les éléments qu'elles relient.`
        : "Déplacement refusé : il contredit les contraintes de l'esquisse.",
    };
  }
  if (result.state === "failed") return { ok: false, reason: "Déplacement refusé : le solveur ne trouve pas de solution avec les contraintes." };
  const geometry: SketchGeometry = { ...result.geometry, constraints: g.constraints };
  return { ok: true, geometry, unchanged: false, dof: solveDof(geometry) };
}

function solveDof(g: SketchGeometry): number {
  try {
    return solveSketch(g, { diagnose: false }).dof;
  } catch {
    return 0;
  }
}

/** Dashed copy of what changed between two geometries: the curves with a moved point, as they will be. */
export function movePreview(before: SketchGeometry, after: SketchGeometry): Preview {
  const preview: Preview = { lines: [], circles: [], arcs: [] };
  for (const curve of after.curves) {
    const changed = curvePoints(curve).some((id) => {
      const a = pointPos(before, id);
      const b = pointPos(after, id);
      return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9;
    });
    if (!changed) continue;
    if (curve.kind === "line") preview.lines.push([pointPos(after, curve.p1), pointPos(after, curve.p2)]);
    else if (curve.kind === "circle") preview.circles.push({ center: pointPos(after, curve.center), radius: curve.radius });
    else preview.arcs.push({ center: pointPos(after, curve.center), radius: curve.radius, start: curve.startAngle, end: curve.endAngle });
  }
  // A moved point on its own (no curve) has nothing to draw: the sketch shows it where it will be once confirmed.
  return preview;
}

/**
 * Moves a whole sketch by a displacement in the global frame, as the sketch
 * placement moves in Fusion: the part along its normal changes the offset of
 * its plane, the part inside the plane moves its origin (`shift`). The
 * geometry and its constraints are untouched, so a sketch tied to its own
 * origin moves as one piece.
 */
export function moveSketchPlane(sketch: SketchFeature, delta: Vec3): SketchFeature {
  const frame = sketchFrame(sketch.plane, sketch.offset, sketch.shift);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const round = (x: number) => Number(x.toFixed(6));
  const shift: [number, number] = [round((sketch.shift?.[0] ?? 0) + dot(delta, frame.u)), round((sketch.shift?.[1] ?? 0) + dot(delta, frame.v))];
  const { shift: _old, ...rest } = sketch;
  return { ...rest, offset: round(sketch.offset + dot(delta, frame.normal)), ...(shift[0] !== 0 || shift[1] !== 0 ? { shift } : {}) };
}
