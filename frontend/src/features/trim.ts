/** Finitions dans le noyau : chaque planche (joue, fileur, plinthe, bandeau) est une boîte, chaque pied un cylindre. */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { TrimFeature } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";

export function buildTrim(feature: TrimFeature): SolidsOutput {
  if (!feature.parts.length) throw new GeometryError(`${feature.name} : aucune planche de finition.`);
  const shapes = feature.parts.map((p) => {
    if (p.radius) {
      const height = p.to[2] - p.from[2];
      if (height < 0.1) throw new GeometryError(`${feature.name} : « ${p.name} » n'a pas de hauteur.`);
      return makeCylinder(p.radius, height, p.from, [0, 0, 1]) as unknown as Shape3D;
    }
    const lo = [0, 1, 2].map((i) => Math.min(p.from[i]!, p.to[i]!)) as [number, number, number];
    const hi = [0, 1, 2].map((i) => Math.max(p.from[i]!, p.to[i]!)) as [number, number, number];
    if ([0, 1, 2].some((i) => hi[i]! - lo[i]! < 0.1)) throw new GeometryError(`${feature.name} : la planche « ${p.name} » est trop fine.`);
    return makeBox(lo, hi) as unknown as Shape3D;
  });
  return { kind: "solids", shapes };
}
