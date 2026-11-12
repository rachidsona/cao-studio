/**
 * Un appareil d'électroménager dans le noyau : chaque pièce de features/appliance-parts.ts devient un corps — ses
 * formes (pavés, cylindres, prismes) mises ensemble sans opération booléenne, seules la plage d'un évier et ses cuves
 * étant creusées —, posé à l'origine de l'appareil et tourné avec lui comme un caisson. Une cuisine en compte des
 * dizaines : un appareil se bâtit en quelques millisecondes.
 */
import { basicFaceExtrusion, makeBox, makeCompound, makeCylinder, makePolygon, Vector, type Shape3D } from "replicad";
import type { ApplianceFeature, Vec3 } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { applianceParts, type ApplianceShape } from "./appliance-parts";
import { turnedWith } from "./cabinet";
import type { SolidsOutput } from "./outputs";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const low = (a: Vec3, b: Vec3): Vec3 => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const high = (a: Vec3, b: Vec3): Vec3 => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];

function solid(shape: ApplianceShape, o: Vec3): Shape3D {
  if (shape.kind === "cyl") {
    const [a, b] = [add(shape.a, o), add(shape.b, o)];
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...d);
    if (length < 0.05) throw new GeometryError("Pièce d'appareil trop courte.");
    return makeCylinder(shape.r, length, a, [d[0] / length, d[1] / length, d[2] / length]) as unknown as Shape3D;
  }
  if (shape.kind === "prism") {
    // Its profile on the side (x = x0), pulled along x.
    const face = makePolygon(shape.yz.map(([y, z]) => add([shape.x[0], y, z], o)));
    const along = new Vector([shape.x[1] - shape.x[0], 0, 0]);
    try {
      return basicFaceExtrusion(face, along) as unknown as Shape3D;
    } finally {
      face.delete();
      along.delete();
    }
  }
  const [from, to] = [add(shape.from, o), add(shape.to, o)];
  let s = makeBox(low(from, to), high(from, to)) as unknown as Shape3D;
  const cut = (hole: [Vec3, Vec3]) => {
    const tool = makeBox(low(hole[0], hole[1]), high(hole[0], hole[1])) as unknown as Shape3D;
    const next = s.cut(tool) as Shape3D;
    tool.delete();
    s.delete();
    s = next;
  };
  if (shape.kind === "bowl") {
    const w = shape.wall;
    const [a, b] = [low(from, to), high(from, to)];
    cut([[a[0] + w, a[1] + w, a[2] + w], [b[0] - w, b[1] - w, b[2] + 1]]);
  } else for (const [h0, h1] of shape.holes ?? []) cut([add(h0, o), add(h1, o)]);
  return s;
}

export function buildAppliance(feature: ApplianceFeature): SolidsOutput {
  const parts = applianceParts(feature);
  if (!parts.length) throw new GeometryError(`${feature.name} : modèle d'électroménager inconnu (${feature.model}).`);
  const shapes: Shape3D[] = [];
  try {
    for (const part of parts) {
      const pieces: Shape3D[] = [];
      try {
        for (const shape of part.shapes) pieces.push(solid(shape, feature.origin));
      } catch (error) {
        for (const p of pieces) p.delete();
        throw error;
      }
      if (!pieces.length) throw new GeometryError(`${feature.name} : pièce « ${part.name} » vide.`);
      // Side by side in one body: no boolean (makeCompound takes the pieces over).
      const body = pieces.length === 1 ? pieces[0]! : (makeCompound(pieces) as Shape3D);
      shapes.push(turnedWith(body, feature));
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
