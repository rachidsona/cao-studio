/**
 * Upgrades older native documents to the current schema. v1 sketches stored
 * closed shapes ("entities"); v2 stores points, curves and constraints, so
 * each v1 shape becomes an equivalent, fully constrained v2 sketch.
 */
import { ORIGIN, type SketchConstraint, type SketchCurve, type SketchGeometry, type SketchPoint } from "./sketch";

type Json = Record<string, unknown>;

interface V1Rectangle {
  id: string;
  kind: "rectangle";
  cx: number;
  cy: number;
  width: number;
  height: number;
}

interface V1Circle {
  id: string;
  kind: "circle";
  cx: number;
  cy: number;
  diameter: number;
}

type V1Entity = V1Rectangle | V1Circle;

/** Positions point `id` relative to the origin with signed X/Y dimensions, or on the origin. */
function anchor(id: string, x: number, y: number, prefix: string): SketchConstraint[] {
  if (x === 0 && y === 0) return [{ id: `${prefix}o`, kind: "coincident", a: id, b: ORIGIN }];
  return [
    { id: `${prefix}x`, kind: "distanceX", a: ORIGIN, b: id, value: x },
    { id: `${prefix}y`, kind: "distanceY", a: ORIGIN, b: id, value: y },
  ];
}

export function migrateEntities(entities: V1Entity[]): SketchGeometry {
  const points: SketchPoint[] = [];
  const curves: SketchCurve[] = [];
  const constraints: SketchConstraint[] = [];
  entities.forEach((entity, index) => {
    const k = `e${index + 1}`;
    if (entity.kind === "rectangle") {
      const { cx, cy, width: w, height: h } = entity;
      const corners: [number, number][] = [
        [cx - w / 2, cy - h / 2],
        [cx + w / 2, cy - h / 2],
        [cx + w / 2, cy + h / 2],
        [cx - w / 2, cy + h / 2],
      ];
      corners.forEach(([x, y], i) => points.push({ id: `${k}p${i + 1}`, x, y }));
      for (let i = 0; i < 4; i++) {
        curves.push({ id: `${k}l${i + 1}`, kind: "line", p1: `${k}p${i + 1}`, p2: `${k}p${((i + 1) % 4) + 1}` });
      }
      points.push({ id: `${k}c`, x: cx, y: cy });
      constraints.push(
        { id: `${k}h1`, kind: "horizontal", line: `${k}l1` },
        { id: `${k}h2`, kind: "horizontal", line: `${k}l3` },
        { id: `${k}v1`, kind: "vertical", line: `${k}l2` },
        { id: `${k}v2`, kind: "vertical", line: `${k}l4` },
        { id: `${k}s`, kind: "symmetric", a: `${k}p1`, b: `${k}p3`, axis: `${k}c` },
        { id: `${k}w`, kind: "length", line: `${k}l1`, value: w, label: "Longueur" },
        { id: `${k}h`, kind: "length", line: `${k}l2`, value: h, label: "Largeur" },
        ...anchor(`${k}c`, cx, cy, `${k}a`),
      );
    } else {
      points.push({ id: `${k}c`, x: entity.cx, y: entity.cy });
      curves.push({ id: `${k}k`, kind: "circle", center: `${k}c`, radius: entity.diameter / 2 });
      constraints.push(
        { id: `${k}d`, kind: "diameter", curve: `${k}k`, value: entity.diameter, label: "Diamètre" },
        ...anchor(`${k}c`, entity.cx, entity.cy, `${k}a`),
      );
    }
  });
  return { points, curves, constraints };
}

/** Returns a copy of `input` upgraded to the current schema (unknown shapes are left to validation). */
export function migrateDocument(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const doc = input as Json;
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.features)) return input;
  const features = doc.features.map((feature: unknown) => {
    const f = feature as Json;
    if (f?.type !== "sketch" || !Array.isArray(f.entities)) return feature;
    const { entities, ...rest } = f;
    return { ...rest, ...migrateEntities(entities as V1Entity[]) };
  });
  return { ...doc, schemaVersion: 2, features };
}
