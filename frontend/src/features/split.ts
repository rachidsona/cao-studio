/**
 * Split of a body by infinite planes: each plane separates every current
 * piece into the part on its positive side and the rest; disconnected solids
 * become separate pieces (a frame cut by two planes gives four boards).
 */
import { makeBaseBox, measureVolume, type Shape3D } from "replicad";
import type { SplitFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";

/** Below this volume (mm³) a piece is a numerical sliver and is dropped. */
const MIN_PIECE_VOLUME = 1e-6;

/** Large box filling the positive side of the plane (point, unit normal). */
function halfSpace(point: Vec3, normal: Vec3, size: number): Shape3D {
  // makeBaseBox spans z ∈ [0, size]: rotate +Z onto the normal, then move to the plane.
  let box = makeBaseBox(size, size, size) as Shape3D;
  const [nx, ny, nz] = normal;
  const cos = Math.max(-1, Math.min(1, nz));
  const axis: Vec3 = Math.abs(cos) > 1 - 1e-12 ? [1, 0, 0] : [-ny, nx, 0];
  const angle = (Math.acos(cos) * 180) / Math.PI;
  if (angle > 1e-9) box = box.rotate(angle, [0, 0, 0], axis) as Shape3D;
  return box.translate(point) as Shape3D;
}

function solidsOf(shape: Shape3D): Shape3D[] {
  const parts = shape.solids.map((s) => s.clone() as Shape3D).filter((s) => {
    if (measureVolume(s) > MIN_PIECE_VOLUME) return true;
    s.delete();
    return false;
  });
  shape.delete();
  return parts;
}

function centroid(shape: Shape3D): Vec3 {
  const box = shape.boundingBox;
  const c = box.center;
  box.delete();
  return [c[0], c[1], c[2]];
}

export function buildSplit(feature: SplitFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  if (feature.planes.length === 0) throw new GeometryError(`${feature.name} : choisissez au moins un plan de coupe.`);
  const target = requireSolid(lookup, feature.target).shape;
  const bounds = target.boundingBox;
  const [min, max] = bounds.bounds;
  bounds.delete();
  const size = 4 * Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]));

  let pieces: Shape3D[] = [target.clone() as Shape3D];
  try {
    for (const plane of feature.planes) {
      const l = Math.hypot(...plane.normal) || 1;
      const normal: Vec3 = [plane.normal[0] / l, plane.normal[1] / l, plane.normal[2] / l];
      const tool = halfSpace(plane.point, normal, size);
      const next: Shape3D[] = [];
      for (const piece of pieces) {
        next.push(...solidsOf(piece.intersect(tool)), ...solidsOf(piece.cut(tool)));
        piece.delete();
      }
      tool.delete();
      pieces = next;
    }
  } catch (error) {
    for (const piece of pieces) piece.delete();
    throw error;
  }
  if (pieces.length < 2) {
    for (const piece of pieces) piece.delete();
    throw new GeometryError(`${feature.name} : aucun plan ne coupe le corps.`);
  }
  if (!pieces.every(isShapeValid)) {
    for (const piece of pieces) piece.delete();
    throw new GeometryError(`${feature.name} : la coupe donne un solide invalide.`);
  }
  // Stable numbering: by position (x, then y, then z), so references to pieces survive recomputes.
  const order = pieces.map((shape) => ({ shape, c: centroid(shape) }));
  order.sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1] || a.c[2] - b.c[2]);
  return { kind: "solids", shapes: order.map((o) => o.shape) };
}
