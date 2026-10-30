/**
 * Formes toutes faites de l'esquisse, comme dans Fusion : le polygone régulier inscrit (côtés égaux, sommets sur un
 * cercle de construction : il garde son centre, sa taille et son orientation libres) et l'oblong de centre à centre
 * (deux demi-cercles de même rayon tangents à deux lignes : libres ses deux centres et sa largeur). Fonctions pures.
 */
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import { cloneGeometry, nextId, type Vec2 } from "./edit";

const round = (v: number) => Number(v.toFixed(9));

function builder(g: SketchGeometry, construction: boolean) {
  const next = cloneGeometry(g);
  const created: string[] = [];
  const flag = construction ? { construction: true } : {};
  return {
    next,
    created,
    point(at: Vec2, existing?: string): string {
      if (existing) return existing;
      const id = nextId(next, "p");
      next.points.push({ id, x: round(at[0]), y: round(at[1]) });
      return id;
    },
    line(p1: string, p2: string, own = flag): string {
      const id = nextId(next, "l");
      next.curves.push({ id, kind: "line", p1, p2, ...own });
      created.push(id);
      return id;
    },
    arc(center: string, start: string, end: string, radius: number, startAngle: number, endAngle: number): string {
      const id = nextId(next, "a");
      next.curves.push({ id, kind: "arc", center, start, end, radius: round(radius), startAngle, endAngle, ...flag });
      created.push(id);
      return id;
    },
    constraint(c: Omit<SketchConstraint, "id">): void {
      next.constraints.push({ ...c, id: nextId(next, "c") } as SketchConstraint);
    },
  };
}

/** Regular polygon of `sides` around `center`, a vertex at `vertex`. */
export function addPolygon(g: SketchGeometry, center: Vec2, vertex: Vec2, sides: number, construction = false, centerId?: string): { geometry: SketchGeometry; created: string[] } {
  const n = Math.max(3, Math.min(64, Math.round(sides)));
  const b = builder(g, construction);
  const c = b.point(center, centerId);
  const r = Math.hypot(vertex[0] - center[0], vertex[1] - center[1]);
  const a0 = Math.atan2(vertex[1] - center[1], vertex[0] - center[0]);
  const corners = Array.from({ length: n }, (_, i) => b.point([center[0] + r * Math.cos(a0 + (2 * Math.PI * i) / n), center[1] + r * Math.sin(a0 + (2 * Math.PI * i) / n)]));
  const circle = nextId(b.next, "k");
  b.next.curves.push({ id: circle, kind: "circle", center: c, radius: round(r), construction: true });
  const sidesIds = corners.map((p, i) => b.line(p, corners[(i + 1) % n]!));
  for (const p of corners) b.constraint({ kind: "pointOnCurve", point: p, curve: circle } as never);
  for (const side of sidesIds.slice(1)) b.constraint({ kind: "equal", a: sidesIds[0]!, b: side } as never);
  return { geometry: b.next, created: b.created };
}

/** Slot from centre `c1` to centre `c2`, `width` across (two half circles and two straight sides). */
export function addSlot(g: SketchGeometry, c1: Vec2, c2: Vec2, width: number, construction = false, ids: [string?, string?] = []): { geometry: SketchGeometry; created: string[] } | string {
  const length = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
  if (length < 1e-6) return "Les deux centres de l'oblong sont confondus.";
  if (!(width > 1e-6)) return "La largeur de l'oblong doit être positive.";
  const b = builder(g, construction);
  const r = width / 2;
  const dir: Vec2 = [(c2[0] - c1[0]) / length, (c2[1] - c1[1]) / length];
  const left: Vec2 = [-dir[1], dir[0]];
  const at = (c: Vec2, k: number): Vec2 => [c[0] + left[0] * r * k, c[1] + left[1] * r * k];
  const a = b.point(c1, ids[0]);
  const z = b.point(c2, ids[1]);
  // Corners: on the left of the axis (top) and on the right (bottom), at each centre.
  const [t1, b1, t2, b2] = [b.point(at(c1, 1)), b.point(at(c1, -1)), b.point(at(c2, 1)), b.point(at(c2, -1))];
  const axis = Math.atan2(dir[1], dir[0]);
  // Counter-clockwise: around c1 from its top corner to its bottom one, around c2 from bottom to top.
  const arc1 = b.arc(a, t1, b1, r, axis + Math.PI / 2, axis + (3 * Math.PI) / 2);
  const arc2 = b.arc(z, b2, t2, r, axis - Math.PI / 2, axis + Math.PI / 2);
  const top = b.line(t1, t2);
  b.line(b1, b2);
  // The half circles meet the sides at right angles to the radius: the radii are construction lines across.
  b.line(t1, b1, { construction: true });
  b.line(t2, b2, { construction: true });
  const across = b.next.curves.filter((c) => c.kind === "line" && c.construction).slice(-2).map((c) => c.id);
  b.constraint({ kind: "perpendicular", a: across[0]!, b: top } as never);
  b.constraint({ kind: "perpendicular", a: across[1]!, b: top } as never);
  // Each centre on its diameter (the arc already keeps it as far from both ends: it is the middle).
  b.constraint({ kind: "pointOnCurve", point: a, curve: across[0]! } as never);
  b.constraint({ kind: "pointOnCurve", point: z, curve: across[1]! } as never);
  b.constraint({ kind: "equal", a: arc1, b: arc2 } as never);
  return { geometry: b.next, created: b.created };
}
