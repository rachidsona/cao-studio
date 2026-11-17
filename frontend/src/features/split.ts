/**
 * Split of a body by a plane, with the kernel's own split operation (a real
 * boolean cut, never a visual effect). The plane is a construction plane or
 * the plane of a planar face. Each side gives zero, one or several solids
 * (a U-shaped body cut across its arms gives two on the same side); the
 * feature keeps both sides or one, and checks that the plane really crosses
 * the body and that the pieces are valid and add up to the body.
 */
import { Plane, measureVolume, type Shape3D } from "replicad";
import type { SplitFeature, SplitTool, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { resolveFacePlane } from "../geometry/references";
import { sketchFrame } from "../sketcher/frame";
import { requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";

/** Below this volume (mm³) a piece is a numerical sliver and is not a piece. */
const MIN_PIECE_VOLUME = 1e-6;
/** Relative error accepted between the volume of the pieces and the body's. */
const VOLUME_TOLERANCE = 1e-6;

/** The cutting plane in world coordinates: a point, and the unit normal pointing to the positive side. */
export function toolPlane(tool: SplitTool, lookup: OutputLookup): { origin: Vec3; normal: Vec3 } {
  if (tool.kind === "plane") {
    if (!Number.isFinite(tool.offset)) throw new GeometryError("Le décalage du plan de coupe n'est pas un nombre.");
    const frame = sketchFrame(tool.plane, tool.offset);
    return { origin: frame.origin, normal: frame.normal };
  }
  if (tool.kind === "line") {
    const length = Math.hypot(...tool.normal);
    if (![...tool.origin, ...tool.normal].every(Number.isFinite) || length < 1e-9) throw new GeometryError("Le plan de coupe du trait n'est pas valide.");
    return { origin: tool.origin, normal: tool.normal.map((c) => c / length) as Vec3 };
  }
  return resolveFacePlane(requireSolid(lookup, tool.body).shape, tool.face);
}

/** Solids of one side of the cut (each cloned: the split result is released). */
function solidsOf(side: Shape3D | null): Shape3D[] {
  if (!side) return [];
  const parts = side.solids.map((s) => s.clone() as Shape3D).filter((s) => {
    if (measureVolume(s) > MIN_PIECE_VOLUME) return true;
    s.delete();
    return false;
  });
  side.delete();
  return parts;
}

function centre(shape: Shape3D): Vec3 {
  const box = shape.boundingBox;
  const c = box.center;
  box.delete();
  return [c[0], c[1], c[2]];
}

export function buildSplit(feature: SplitFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const target = requireSolid(lookup, feature.target).shape;
  const { origin, normal } = toolPlane(feature.tool, lookup);
  const plane = new Plane(origin, null, normal);
  let positive: Shape3D[] = [];
  let negative: Shape3D[] = [];
  try {
    const sides = target.split(plane);
    sides.on?.delete();
    positive = solidsOf(sides.positive as Shape3D | null);
    negative = solidsOf(sides.negative as Shape3D | null);
  } finally {
    plane.delete();
  }
  const all = [...positive, ...negative];
  const release = () => all.forEach((s) => s.delete());
  // The tool must really cross the body: a plane that misses it, or only touches a face, leaves one side empty.
  if (positive.length === 0 || negative.length === 0) {
    release();
    throw new GeometryError(`${feature.name} : le plan de coupe ne traverse pas le corps (il ne le coupe pas en deux parties).`);
  }
  const bodyVolume = measureVolume(target);
  const total = all.reduce((sum, s) => sum + measureVolume(s), 0);
  if (Math.abs(total - bodyVolume) > VOLUME_TOLERANCE * bodyVolume + MIN_PIECE_VOLUME) {
    release();
    throw new GeometryError(`${feature.name} : la coupe a donné un résultat incohérent (volume perdu ou créé), elle est refusée.`);
  }
  if (!all.every(isShapeValid)) {
    release();
    throw new GeometryError(`${feature.name} : la coupe donne un solide invalide.`);
  }
  const kept = feature.keep === "both" ? all : feature.keep === "positive" ? positive : negative;
  for (const s of all) if (!kept.includes(s)) s.delete();
  // Stable numbering by position (x, then y, then z), so references to pieces survive regenerations.
  const order = kept.map((shape) => ({ shape, c: centre(shape) }));
  order.sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1] || a.c[2] - b.c[2]);
  const shapes = order.map((o) => o.shape);
  // One solid left: it is the same body, cut. Several: separate bodies.
  return shapes.length === 1 ? { kind: "solid", shape: shapes[0] as Shape3D } : { kind: "solids", shapes };
}
