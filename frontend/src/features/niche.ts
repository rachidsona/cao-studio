/**
 * Équipement d'une niche dans le noyau : chaque pièce de niche-parts.ts devient un corps — boîtes pour les tiroirs,
 * cylindres pour la tringle et ses supports ; les façades de tiroir reçoivent leurs trous de poignée (Ø5 traversants,
 * entraxe 128 mm) quand on le demande.
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { NicheFeature, SketchFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";
import { nicheGeometry, nicheParts, nicheProblem, nicheWorld, worldBox, type NicheGeometry, type NichePart } from "./niche-parts";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function partShape(part: NichePart, n: NicheGeometry, f: NicheFeature): Shape3D {
  if (part.kind !== "box") {
    const start = nicheWorld(n, part.from);
    const axis = sub(nicheWorld(n, part.to), start);
    const length = Math.hypot(...axis);
    return makeCylinder(part.radius ?? 1, length, start, axis.map((c) => c / length) as Vec3) as unknown as Shape3D;
  }
  const [a, b] = worldBox(n, part);
  let solid = makeBox(a, b) as unknown as Shape3D;
  if (part.role === "front" && f.handles) {
    // Two holes through the front, 128 mm apart across its middle, drilled from the front face backwards.
    const [u0, v0, w0] = part.from;
    const [u1, v1, w1] = part.to;
    for (const du of [-64, 64]) {
      const start = nicheWorld(n, [(u0 + u1) / 2 + du, (v0 + v1) / 2, w1 + 0.005]);
      const back = sub(nicheWorld(n, [0, 0, -1]), nicheWorld(n, [0, 0, 0]));
      const tool = makeCylinder(2.5, w1 - w0 + 0.01, start, back) as unknown as Shape3D;
      const cut = solid.cut(tool) as Shape3D;
      solid.delete();
      tool.delete();
      solid = cut;
    }
  }
  return solid;
}

export function buildNiche(feature: NicheFeature, sketch: SketchFeature | undefined): SolidsOutput {
  const n = nicheGeometry(feature, sketch);
  if (typeof n === "string") throw new GeometryError(`${feature.name} : ${n}`);
  const problem = nicheProblem(feature, n);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const shapes: Shape3D[] = [];
  try {
    for (const part of nicheParts(feature, n)) {
      const solid = partShape(part, n, feature);
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : la pièce « ${part.name} » est invalide.`);
      }
      shapes.push(solid);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
