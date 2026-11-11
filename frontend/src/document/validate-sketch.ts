/**
 * Structural validation of a v2 sketch (points, curves, constraints) from an
 * untrusted source. Mirrors the server-side rules in apps/projects.
 */
import { AXIS_X, AXIS_Y, DIMENSION_KINDS, ORIGIN, RESERVED_IDS } from "./sketch";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

type RefCategory = "point" | "line" | "curve" | "any";

/** Reference fields of each constraint kind and the category they must point to. */
const CONSTRAINT_FIELDS: Record<string, Record<string, RefCategory>> = {
  coincident: { a: "point", b: "point" },
  horizontal: { line: "line" },
  vertical: { line: "line" },
  parallel: { a: "line", b: "line" },
  perpendicular: { a: "line", b: "line" },
  tangent: { a: "curve", b: "curve" },
  equal: { a: "curve", b: "curve" },
  symmetric: { a: "point", b: "point", axis: "any" },
  concentric: { a: "curve", b: "curve" },
  fix: { point: "point" },
  pointOnCurve: { point: "point", curve: "curve" },
  midpoint: { point: "point", line: "line" },
  distance: { a: "point", b: "point" },
  distanceX: { a: "point", b: "point" },
  distanceY: { a: "point", b: "point" },
  pointLineDistance: { point: "point", line: "line" },
  length: { line: "line" },
  angle: { a: "line", b: "line" },
  radius: { curve: "curve" },
  diameter: { curve: "curve" },
};

const POSITIVE_DIMENSIONS = new Set(["distance", "length", "radius", "diameter", "pointLineDistance"]);
export const MAX_SKETCH_POINTS = 5000;
export const MAX_SKETCH_CURVES = 5000;
/** The solver runs out of memory near a thousand constraints (measured, audit of 11/11/2026): a margin under it. */
export const MAX_SKETCH_CONSTRAINTS = 600;

export function validateSketch(feature: Json, where: string, errors: string[]): void {
  const { points, curves, constraints } = feature;
  if (!Array.isArray(points) || !Array.isArray(curves) || !Array.isArray(constraints)) {
    errors.push(`${where} : « points », « curves » et « constraints » doivent être des listes.`);
    return;
  }
  if (points.length > MAX_SKETCH_POINTS || curves.length > MAX_SKETCH_CURVES || constraints.length > MAX_SKETCH_CONSTRAINTS) {
    errors.push(`${where} : esquisse trop volumineuse.`);
    return;
  }
  if (feature.offsets !== undefined) {
    const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    const valid =
      Array.isArray(feature.offsets) &&
      feature.offsets.length <= MAX_SKETCH_CURVES &&
      feature.offsets.every(
        (o) =>
          isObject(o) && typeof o.id === "string" && typeof o.name === "string" && strings(o.curves) && strings(o.source) &&
          isFiniteNumber(o.distance) && typeof o.both === "boolean" && (o.join === "round" || o.join === "sharp"),
      );
    if (!valid) errors.push(`${where} : décalages invalides.`);
  }
  const categories = new Map<string, RefCategory>([
    [ORIGIN, "point"],
    [AXIS_X, "line"],
    [AXIS_Y, "line"],
  ]);
  const declare = (id: unknown, category: RefCategory): boolean => {
    if (typeof id !== "string" || id === "") {
      errors.push(`${where} : identifiant manquant.`);
      return false;
    }
    if (RESERVED_IDS.has(id)) errors.push(`${where} : l'identifiant « ${id} » est réservé.`);
    else if (categories.has(id)) errors.push(`${where} : identifiant « ${id} » dupliqué.`);
    categories.set(id, category);
    return true;
  };
  const requireRef = (value: unknown, category: RefCategory, owner: string): void => {
    const found = typeof value === "string" ? categories.get(value) : undefined;
    const ok =
      found !== undefined &&
      (category === "any" || found === category || (category === "curve" && (found === "line" || found === "curve")));
    if (!ok) errors.push(`${where} : ${owner} référence « ${String(value)} » introuvable ou de mauvais type.`);
  };

  for (const point of points) {
    if (!isObject(point) || !declare(point.id, "point")) continue;
    if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) errors.push(`${where} : point « ${String(point.id)} » invalide.`);
    if (point.fixed !== undefined && typeof point.fixed !== "boolean") errors.push(`${where} : point « ${String(point.id)} » invalide.`);
  }
  for (const curve of curves) {
    if (!isObject(curve)) continue;
    const kind = curve.kind;
    if (kind !== "line" && kind !== "circle" && kind !== "arc") {
      errors.push(`${where} : type de courbe inconnu « ${String(kind)} ».`);
      continue;
    }
    if (!declare(curve.id, kind === "line" ? "line" : "curve")) continue;
    const owner = `la courbe « ${String(curve.id)} »`;
    if (curve.construction !== undefined && typeof curve.construction !== "boolean") errors.push(`${where} : ${owner} est invalide.`);
    if (curve.projected !== undefined && typeof curve.projected !== "boolean") errors.push(`${where} : ${owner} est invalide.`);
    if (kind === "line") {
      requireRef(curve.p1, "point", owner);
      requireRef(curve.p2, "point", owner);
    } else {
      if (!isFiniteNumber(curve.radius) || curve.radius <= 0) errors.push(`${where} : rayon de ${owner} invalide.`);
      requireRef(curve.center, "point", owner);
      if (kind === "arc") {
        requireRef(curve.start, "point", owner);
        requireRef(curve.end, "point", owner);
        if (!isFiniteNumber(curve.startAngle) || !isFiniteNumber(curve.endAngle)) errors.push(`${where} : angles de ${owner} invalides.`);
      }
    }
  }
  for (const constraint of constraints) {
    if (!isObject(constraint)) continue;
    const fields = CONSTRAINT_FIELDS[constraint.kind as string];
    if (!fields) {
      errors.push(`${where} : type de contrainte inconnu « ${String(constraint.kind)} ».`);
      continue;
    }
    if (!declare(constraint.id, "any")) continue;
    const owner = `la contrainte « ${String(constraint.id)} »`;
    for (const [field, category] of Object.entries(fields)) requireRef(constraint[field], category, owner);
    if (constraint.kind === "fix" && (!isFiniteNumber(constraint.x) || !isFiniteNumber(constraint.y))) {
      errors.push(`${where} : position de ${owner} invalide.`);
    }
    if (DIMENSION_KINDS.has(constraint.kind as never)) {
      const value = constraint.value;
      if (!isFiniteNumber(value) || (POSITIVE_DIMENSIONS.has(constraint.kind as string) && value <= 0)) {
        errors.push(`${where} : valeur de ${owner} invalide.`);
      }
      if (constraint.driving !== undefined && typeof constraint.driving !== "boolean") errors.push(`${where} : ${owner} est invalide.`);
      if (constraint.offset !== undefined && !isFiniteNumber(constraint.offset)) errors.push(`${where} : position de ${owner} invalide.`);
      if (constraint.label !== undefined && (typeof constraint.label !== "string" || constraint.label.length > 80)) {
        errors.push(`${where} : libellé de ${owner} invalide.`);
      }
    }
  }
}
