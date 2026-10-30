/**
 * Façades d'un caisson dans le noyau : chaque pièce de fronts-parts.ts devient une planche ; les portes reçoivent
 * leurs boîtiers de charnière (Ø35, profondeur 13, centre à 22,5 mm du chant côté charnière, à 100 mm du haut et du
 * bas, plus un au milieu pour une grande porte), et portes et façades de tiroir leurs trous de poignée (Ø5
 * traversants, entraxe 128 mm).
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { CabinetFeature, FrontsFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { frontsParts, frontsProblem, hingeCount, type FrontPart } from "./fronts-parts";
import type { OutputLookup } from "./common";
import type { SolidsOutput } from "./outputs";
import { turnedWith } from "./cabinet";

/** Where the drill goes in a front: hinge cups on the inside face, handle holes through. */
function drillings(part: FrontPart, f: FrontsFeature): { at: Vec3; radius: number; depth: number }[] {
  const role = part.role;
  if (!role) return [];
  const [x0, y0, z0] = part.from;
  const [x1, y1, z1] = part.to;
  const inside = y1; // the face towards the cabinet (+Y)
  const out: { at: Vec3; radius: number; depth: number }[] = [];
  if (role.kind === "door" && f.hinges) {
    const x = role.hinge === "left" ? x0 + 22.5 : x1 - 22.5;
    const n = hingeCount(z1 - z0);
    for (let k = 0; k < n; k++) out.push({ at: [x, inside, z0 + 100 + ((z1 - z0 - 200) * k) / (n - 1)], radius: 17.5, depth: 13 });
  }
  if (f.handles) {
    if (role.kind === "door") {
      // Vertical pair near the opening edge, in the upper part of the door.
      const x = role.hinge === "left" ? x1 - 40 : x0 + 40;
      const zc = Math.max(z0 + 100, z1 - 150);
      for (const dz of [-64, 64]) out.push({ at: [x, inside, zc + dz], radius: 2.5, depth: y1 - y0 });
    } else {
      // Horizontal pair in the middle of the drawer front.
      const [xc, zc] = [(x0 + x1) / 2, (z0 + z1) / 2];
      for (const dx of [-64, 64]) out.push({ at: [xc + dx, inside, zc], radius: 2.5, depth: y1 - y0 });
    }
  }
  return out;
}

export function buildFronts(feature: FrontsFeature, lookup: OutputLookup, cabinet: CabinetFeature | undefined): SolidsOutput {
  void lookup;
  const problem = frontsProblem(feature, cabinet);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const shapes: Shape3D[] = [];
  try {
    for (const part of frontsParts(feature, cabinet)) {
      let solid = makeBox(part.from, part.to) as unknown as Shape3D;
      for (const d of drillings(part, feature)) {
        // Drilled from the inside face towards the outside (−Y).
        const tool = makeCylinder(d.radius, d.depth + 0.01, [d.at[0], d.at[1] + 0.005, d.at[2]], [0, -1, 0]) as unknown as Shape3D;
        const cut = solid.cut(tool) as Shape3D;
        solid.delete();
        tool.delete();
        solid = cut;
      }
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : la pièce « ${part.name} » est invalide.`);
      }
      shapes.push(cabinet ? turnedWith(solid, cabinet) : solid);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
