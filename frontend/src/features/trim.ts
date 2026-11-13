/**
 * Finitions dans le noyau : chaque planche (joue, fileur, plinthe, bandeau) est une boîte, chaque pied un cylindre ;
 * un fileur ou un bandeau recoupé d'après le relevé de chantier est son contour, dans le plan de la façade, poussé
 * de l'épaisseur de la planche.
 */
import { draw, makeBox, makeCylinder, Plane, type Shape3D } from "replicad";
import type { TrimFeature } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";

type Part = TrimFeature["parts"][number];

/** The outline, in the plane across `axis` and up, pushed over the depth of the box around it. */
function scribed(p: Part & { outline: NonNullable<Part["outline"]> }, lo: number[], hi: number[], name: string): Shape3D {
  const { axis, points } = p.outline;
  if (points.length < 3) throw new GeometryError(`${name} : le contour de « ${p.name} » n'a pas trois points.`);
  const depth = 1 - axis;
  // The plane's own Y is up: its normal is across × up (−Y across X, +X across Y), and the board is pushed along it.
  const origin: [number, number, number] = [0, 0, 0];
  origin[depth] = axis === 0 ? hi[depth]! : lo[depth]!;
  const across: [number, number, number] = axis === 0 ? [1, 0, 0] : [0, 1, 0];
  const normal: [number, number, number] = axis === 0 ? [0, -1, 0] : [1, 0, 0];
  let d = draw(points[0]!);
  for (const q of points.slice(1)) d = d.lineTo(q);
  const shape = d.close().sketchOnPlane(new Plane(origin, across, normal)).extrude(hi[depth]! - lo[depth]!) as Shape3D;
  if (!isShapeValid(shape)) {
    shape.delete();
    throw new GeometryError(`${name} : le contour de « ${p.name} » est invalide.`);
  }
  return shape;
}

export function buildTrim(feature: TrimFeature): SolidsOutput {
  if (!feature.parts.length) throw new GeometryError(`${feature.name} : aucune planche de finition.`);
  const shapes: Shape3D[] = [];
  try {
    for (const p of feature.parts) {
      if (p.radius) {
        const height = p.to[2] - p.from[2];
        if (height < 0.1) throw new GeometryError(`${feature.name} : « ${p.name} » n'a pas de hauteur.`);
        shapes.push(makeCylinder(p.radius, height, p.from, [0, 0, 1]) as unknown as Shape3D);
        continue;
      }
      const lo = [0, 1, 2].map((i) => Math.min(p.from[i]!, p.to[i]!)) as [number, number, number];
      const hi = [0, 1, 2].map((i) => Math.max(p.from[i]!, p.to[i]!)) as [number, number, number];
      if ([0, 1, 2].some((i) => hi[i]! - lo[i]! < 0.1)) throw new GeometryError(`${feature.name} : la planche « ${p.name} » est trop fine.`);
      shapes.push(p.outline ? scribed({ ...p, outline: p.outline }, lo, hi, feature.name) : (makeBox(lo, hi) as unknown as Shape3D));
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
