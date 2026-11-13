/**
 * Les rainures d'une façade décor (door-decor.ts) creusées dans le noyau : chaque rainure est un outil — une boîte,
 * ou un cylindre pour une cannelure —, tous réunis en un seul composé ôté d'un coup de la porte. Les points sont donnés
 * dans le repère de la porte [travers, haut, épaisseur] et `toWorld` les porte dans le monde.
 */
import { makeBox, makeCompound, makeCylinder, type Shape3D } from "replicad";
import type { Vec3 } from "../document/types";
import { grooveTool, type Groove } from "./door-decor";

export function cutGrooves(solid: Shape3D, grooves: readonly Groove[], face: number, into: -1 | 1, toWorld: (p: Vec3) => Vec3): Shape3D {
  if (!grooves.length) return solid;
  const tools = grooves.map((g) => {
    const t = grooveTool(g, face, into);
    if ("box" in t) {
      const [a, b] = t.box.map(toWorld) as [Vec3, Vec3];
      return makeBox([0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)) as Vec3, [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)) as Vec3) as unknown as Shape3D;
    }
    const [start, end] = [toWorld(t.from), toWorld(t.to)];
    const axis = [0, 1, 2].map((i) => end[i]! - start[i]!) as Vec3;
    const length = Math.hypot(...axis);
    return makeCylinder(t.radius, length, start, axis.map((c) => c / length) as Vec3) as unknown as Shape3D;
  });
  const all = makeCompound(tools) as unknown as Shape3D;
  const cut = solid.cut(all) as Shape3D;
  solid.delete();
  all.delete();
  for (const tool of tools) tool.delete();
  return cut;
}
