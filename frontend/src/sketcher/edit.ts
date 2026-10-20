/**
 * Pure edits of a sketch's geometry (new copies, never mutation), plus the
 * measurements used to create dimensions with the current value.
 */
import {
  AXIS_X,
  AXIS_Y,
  constraintRefs,
  curvePoints,
  ORIGIN,
  type DimensionConstraint,
  type SketchConstraint,
  type SketchCurve,
  type SketchGeometry,
} from "../document/sketch";

export type Vec2 = [number, number];

export function cloneGeometry(g: SketchGeometry): SketchGeometry {
  return structuredClone({ points: g.points, curves: g.curves, constraints: g.constraints });
}

export function nextId(g: SketchGeometry, prefix: string): string {
  const used = new Set<string>([...g.points, ...g.curves, ...g.constraints].map((e) => e.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function pointPos(g: SketchGeometry, id: string): Vec2 {
  if (id === ORIGIN) return [0, 0];
  const p = g.points.find((q) => q.id === id);
  if (!p) throw new Error(`Point « ${id} » introuvable.`);
  return [p.x, p.y];
}

export function findCurve(g: SketchGeometry, id: string): SketchCurve | undefined {
  return g.curves.find((c) => c.id === id);
}

/** A vertex given by the user: an existing point, or a new position. */
export type VertexInput = { pointId: string } | { at: Vec2 };

function vertex(g: SketchGeometry, input: VertexInput): string {
  if ("pointId" in input) return input.pointId;
  const id = nextId(g, "p");
  g.points.push({ id, x: input.at[0], y: input.at[1] });
  return id;
}

function push(g: SketchGeometry, c: Omit<SketchConstraint, "id">, prefix = "c"): string {
  const id = nextId(g, prefix);
  g.constraints.push({ ...c, id } as SketchConstraint);
  return id;
}

export interface Added {
  geometry: SketchGeometry;
  /** Ids of created points and curves (to select them). */
  created: string[];
  /** Id of the last point created or reused (to chain polylines). */
  lastPoint: string;
}

const ANGLE_SNAP = (3 * Math.PI) / 180;

/** Horizontal/vertical constraint inferred from a nearly axis-aligned segment. */
export function inferAlignment(a: Vec2, b: Vec2): "horizontal" | "vertical" | null {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const fromH = Math.abs(Math.sin(angle));
  const fromV = Math.abs(Math.cos(angle));
  if (fromH < Math.sin(ANGLE_SNAP)) return "horizontal";
  if (fromV < Math.sin(ANGLE_SNAP)) return "vertical";
  return null;
}

export function addLine(
  base: SketchGeometry,
  from: VertexInput,
  to: VertexInput,
  options: { construction?: boolean; autoAlign?: boolean } = {},
): Added {
  const g = cloneGeometry(base);
  const p1 = vertex(g, from);
  const p2 = vertex(g, to);
  if (p1 === p2) throw new Error("Une ligne doit relier deux points distincts.");
  const id = nextId(g, "l");
  g.curves.push({ id, kind: "line", p1, p2, ...(options.construction ? { construction: true } : {}) });
  if (options.autoAlign !== false) {
    const align = inferAlignment(pointPos(g, p1), pointPos(g, p2));
    if (align) push(g, { kind: align, line: id } as Omit<SketchConstraint, "id">);
  }
  return { geometry: g, created: [id], lastPoint: p2 };
}

export function addRectangle(base: SketchGeometry, corner: VertexInput, opposite: VertexInput, construction = false): Added {
  const g = cloneGeometry(base);
  const a = vertex(g, corner);
  const [x0, y0] = pointPos(g, a);
  const [x1, y1] = "at" in opposite ? opposite.at : pointPos(g, opposite.pointId);
  if (Math.abs(x1 - x0) < 1e-9 || Math.abs(y1 - y0) < 1e-9) throw new Error("Le rectangle doit avoir une largeur et une hauteur.");
  const b = vertex(g, { at: [x1, y0] });
  const c = vertex(g, opposite);
  const d = vertex(g, { at: [x0, y1] });
  const created: string[] = [];
  const corners = [a, b, c, d];
  corners.forEach((p, i) => {
    const id = nextId(g, "l");
    g.curves.push({ id, kind: "line", p1: p, p2: corners[(i + 1) % 4] as string, ...(construction ? { construction: true } : {}) });
    created.push(id);
    push(g, { kind: i % 2 === 0 ? "horizontal" : "vertical", line: id } as Omit<SketchConstraint, "id">);
  });
  return { geometry: g, created, lastPoint: c };
}

export function addCircle(base: SketchGeometry, center: VertexInput, radius: number, construction = false): Added {
  if (!(radius > 1e-9)) throw new Error("Le rayon doit être positif.");
  const g = cloneGeometry(base);
  const c = vertex(g, center);
  const id = nextId(g, "k");
  g.curves.push({ id, kind: "circle", center: c, radius, ...(construction ? { construction: true } : {}) });
  return { geometry: g, created: [id], lastPoint: c };
}

/** Arc around `center`, counter-clockwise from `start`; the end is projected onto the circle. */
export function addArc(base: SketchGeometry, center: VertexInput, start: VertexInput, endDirection: Vec2, construction = false): Added {
  const g = cloneGeometry(base);
  const c = vertex(g, center);
  const s = vertex(g, start);
  const [cx, cy] = pointPos(g, c);
  const [sx, sy] = pointPos(g, s);
  const radius = Math.hypot(sx - cx, sy - cy);
  if (!(radius > 1e-9)) throw new Error("Le rayon de l'arc doit être positif.");
  const startAngle = Math.atan2(sy - cy, sx - cx);
  let endAngle = Math.atan2(endDirection[1] - cy, endDirection[0] - cx);
  if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  const e = vertex(g, { at: [cx + radius * Math.cos(endAngle), cy + radius * Math.sin(endAngle)] });
  const id = nextId(g, "a");
  g.curves.push({ id, kind: "arc", center: c, start: s, end: e, radius, startAngle, endAngle, ...(construction ? { construction: true } : {}) });
  return { geometry: g, created: [id], lastPoint: e };
}

export function addConstraint(base: SketchGeometry, constraint: Omit<SketchConstraint, "id">): { geometry: SketchGeometry; id: string } {
  const g = cloneGeometry(base);
  const id = push(g, constraint, "value" in constraint ? "d" : "c");
  return { geometry: g, id };
}

export function setDimensionValue(base: SketchGeometry, id: string, value: number): SketchGeometry {
  const g = cloneGeometry(base);
  g.constraints = g.constraints.map((c) => (c.id === id && "value" in c ? { ...c, value } : c));
  return g;
}

export function toggleConstruction(base: SketchGeometry, ids: string[]): SketchGeometry {
  const g = cloneGeometry(base);
  const targets = new Set(ids);
  g.curves = g.curves.map((c) => (targets.has(c.id) ? { ...c, construction: !c.construction } : c));
  return g;
}

/**
 * Removes entities: curves and constraints directly, points together with the
 * curves built on them; then every constraint referring to something removed
 * and every point no longer used by a curve or constraint.
 */
export function removeEntities(base: SketchGeometry, ids: string[]): SketchGeometry {
  const g = cloneGeometry(base);
  const removed = new Set(ids);
  g.curves = g.curves.filter((c) => !removed.has(c.id) && !curvePoints(c).some((p) => removed.has(p)));
  const keptCurves = new Set(g.curves.map((c) => c.id));
  for (const c of base.curves) if (!keptCurves.has(c.id)) removed.add(c.id);
  g.constraints = g.constraints.filter((c) => !removed.has(c.id) && !constraintRefs(c).some((r) => removed.has(r)));
  const used = new Set<string>([...g.curves.flatMap(curvePoints), ...g.constraints.flatMap(constraintRefs)]);
  g.points = g.points.filter((p) => !removed.has(p.id) && used.has(p.id));
  return g;
}

// ---- measurements ---------------------------------------------------------

function lineDir(g: SketchGeometry, id: string): Vec2 {
  if (id === AXIS_X) return [1, 0];
  if (id === AXIS_Y) return [0, 1];
  const c = findCurve(g, id);
  if (c?.kind !== "line") throw new Error(`« ${id} » n'est pas une ligne.`);
  const [ax, ay] = pointPos(g, c.p1);
  const [bx, by] = pointPos(g, c.p2);
  return [bx - ax, by - ay];
}

function linePoint(g: SketchGeometry, id: string): Vec2 {
  if (id === AXIS_X || id === AXIS_Y) return [0, 0];
  const c = findCurve(g, id);
  if (c?.kind !== "line") throw new Error(`« ${id} » n'est pas une ligne.`);
  return pointPos(g, c.p1);
}

/** Current value of a dimension in the sketch (mm or degrees). */
export function measure(g: SketchGeometry, d: DimensionConstraint): number {
  switch (d.kind) {
    case "distance": {
      const [ax, ay] = pointPos(g, d.a);
      const [bx, by] = pointPos(g, d.b);
      return Math.hypot(bx - ax, by - ay);
    }
    case "distanceX":
      return pointPos(g, d.b)[0] - pointPos(g, d.a)[0];
    case "distanceY":
      return pointPos(g, d.b)[1] - pointPos(g, d.a)[1];
    case "length": {
      const [dx, dy] = lineDir(g, d.line);
      return Math.hypot(dx, dy);
    }
    case "pointLineDistance": {
      const [px, py] = pointPos(g, d.point);
      const [ox, oy] = linePoint(g, d.line);
      const [dx, dy] = lineDir(g, d.line);
      return Math.abs((px - ox) * dy - (py - oy) * dx) / Math.hypot(dx, dy);
    }
    case "angle": {
      // Signed angle from the first line to the second, as planegcs measures it.
      const [ax, ay] = lineDir(g, d.a);
      const [bx, by] = lineDir(g, d.b);
      return (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI;
    }
    case "radius":
    case "diameter": {
      const c = findCurve(g, d.curve);
      if (!c || c.kind === "line") throw new Error(`« ${d.curve} » n'est pas un cercle ou un arc.`);
      return d.kind === "radius" ? c.radius : 2 * c.radius;
    }
  }
}
