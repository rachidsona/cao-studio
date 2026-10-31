/**
 * Équipement d'une niche dans le noyau : chaque pièce de niche-parts.ts devient un corps — boîtes pour les tiroirs,
 * cylindres pour la tringle et ses supports ; les façades de tiroir et les portes reçoivent leurs trous de poignée
 * (traversants, à l'entraxe et au diamètre de la poignée choisie, Ø5 × 128 mm par défaut) quand on le demande : en
 * travers au milieu d'une façade, le long du bord d'une porte opposé aux charnières ; et la poignée elle-même en 3D,
 * devant ses trous (deux pieds et une barre, ou un bouton).
 */
import { makeBox, makeCylinder, type Shape3D } from "replicad";
import type { NicheFeature, SketchFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";
import { nicheGeometry, nicheParts, nicheProblem, nicheWorld, worldBox, type NicheGeometry, type NichePart } from "./niche-parts";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** How far a handle stands out of its front, its bar and post radii, a knob's radius (mm). */
const HANDLE = { stand: 25, bar: 6, post: 4, overhang: 15, knob: 15 };

/** A bar handle (two posts and a bar beyond them) or a knob, standing out of the front. */
function handleShape(part: NichePart, n: NicheGeometry): Shape3D {
  const a = nicheWorld(n, part.from);
  const b = nicheWorld(n, part.to);
  const out = sub(nicheWorld(n, [0, 0, 1]), nicheWorld(n, [0, 0, 0]));
  const along = sub(b, a);
  const length = Math.hypot(...along);
  if (length < 0.5) return makeCylinder(HANDLE.knob, HANDLE.stand, a, out) as unknown as Shape3D;
  const dir = along.map((c) => c / length) as Vec3;
  const start = [0, 1, 2].map((i) => a[i]! + out[i]! * HANDLE.stand - dir[i]! * HANDLE.overhang) as Vec3;
  const pieces = [makeCylinder(HANDLE.post, HANDLE.stand, a, out), makeCylinder(HANDLE.post, HANDLE.stand, b, out), makeCylinder(HANDLE.bar, length + 2 * HANDLE.overhang, start, dir)] as unknown as Shape3D[];
  let shape = pieces[0]!;
  for (const piece of pieces.slice(1)) {
    const fused = shape.fuse(piece) as Shape3D;
    shape.delete();
    piece.delete();
    shape = fused;
  }
  return shape;
}

function partShape(part: NichePart, n: NicheGeometry, f: NicheFeature): Shape3D {
  if (part.kind === "handle") return handleShape(part, n);
  if (part.kind !== "box") {
    const start = nicheWorld(n, part.from);
    const axis = sub(nicheWorld(n, part.to), start);
    const length = Math.hypot(...axis);
    return makeCylinder(part.radius ?? 1, length, start, axis.map((c) => c / length) as Vec3) as unknown as Shape3D;
  }
  const [a, b] = worldBox(n, part);
  let solid = makeBox(a, b) as unknown as Shape3D;
  // A frame door: the panel set back inside the frame, routed from the front face.
  if (part.role === "front" && part.handle && f.style === "frame") {
    const [w, d] = [f.frameWidth ?? 70, f.frameDepth ?? 6];
    const [p, q] = worldBox(n, { from: [part.from[0] + w, part.from[1] + w, part.to[2] - d], to: [part.to[0] - w, part.to[1] - w, part.to[2] + 1] });
    const pocket = makeBox(p, q) as unknown as Shape3D;
    const cut = solid.cut(pocket) as Shape3D;
    solid.delete();
    pocket.delete();
    solid = cut;
  }
  if (part.role === "front" && f.handles) {
    // Two holes through the front, the handle's spacing apart across its middle (one for a knob), drilled from the
    // front face backwards.
    const [u0, v0, w0] = part.from;
    const [u1, v1, w1] = part.to;
    // A door: along its edge, 40 mm in, at mid-height.
    const at = (k: number): [number, number] => (part.handle ? [part.handle === "left" ? u0 + 40 : u1 - 40, (v0 + v1) / 2 + k] : [(u0 + u1) / 2 + k, (v0 + v1) / 2]);
    const spacing = f.hw?.handleSpacing ?? 128;
    for (const du of spacing > 0 ? [-spacing / 2, spacing / 2] : [0]) {
      const start = nicheWorld(n, [...at(du), w1 + 0.005]);
      const back = sub(nicheWorld(n, [0, 0, -1]), nicheWorld(n, [0, 0, 0]));
      const tool = makeCylinder((f.hw?.handleHole ?? 5) / 2, w1 - w0 + 0.01, start, back) as unknown as Shape3D;
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
