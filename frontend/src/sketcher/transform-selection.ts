/**
 * Symétrie, rotation et mise à l'échelle des éléments choisis dans l'esquisse, en copie (l'original reste) ou sur
 * place. Une transformation affine du plan : les points suivent, un arc retourné par une symétrie échange ses bouts,
 * les rayons et les cotes de longueur suivent l'échelle ; les contraintes entre éléments choisis suivent quand elles
 * ont encore un sens (horizontale et verticale gardées, échangées à un quart de tour, retirées sinon ; cotes en X ou
 * en Y retirées hors d'un geste d'équerre). Une copie par symétrie autour d'une ligne de l'esquisse lui reste liée par
 * des contraintes de symétrie, comme dans Fusion. Pur.
 */
import { DIMENSION_KINDS, RESERVED_IDS, constraintRefs, type SketchConstraint, type SketchCurve, type SketchGeometry } from "../document/sketch";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import { copiedElements } from "./sketch-array";

/** p ↦ [a·x + b·y + tx, c·x + d·y + ty]. */
export interface Affine {
  m: [number, number, number, number];
  t: Vec2;
}

const EPS = 1e-9;
export const apply = (f: Affine, [x, y]: Vec2): Vec2 => [f.m[0] * x + f.m[1] * y + f.t[0], f.m[2] * x + f.m[3] * y + f.t[1]];
const about = (m: Affine["m"], [cx, cy]: Vec2): Affine => ({ m, t: [cx - (m[0] * cx + m[1] * cy), cy - (m[2] * cx + m[3] * cy)] });

export function rotation(center: Vec2, degrees: number): Affine {
  const r = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return about([c, -s, s, c], center);
}

export function scaling(center: Vec2, k: number): Affine {
  return about([k, 0, 0, k], center);
}

/** The mirror across the line through `point` along `direction`. */
export function reflection(point: Vec2, direction: Vec2): Affine {
  const l = Math.hypot(direction[0], direction[1]) || 1;
  const [ux, uy] = [direction[0] / l, direction[1] / l];
  return about([ux * ux - uy * uy, 2 * ux * uy, 2 * ux * uy, uy * uy - ux * ux], point);
}

const det = (f: Affine) => f.m[0] * f.m[3] - f.m[1] * f.m[2];
const round = (v: number) => Number(v.toFixed(6));

/** What becomes of a horizontal or vertical constraint: kept (axes kept), swapped (quarter turn), or dropped. */
function axesOf(f: Affine): "keep" | "swap" | "drop" {
  if (Math.abs(f.m[1]) < 1e-9 && Math.abs(f.m[2]) < 1e-9) return "keep";
  if (Math.abs(f.m[0]) < 1e-9 && Math.abs(f.m[3]) < 1e-9) return "swap";
  return "drop";
}

/** The constraint after the transform (null: it no longer holds), its ids renamed by `ids` (when copying). */
function carry(c: SketchConstraint, f: Affine, ids: Map<string, string> | null): SketchConstraint | null {
  if (c.kind === "fix") return null;
  const k = Math.sqrt(Math.abs(det(f)));
  const axes = axesOf(f);
  let out: Record<string, unknown> = { ...c };
  if (c.kind === "horizontal" || c.kind === "vertical") {
    if (axes === "drop") return null;
    if (axes === "swap") out.kind = c.kind === "horizontal" ? "vertical" : "horizontal";
  } else if (c.kind === "distanceX" || c.kind === "distanceY") {
    // Signed along an axis: only a gesture that keeps the axes and their senses keeps it, at the new scale.
    if (axes !== "keep" || f.m[0] < 0 || f.m[3] < 0) return null;
    out.value = round((c.value as number) * k);
  } else if (c.kind === "angle") {
    if (det(f) < 0) return null;
  } else if (DIMENSION_KINDS.has(c.kind)) out.value = round(((c as { value: number }).value) * k);
  if (ids) {
    const renamed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out)) renamed[key] = key !== "id" && key !== "kind" && key !== "label" && typeof value === "string" && ids.has(value) ? ids.get(value) : value;
    out = renamed;
  }
  return out as unknown as SketchConstraint;
}

export type TransformOutcome = { ok: true; geometry: SketchGeometry; count: number } | { ok: false; reason: string };

/**
 * The selected elements transformed by `f`: copied (new points, curves and the constraints between them; the copy of
 * a mirror across the line `link` stays symmetric to the original) or moved in place.
 */
export function transformSelection(g: SketchGeometry, selection: ReadonlySet<string>, f: Affine, copy: boolean, link?: string): TransformOutcome {
  const { curves, points } = copiedElements(g, selection);
  if (!curves.length && !points.length) return { ok: false, reason: "Sélectionnez d'abord les traits à transformer." };
  const fixed = points.find((id) => g.points.find((p) => p.id === id)?.fixed);
  if (fixed && !copy) return { ok: false, reason: "Un des points est fixe (repère projeté ou importé) : faites une copie." };
  const k = Math.sqrt(Math.abs(det(f)));
  const flips = det(f) < 0;
  const work = cloneGeometry(g);
  const ids = new Map<string, string>();
  const angle = (center: Vec2, p: Vec2) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  // Points: new ones for a copy, the same ones moved otherwise.
  for (const id of points) {
    const [x, y] = apply(f, pointPos(g, id));
    if (copy) {
      const fresh = nextId(work, "p");
      work.points.push({ id: fresh, x: round(x), y: round(y) });
      ids.set(id, fresh);
    } else {
      const p = work.points.find((q) => q.id === id);
      if (p) [p.x, p.y] = [round(x), round(y)];
    }
  }
  const remake = (c: SketchCurve, id: string): SketchCurve => {
    const map = (pid: string) => (copy ? (ids.get(pid) ?? pid) : pid);
    if (c.kind === "line") return { ...c, id, p1: map(c.p1), p2: map(c.p2), projected: undefined };
    if (c.kind === "circle") return { ...c, id, center: map(c.center), radius: round(c.radius * k), projected: undefined };
    // A mirror turns an arc round: what was its end is now its start.
    const [start, end] = flips ? [map(c.end), map(c.start)] : [map(c.start), map(c.end)];
    const center = map(c.center);
    const cp = pointPos(work, center);
    return { ...c, id, center, start, end, radius: round(c.radius * k), startAngle: angle(cp, pointPos(work, start)), endAngle: angle(cp, pointPos(work, end)), projected: undefined };
  };
  for (const c of curves) {
    if (copy) {
      const fresh = nextId(work, c.kind === "line" ? "l" : c.kind === "circle" ? "k" : "a");
      ids.set(c.id, fresh);
      work.curves.push(JSON.parse(JSON.stringify(remake(c, fresh))) as SketchCurve);
    } else {
      const i = work.curves.findIndex((x) => x.id === c.id);
      work.curves[i] = JSON.parse(JSON.stringify(remake(c, c.id))) as SketchCurve;
    }
  }
  // Constraints between transformed elements.
  const inside = new Set([...points, ...curves.map((c) => c.id)]);
  const within = g.constraints.filter((c) => !RESERVED_IDS.has(c.id) && constraintRefs(c).every((r) => inside.has(r)));
  if (copy) {
    for (const c of within) {
      const carried = carry(c, f, ids);
      if (carried) work.constraints.push({ ...carried, id: nextId(work, "c") });
    }
    // The copy of a mirror across a line of the sketch stays its mirror image.
    if (link && flips) for (const id of points) work.constraints.push({ id: nextId(work, "c"), kind: "symmetric", a: id, b: ids.get(id)!, axis: link });
  } else {
    work.constraints = work.constraints.flatMap((c) => {
      if (!within.some((w) => w.id === c.id)) return c.kind === "fix" && points.includes(c.point) ? [] : [c];
      const carried = carry(c, f, null);
      return carried ? [carried] : [];
    });
  }
  return { ok: true, geometry: work, count: curves.length || points.length };
}

/** The middle of the selected elements' points (the centre of a rotation or a scale "on the selection"). */
export function selectionCenter(g: SketchGeometry, selection: ReadonlySet<string>): Vec2 | null {
  const { points } = copiedElements(g, selection);
  if (!points.length) return null;
  const pos = points.map((id) => pointPos(g, id));
  const xs = pos.map((p) => p[0]);
  const ys = pos.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * A circular pattern: `count` elements in all (the original first), spread over `total` degrees around `center` —
 * evenly round a whole turn (360), else from the original to the last one.
 */
export function polarCopies(g: SketchGeometry, selection: ReadonlySet<string>, center: Vec2, count: number, total: number): TransformOutcome {
  if (!Number.isInteger(count) || count < 2 || count > 200) return { ok: false, reason: "De 2 à 200 éléments en tout." };
  if (!(Math.abs(total) > 0 && Math.abs(total) <= 360)) return { ok: false, reason: "L'angle total va de 1 à 360°." };
  const step = Math.abs(Math.abs(total) - 360) < 1e-9 ? total / count : total / (count - 1);
  let geometry = g;
  for (let i = 1; i < count; i++) {
    const out = transformSelection(geometry, selection, rotation(center, step * i), true);
    if (!out.ok) return out;
    geometry = out.geometry;
  }
  return { ok: true, geometry, count: count - 1 };
}
