/**
 * Machining of a board: blind holes (32 mm drilling, hinge cups, dowels,
 * confirmat screws) and boxes cut from or added to it (back groove, half-lap,
 * mortise and tenon), all exact booleans on the target solid. A hole or a cut
 * that removes nothing is an error, never a silent no-op.
 */
import { makeBaseBox, makeCylinder, measureVolume, type Shape3D } from "replicad";
import type { MachiningFeature, MachiningOp, Vec3 } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { MIN_LENGTH, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput } from "./outputs";

/** The tool overshoots the surface by 1 mm to avoid coplanar booleans. */
const MARGIN = 1;
/** Below this removed or added volume (mm³) an operation is considered to have missed the body. */
const MIN_CHANGE = 1e-6;

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function toolOf(op: MachiningOp, name: string): Shape3D {
  if (op.kind === "hole") {
    if (Math.hypot(...op.dir) < 1e-9) throw new GeometryError(`${name} : direction de perçage nulle.`);
    const dir = unit(op.dir);
    const from = op.at.map((c, i) => c - (dir[i] as number) * MARGIN) as Vec3;
    return makeCylinder(op.diameter / 2, op.depth + MARGIN, from, dir);
  }
  const lo = [0, 1, 2].map((i) => Math.min(op.from[i] as number, op.to[i] as number)) as Vec3;
  const size = [0, 1, 2].map((i) => Math.abs((op.to[i] as number) - (op.from[i] as number)));
  if (size.some((s) => s < MIN_LENGTH)) throw new GeometryError(`${name} : une cote de l'usinage est nulle.`);
  // replicad's base box is centred on X and Y and rests on Z = 0.
  const corner: Vec3 = [lo[0] + (size[0] as number) / 2, lo[1] + (size[1] as number) / 2, lo[2]];
  return (makeBaseBox(size[0] as number, size[1] as number, size[2] as number) as Shape3D).translate(corner) as Shape3D;
}

/** The operations moved with the board: by how far its low corner is from the anchor the machining was made at. */
function followed(op: MachiningOp, delta: Vec3): MachiningOp {
  const shift = (v: Vec3): Vec3 => [v[0] + delta[0], v[1] + delta[1], v[2] + delta[2]];
  return op.kind === "hole" ? { ...op, at: shift(op.at) } : { ...op, from: shift(op.from), to: shift(op.to) };
}

export function buildMachining(feature: MachiningFeature, lookup: OutputLookup): SolidOutput {
  if (feature.ops.length === 0) throw new GeometryError(`${feature.name} : aucun usinage.`);
  const source = requireSolid(lookup, feature.target).shape;
  let delta: Vec3 = [0, 0, 0];
  if (feature.anchor) {
    const box = source.boundingBox;
    const [min] = box.bounds;
    box.delete();
    delta = [min[0] - feature.anchor[0], min[1] - feature.anchor[1], min[2] - feature.anchor[2]];
  }
  let current = source.clone() as Shape3D;
  for (const op of feature.ops.map((o) => followed(o, delta))) {
    const tool = toolOf(op, feature.name);
    const before = measureVolume(current);
    let next: Shape3D | null = null;
    try {
      next = op.kind === "box" && op.mode === "join" ? current.fuse(tool) : current.cut(tool);
      const change = Math.abs(measureVolume(next) - before);
      if (change <= MIN_CHANGE) throw new GeometryError(`${feature.name} : un usinage ne touche pas le corps à cette position.`);
    } catch (error) {
      next?.delete();
      current.delete();
      throw error;
    } finally {
      tool.delete();
    }
    current.delete();
    current = next;
  }
  return { kind: "solid", shape: requireSingleValidSolid(current, feature.name) };
}
