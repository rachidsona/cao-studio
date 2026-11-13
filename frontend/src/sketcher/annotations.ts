/**
 * Dimension annotations of the sketcher, resolved to plain 2D shapes:
 *  - driving / reference dimensions of the sketch,
 *  - measurements of entities without a dimension (last drawn shape, selection),
 *    clickable to turn them into dimensions,
 *  - live measurements of the shape being drawn.
 * Pure geometry: the overlay turns the shapes into lines, arrows and labels.
 */
import { AXIS_X, AXIS_Y, ORIGIN, isDimension, type DimensionConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { findCurve, measure, pointPos, type Vec2 } from "./edit";
import { connectedChain } from "./offset";
import type { Preview } from "./tools";

export type AnnotationShape =
  /** Dimension line parallel to p1→p2 (or along `normal` offsets for X/Y distances). */
  /** `offset`: distance (mm) of the dimension line beyond the geometry, when it was placed by hand. */
  | { kind: "linear"; p1: Vec2; p2: Vec2; normal: Vec2; offset?: number }
  | { kind: "radial"; center: Vec2; radius: number; angle: number; diameter: boolean }
  | { kind: "label"; at: Vec2 };

export type AnnotationRole = "driving" | "reference" | "measure" | "preview";

/** A dimension a measurement turns into when it is clicked and confirmed. */
export type DimensionSpec = DimensionConstraint extends infer D ? (D extends unknown ? Omit<D, "id" | "value"> : never) : never;

export interface Annotation {
  key: string;
  role: AnnotationRole;
  shape: AnnotationShape;
  text: string;
  value: number;
  angle: boolean;
  /** Existing dimension (driving or reference). */
  dimensionId?: string;
  /** For measurements: the dimension to create. */
  spec?: DimensionSpec;
  /** A live measurement one can type (sketcher/typed-dims.ts): its field takes the keys, keeps a value, or follows the pointer. */
  field?: { id: string; state: "active" | "locked" | "idle"; name: string };
}

const unitText = (unit: DisplayUnit) => UNIT_LABELS[unit];

/** Dimension text as on a drawing: value in the project unit (implicit), Ø/R prefix, degrees for angles. */
export function formatValue(value: number, angle: boolean, unit: DisplayUnit, prefix = ""): string {
  if (angle) return `${trim(value, 2)}°`;
  return `${prefix}${trim(toDisplay(value, unit), 3)}`;
}

/** Unit label of the project, shown in tooltips. */
export function unitSuffix(unit: DisplayUnit): string {
  return unitText(unit);
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (v: Vec2) => Math.hypot(v[0], v[1]);

/** Unit perpendicular to p1→p2 pointing away from `away` (the shape's centre). */
export function outwardNormal(p1: Vec2, p2: Vec2, away: Vec2): Vec2 {
  const d = sub(p2, p1);
  const l = len(d) || 1;
  let n: Vec2 = [-d[1] / l, d[0] / l];
  const mid: Vec2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  if ((mid[0] - away[0]) * n[0] + (mid[1] - away[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return n;
}

/** Centre of the sketch points (dimension lines are placed outside, away from it). */
export function sketchCentre(g: SketchGeometry): Vec2 {
  if (g.points.length === 0) return [0, 0];
  const sx = g.points.reduce((s, p) => s + p.x, 0);
  const sy = g.points.reduce((s, p) => s + p.y, 0);
  return [sx / g.points.length, sy / g.points.length];
}

function lineEnds(g: SketchGeometry, id: string): [Vec2, Vec2] {
  if (id === AXIS_X) return [[0, 0], [1, 0]];
  if (id === AXIS_Y) return [[0, 0], [0, 1]];
  const c = findCurve(g, id);
  if (c?.kind !== "line") throw new Error(`« ${id} » n'est pas une ligne.`);
  return [pointPos(g, c.p1), pointPos(g, c.p2)];
}

function shapeOf(g: SketchGeometry, d: DimensionSpec, centre: Vec2): AnnotationShape {
  switch (d.kind) {
    case "length": {
      const [p1, p2] = lineEnds(g, d.line);
      return { kind: "linear", p1, p2, normal: outwardNormal(p1, p2, centre) };
    }
    case "distance": {
      const p1 = pointPos(g, d.a);
      const p2 = pointPos(g, d.b);
      return { kind: "linear", p1, p2, normal: outwardNormal(p1, p2, centre) };
    }
    case "distanceX":
    case "distanceY": {
      const p1 = pointPos(g, d.a);
      const p2 = pointPos(g, d.b);
      const horizontal = d.kind === "distanceX";
      const mid = horizontal ? (p1[1] + p2[1]) / 2 : (p1[0] + p2[0]) / 2;
      const side = mid >= (horizontal ? centre[1] : centre[0]) ? 1 : -1;
      return { kind: "linear", p1, p2, normal: horizontal ? [0, side] : [side, 0] };
    }
    case "pointLineDistance": {
      const p = pointPos(g, d.point);
      const [a, b] = lineEnds(g, d.line);
      const dir = sub(b, a);
      const t = ((p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1]) / (dir[0] ** 2 + dir[1] ** 2 || 1);
      const foot: Vec2 = [a[0] + t * dir[0], a[1] + t * dir[1]];
      return { kind: "linear", p1: p, p2: foot, normal: outwardNormal(p, foot, centre) };
    }
    case "radius":
    case "diameter": {
      const c = findCurve(g, d.curve);
      if (!c || c.kind === "line") throw new Error("cercle attendu");
      const angle = c.kind === "arc" ? (c.startAngle + (c.endAngle <= c.startAngle ? c.endAngle + 2 * Math.PI : c.endAngle)) / 2 : Math.PI / 4;
      return { kind: "radial", center: pointPos(g, c.center), radius: c.radius, angle, diameter: d.kind === "diameter" };
    }
    case "angle": {
      const [a1, a2] = lineEnds(g, d.a);
      const [b1, b2] = lineEnds(g, d.b);
      return { kind: "label", at: [(a1[0] + a2[0] + b1[0] + b2[0]) / 4, (a1[1] + a2[1] + b1[1] + b2[1]) / 4] };
    }
  }
}

function prefixOf(kind: DimensionSpec["kind"]): string {
  return kind === "diameter" ? "Ø" : kind === "radius" ? "R" : "";
}

/** Applies a hand-placed position (DimensionConstraint.offset) to the drawn shape. */
function placed(shape: AnnotationShape, offset: number | undefined): AnnotationShape {
  if (offset === undefined) return shape;
  if (shape.kind === "linear") return { ...shape, offset };
  if (shape.kind === "radial") return { ...shape, angle: (offset * Math.PI) / 180 };
  return shape;
}

/** Annotations of the sketch's own dimensions. */
export function dimensionAnnotations(g: SketchGeometry, unit: DisplayUnit): Annotation[] {
  const centre = sketchCentre(g);
  const out: Annotation[] = [];
  for (const c of g.constraints) {
    if (!isDimension(c)) continue;
    try {
      const angle = c.kind === "angle";
      out.push({
        key: c.id,
        role: c.driving === false ? "reference" : "driving",
        shape: placed(shapeOf(g, c, centre), c.offset),
        value: c.value,
        angle,
        text: formatValue(c.driving === false ? measure(g, c) : c.value, angle, unit, prefixOf(c.kind)),
        dimensionId: c.id,
      });
    } catch {
      // A dimension on a missing entity is reported by validation, not drawn.
    }
  }
  return out;
}

/** The dimension that would describe an entity: length of a line, Ø of a circle, R of an arc. */
export function specFor(g: SketchGeometry, entityId: string): DimensionSpec | null {
  const c = findCurve(g, entityId);
  if (!c) return null;
  if (c.kind === "line") return { kind: "length", line: c.id } as DimensionSpec;
  if (c.kind === "circle") return { kind: "diameter", curve: c.id } as DimensionSpec;
  return { kind: "radius", curve: c.id } as DimensionSpec;
}

/** Existing dimension already describing `spec` (same kind on the same entity). */
export function existingDimension(g: SketchGeometry, spec: DimensionSpec): DimensionConstraint | undefined {
  return g.constraints.filter(isDimension).find((d) => {
    if (d.kind !== spec.kind) return false;
    if ("line" in d && "line" in spec) return d.line === spec.line;
    if ("curve" in d && "curve" in spec) return d.curve === spec.curve;
    return false;
  });
}

/** Measurements of entities that have no dimension yet (clickable to create one). */
export function measureAnnotations(g: SketchGeometry, entityIds: string[], unit: DisplayUnit): Annotation[] {
  const centre = sketchCentre(g);
  const out: Annotation[] = [];
  for (const id of entityIds) {
    const spec = specFor(g, id);
    if (!spec || existingDimension(g, spec)) continue;
    const value = measure(g, { ...spec, id: "", value: 0 } as DimensionConstraint);
    out.push({
      key: `measure:${id}`,
      role: "measure",
      shape: shapeOf(g, spec, centre),
      value,
      angle: false,
      text: formatValue(value, false, unit, prefixOf(spec.kind)),
      spec,
    });
  }
  return out;
}

type EntityKind = "point" | "line" | "round";

function entityKind(g: SketchGeometry, id: string): EntityKind | null {
  if (id === ORIGIN || g.points.some((p) => p.id === id)) return "point";
  if (id === AXIS_X || id === AXIS_Y) return "line";
  const c = findCurve(g, id);
  if (!c) return null;
  return c.kind === "line" ? "line" : "round";
}

function centreOf(g: SketchGeometry, id: string): string {
  const c = findCurve(g, id);
  if (!c || c.kind === "line") throw new Error("cercle attendu");
  return c.center;
}

/**
 * Dimension describing the relation between two selected entities:
 * distance between two points (or centres), point–line distance, distance
 * between two parallel lines, or the angle between two lines.
 */
export function pairSpec(g: SketchGeometry, ids: string[]): DimensionSpec | null {
  if (ids.length !== 2) return null;
  const [a, b] = ids as [string, string];
  const ka = entityKind(g, a);
  const kb = entityKind(g, b);
  if (!ka || !kb) return null;
  const asPoint = (id: string, k: EntityKind) => (k === "round" ? centreOf(g, id) : id);
  if (ka !== "line" && kb !== "line") {
    const pa = asPoint(a, ka);
    const pb = asPoint(b, kb);
    return pa === pb ? null : ({ kind: "distance", a: pa, b: pb } as DimensionSpec);
  }
  if (ka === "line" && kb === "line") {
    const [a1, a2] = lineEnds(g, a);
    const [b1, b2] = lineEnds(g, b);
    const da = sub(a2, a1);
    const db = sub(b2, b1);
    const cross = (da[0] * db[1] - da[1] * db[0]) / ((len(da) || 1) * (len(db) || 1));
    if (Math.abs(cross) > 1e-6) return { kind: "angle", a, b } as DimensionSpec;
    // Parallel lines: distance from an end point of the first line to the second one.
    const line = findCurve(g, a);
    const point = line?.kind === "line" ? line.p1 : ORIGIN;
    return { kind: "pointLineDistance", point, line: b, label: "Distance entre lignes" } as DimensionSpec;
  }
  const [lineId, otherId, otherKind] = ka === "line" ? [a, b, kb] : [b, a, ka];
  return { kind: "pointLineDistance", point: asPoint(otherId, otherKind), line: lineId } as DimensionSpec;
}

function sameRelation(d: DimensionConstraint, spec: DimensionSpec): boolean {
  if (d.kind !== spec.kind) return false;
  if (d.kind === "distance" && spec.kind === "distance") return (d.a === spec.a && d.b === spec.b) || (d.a === spec.b && d.b === spec.a);
  if (d.kind === "angle" && spec.kind === "angle") return (d.a === spec.a && d.b === spec.b) || (d.a === spec.b && d.b === spec.a);
  if (d.kind === "pointLineDistance" && spec.kind === "pointLineDistance") return d.point === spec.point && d.line === spec.line;
  return false;
}

/** Dimension of the sketch already expressing `spec` (size of an element or relation between two). */
export function matchingDimension(g: SketchGeometry, spec: DimensionSpec): DimensionConstraint | undefined {
  return existingDimension(g, spec) ?? g.constraints.filter(isDimension).find((c) => sameRelation(c, spec));
}

/** Dimension describing the selection: size of one element, or relation between two. */
export function selectionSpec(g: SketchGeometry, ids: string[]): DimensionSpec | null {
  if (ids.length === 1) return specFor(g, ids[0] as string);
  return pairSpec(g, ids);
}

/** Measurement between the two selected entities, unless a dimension already says it. */
export function pairAnnotation(g: SketchGeometry, ids: string[], unit: DisplayUnit): Annotation | null {
  const spec = pairSpec(g, ids);
  if (!spec || g.constraints.some((c) => isDimension(c) && sameRelation(c, spec))) return null;
  const angle = spec.kind === "angle";
  const value = measure(g, { ...spec, id: "", value: 0 } as DimensionConstraint);
  if (!angle && value < 1e-9) return null;
  return {
    key: `measure:${ids.join("+")}`,
    role: "measure",
    shape: shapeOf(g, spec, sketchCentre(g)),
    value,
    angle,
    text: formatValue(value, angle, unit),
    spec,
  };
}

/**
 * Placement of a dimension dragged to sketch point `p`: distance of a linear
 * dimension line beyond the geometry (mm), or leader angle of a radius /
 * diameter (degrees). Null for shapes that cannot be moved.
 */
export function placementOffset(a: Annotation, p: Vec2): number | null {
  const shape = a.shape;
  if (shape.kind === "linear") {
    const n = shape.normal;
    const level = Math.max(shape.p1[0] * n[0] + shape.p1[1] * n[1], shape.p2[0] * n[0] + shape.p2[1] * n[1]);
    return Number((p[0] * n[0] + p[1] * n[1] - level).toFixed(4));
  }
  if (shape.kind === "radial") {
    return Number(((Math.atan2(p[1] - shape.center[1], p[0] - shape.center[0]) * 180) / Math.PI).toFixed(2));
  }
  return null;
}

/** Lines, arrowheads and text position of a drawn dimension (sketch coordinates). */
export interface DimensionLayout {
  lines: [Vec2, Vec2][];
  arrows: { tip: Vec2; dir: Vec2 }[];
  text: { at: Vec2; angle: number };
}

/**
 * Layout of a dimension, `px` being the size of a screen pixel in mm: used
 * both to draw it and to pick its lines (so a click on the drawn line hits).
 */
export function dimensionLayout(shape: AnnotationShape, px: number): DimensionLayout {
  if (shape.kind === "label") return { lines: [], arrows: [], text: { at: shape.at, angle: 0 } };
  if (shape.kind === "radial") {
    const dir: Vec2 = [Math.cos(shape.angle), Math.sin(shape.angle)];
    const rim: Vec2 = [shape.center[0] + dir[0] * shape.radius, shape.center[1] + dir[1] * shape.radius];
    const start: Vec2 = shape.diameter ? [shape.center[0] - dir[0] * shape.radius, shape.center[1] - dir[1] * shape.radius] : shape.center;
    const outside: Vec2 = [rim[0] + dir[0] * 24 * px, rim[1] + dir[1] * 24 * px];
    const arrows = [{ tip: rim, dir }];
    if (shape.diameter) arrows.push({ tip: start, dir: [-dir[0], -dir[1]] });
    return { lines: [[start, outside]], arrows, text: { at: [outside[0] + dir[0] * 14 * px, outside[1] + dir[1] * 14 * px], angle: 0 } };
  }
  // Linear: extension lines from both points to a common dimension line, offset along the normal.
  const { p1, p2, normal } = shape;
  const offset = shape.offset ?? 30 * px;
  const level = Math.max(p1[0] * normal[0] + p1[1] * normal[1], p2[0] * normal[0] + p2[1] * normal[1]) + offset;
  const lift = (p: Vec2): Vec2 => {
    const k = level - (p[0] * normal[0] + p[1] * normal[1]);
    return [p[0] + normal[0] * k, p[1] + normal[1] * k];
  };
  const d1 = lift(p1);
  const d2 = lift(p2);
  const side = Math.sign(offset) || 1;
  const over = 6 * px * side;
  const gap = 3 * px * side;
  const lines: [Vec2, Vec2][] = [
    [[p1[0] + normal[0] * gap, p1[1] + normal[1] * gap], [d1[0] + normal[0] * over, d1[1] + normal[1] * over]],
    [[p2[0] + normal[0] * gap, p2[1] + normal[1] * gap], [d2[0] + normal[0] * over, d2[1] + normal[1] * over]],
    [d1, d2],
  ];
  const span = len(sub(d2, d1));
  const arrows: DimensionLayout["arrows"] = [];
  let angle = 0;
  if (span > 1e-9) {
    const dir: Vec2 = [(d2[0] - d1[0]) / span, (d2[1] - d1[1]) / span];
    arrows.push({ tip: d2, dir }, { tip: d1, dir: [-dir[0], -dir[1]] });
    angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
    // Keep the text readable (never upside down).
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
  }
  const mid: Vec2 = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
  return { lines, arrows, text: { at: [mid[0] + normal[0] * 9 * px * side, mid[1] + normal[1] * 9 * px * side], angle } };
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
  return len([p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]]);
}

/** Distance from `p` to the drawn lines of a dimension (Infinity when it has none). */
export function dimensionLineDistance(a: Annotation, p: Vec2, px: number): number {
  return Math.min(Infinity, ...dimensionLayout(a.shape, px).lines.map(([x, y]) => segmentDistance(p, x, y)));
}

/** Live measurements of the shape being drawn. */
export function previewAnnotations(preview: Preview | null, unit: DisplayUnit): Annotation[] {
  if (!preview) return [];
  const out: Annotation[] = [];
  const linear = (key: string, p1: Vec2, p2: Vec2, centre: Vec2) => {
    const value = len(sub(p2, p1));
    if (value < 1e-9) return;
    out.push({ key, role: "preview", shape: { kind: "linear", p1, p2, normal: outwardNormal(p1, p2, centre) }, value, angle: false, text: formatValue(value, false, unit) });
  };
  if (preview.lines.length === 4) {
    // Rectangle: width and height only.
    const pts = preview.lines.map(([a]) => a);
    const centre: Vec2 = [pts.reduce((s, p) => s + p[0], 0) / 4, pts.reduce((s, p) => s + p[1], 0) / 4];
    const [l1, l2] = preview.lines as [[Vec2, Vec2], [Vec2, Vec2]];
    linear("preview:w", l1[0], l1[1], centre);
    linear("preview:h", l2[0], l2[1], centre);
  } else if (preview.lines.length === 1) {
    const [a, b] = preview.lines[0] as [Vec2, Vec2];
    // Place the dimension on the side away from the start point's perpendicular "inside".
    linear("preview:l", a, b, [a[0] - (b[1] - a[1]), a[1] + (b[0] - a[0])]);
  }
  for (const c of preview.circles) {
    out.push({
      key: "preview:c",
      role: "preview",
      shape: { kind: "radial", center: c.center, radius: c.radius, angle: Math.PI / 4, diameter: true },
      value: 2 * c.radius,
      angle: false,
      text: formatValue(2 * c.radius, false, unit, "Ø"),
    });
  }
  for (const a of preview.arcs) {
    out.push({
      key: "preview:a",
      role: "preview",
      shape: { kind: "radial", center: a.center, radius: a.radius, angle: (a.start + a.end) / 2, diameter: false },
      value: a.radius,
      angle: false,
      text: formatValue(a.radius, false, unit, "R"),
    });
  }
  return out;
}

/** The line a length-like dimension measures: its line, or the line whose two ends it spans. */
function measuredLine(g: SketchGeometry, d: DimensionSpec): string | null {
  if (d.kind === "length") return d.line;
  if (d.kind !== "distance" && d.kind !== "distanceX" && d.kind !== "distanceY") return null;
  const ends = new Set([d.a, d.b]);
  return g.curves.find((c) => c.kind === "line" && ends.has(c.p1) && ends.has(c.p2))?.id ?? null;
}

/**
 * The dimension that comes after `current` when the keypad goes to the next one (→, Tab, ↓), as Fusion
 * goes from the width of a rectangle to its height: the next side of the same contour that is not
 * parallel to the measured one. Its existing dimension (on it or on a side parallel to it) is edited;
 * without one, a length dimension is proposed with its current length. Null when there is no such side.
 */
export function nextSideDimension(
  g: SketchGeometry,
  current: DimensionSpec,
): { dimensionId: string; value: number } | { spec: DimensionSpec; value: number } | null {
  const line = measuredLine(g, current);
  if (!line) return null;
  const vector = (id: string): Vec2 | null => {
    const c = findCurve(g, id);
    if (c?.kind !== "line") return null;
    const [a, b] = [pointPos(g, c.p1), pointPos(g, c.p2)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : null;
  };
  const parallel = (u: Vec2, v: Vec2) => Math.abs(u[0] * v[1] - u[1] * v[0]) < 0.2;
  const v0 = vector(line);
  if (!v0) return null;
  const chain = connectedChain(g, line);
  const across = chain.filter((id) => {
    const v = vector(id);
    return v !== null && !parallel(v0, v);
  });
  // The side that continues from the end of the measured one (a rectangle drawn corner to corner: width, then height).
  const measured = findCurve(g, line);
  const touches = (id: string, point: string | undefined) => {
    const c = findCurve(g, id);
    return !!point && c?.kind === "line" && (c.p1 === point || c.p2 === point);
  };
  const end = measured?.kind === "line" ? measured.p2 : undefined;
  const begin = measured?.kind === "line" ? measured.p1 : undefined;
  const next = across.find((id) => touches(id, end)) ?? across.find((id) => touches(id, begin)) ?? across[0];
  if (!next) return null;
  const vn = vector(next) as Vec2;
  const family = new Set(chain.filter((id) => {
    const v = vector(id);
    return v !== null && parallel(vn, v);
  }));
  const existing = g.constraints.find((c): c is DimensionConstraint => {
    if (!isDimension(c)) return false;
    const measured = measuredLine(g, c);
    return measured !== null && family.has(measured);
  });
  if (existing) return { dimensionId: existing.id, value: existing.value };
  const spec = { kind: "length", line: next } as DimensionSpec;
  return { spec, value: Number(measure(g, { ...spec, id: "", value: 0 } as DimensionConstraint).toFixed(6)) };
}
