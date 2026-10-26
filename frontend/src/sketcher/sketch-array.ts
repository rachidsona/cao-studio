/**
 * Rectangular pattern inside a sketch (as Fusion's): the selected points and
 * curves are copied over a grid of two directions. The copies are new, free
 * elements: their own points, and the constraints that tie the copied
 * elements to each other (a rectangle stays a rectangle, a dimension keeps
 * its value); nothing ties a copy to the original or to the origin. Pure.
 */
import { RESERVED_IDS, constraintRefs, curvePoints, type SketchConstraint, type SketchCurve, type SketchGeometry } from "../document/sketch";
import { cloneGeometry, nextId, pointPos, type Vec2 } from "./edit";
import type { Preview } from "./tools";

/** The most copies a pattern may make. */
export const MAX_COPIES = 400;

export interface SketchGrid {
  /** Offset between two neighbours in the first direction, and how many copies it makes (the original not counted). */
  step1: Vec2;
  count1: number;
  step2: Vec2;
  count2: number;
}

/** Offsets of the copies: every j × step2 + k × step1, except the original at (0, 0). */
export function gridOffsets(grid: SketchGrid): Vec2[] {
  const out: Vec2[] = [];
  for (let j = 0; j <= grid.count2; j++) {
    for (let k = 0; k <= grid.count1; k++) {
      if (j === 0 && k === 0) continue;
      out.push([grid.step1[0] * k + grid.step2[0] * j, grid.step1[1] * k + grid.step2[1] * j]);
    }
  }
  return out;
}

/** What a selection copies: its curves (projected and nothing else left out) and the points they use or that were chosen alone. */
export function copiedElements(g: SketchGeometry, selection: ReadonlySet<string>): { curves: SketchCurve[]; points: string[] } {
  const curves = g.curves.filter((c) => selection.has(c.id) && !c.projected);
  const points = new Set<string>();
  for (const c of curves) for (const p of curvePoints(c)) points.add(p);
  for (const p of g.points) if (selection.has(p.id) && !RESERVED_IDS.has(p.id)) points.add(p.id);
  return { curves, points: [...points] };
}

export type ArrayOutcome = { ok: true; geometry: SketchGeometry; copies: number; preview: Preview } | { ok: false; reason: string };

const KEEP = new Set(["id", "kind", "label"]);

/** A constraint with the entity ids it names replaced; null when it names something not copied. */
function remap(c: SketchConstraint, ids: Map<string, string>): Record<string, unknown> | null {
  if (c.kind === "fix" || constraintRefs(c).some((r) => RESERVED_IDS.has(r) || !ids.has(r))) return null;
  const copy: Record<string, unknown> = { ...c };
  for (const [key, value] of Object.entries(c)) if (!KEEP.has(key) && typeof value === "string" && ids.has(value)) copy[key] = ids.get(value);
  return copy;
}

export function arrayElements(g: SketchGeometry, selection: ReadonlySet<string>, grid: SketchGrid): ArrayOutcome {
  const { curves, points } = copiedElements(g, selection);
  if (curves.length === 0 && points.length === 0) return { ok: false, reason: "Cliquez les éléments à copier." };
  const offsets = gridOffsets(grid);
  if (offsets.length === 0) return { ok: false, reason: "Mettez une quantité de 2 ou plus dans au moins une direction." };
  if (offsets.length > MAX_COPIES) return { ok: false, reason: `Trop de copies (${MAX_COPIES} au plus).` };
  if (offsets.every(([dx, dy]) => Math.hypot(dx, dy) < 1e-6)) return { ok: false, reason: "Le pas est nul." };
  return copyAtOffsets(g, selection, offsets);
}

/** The selected elements copied once at each offset (new free points, curves and the constraints between copied elements). */
export function copyAtOffsets(g: SketchGeometry, selection: ReadonlySet<string>, offsets: Vec2[]): ArrayOutcome {
  const { curves, points } = copiedElements(g, selection);
  if (curves.length === 0 && points.length === 0) return { ok: false, reason: "Cliquez les éléments à copier." };
  if (offsets.length > MAX_COPIES) return { ok: false, reason: `Trop de copies (${MAX_COPIES} au plus).` };
  const work = cloneGeometry(g);
  const preview: Preview = { lines: [], circles: [], arcs: [] };
  const inside = new Set([...points, ...curves.map((c) => c.id)]);
  const copiedConstraints = g.constraints.filter((c) => !RESERVED_IDS.has(c.id) && constraintRefs(c).every((r) => inside.has(r)));
  for (const [dx, dy] of offsets) {
    const ids = new Map<string, string>();
    for (const id of points) {
      const [x, y] = pointPos(g, id);
      const fresh = nextId(work, "p");
      work.points.push({ id: fresh, x: Number((x + dx).toFixed(6)), y: Number((y + dy).toFixed(6)) });
      ids.set(id, fresh);
    }
    for (const c of curves) {
      const fresh = nextId(work, c.kind === "line" ? "l" : c.kind === "circle" ? "k" : "a");
      ids.set(c.id, fresh);
      const { id: _id, ...rest } = c;
      const mapped = { ...rest, id: fresh } as Record<string, unknown>;
      for (const key of ["p1", "p2", "center", "start", "end"]) if (typeof mapped[key] === "string") mapped[key] = ids.get(mapped[key] as string) ?? mapped[key];
      work.curves.push(mapped as unknown as SketchCurve);
      const at = (id: string): Vec2 => pointPos(work, ids.get(id) as string);
      if (c.kind === "line") preview.lines.push([at(c.p1), at(c.p2)]);
      else if (c.kind === "circle") preview.circles.push({ center: at(c.center), radius: c.radius });
      else preview.arcs.push({ center: at(c.center), radius: c.radius, start: c.startAngle, end: c.endAngle });
    }
    for (const c of copiedConstraints) {
      const mapped = remap(c, ids);
      if (mapped) work.constraints.push({ ...mapped, id: nextId(work, "c") } as unknown as SketchConstraint);
    }
  }
  return { ok: true, geometry: work, copies: offsets.length, preview };
}
