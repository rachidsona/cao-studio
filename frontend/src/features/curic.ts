/**
 * Tools inspired by Curic's SketchUp plugins, on the exact solids of the
 * kernel: mirror copies, alignment of a body on another, and stretch across a
 * plane (a cabinet made wider: the boards crossing the plane get longer, the
 * ones beyond it move).
 */
import { Plane, basicFaceExtrusion, Vector, type Shape3D } from "replicad";
import { arrayOffsets, type AlignFeature, type AlignMode, type ArrayFeature, Axis, MirrorFeature, RotateFeature, StretchFeature, Vec3 } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { MIN_LENGTH, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";

export type Box = [Vec3, Vec3];

const unitAxis = (axis: Axis): Vec3 => [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];

function boxOf(shape: Shape3D): Box {
  const box = shape.boundingBox;
  const [min, max] = box.bounds;
  box.delete();
  return [
    [min[0], min[1], min[2]],
    [max[0], max[1], max[2]],
  ];
}

// ---- mirror -----------------------------------------------------------------------------

export function buildMirror(feature: MirrorFeature, lookup: OutputLookup): SolidsOutput {
  if (feature.targets.length === 0) throw new GeometryError(`${feature.name} : choisissez au moins un corps.`);
  if (!Number.isFinite(feature.position)) throw new GeometryError(`${feature.name} : la position du plan n'est pas un nombre.`);
  const origin: Vec3 = [0, 0, 0];
  origin[feature.axis] = feature.position;
  const shapes: Shape3D[] = [];
  try {
    for (const id of feature.targets) {
      // replicad's transformations consume the shape: mirror a copy, the original stays.
      shapes.push((requireSolid(lookup, id).shape.clone() as Shape3D).mirror(unitAxis(feature.axis), origin) as Shape3D);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}

// ---- array and rotate -----------------------------------------------------------------------

export function buildArray(feature: ArrayFeature, lookup: OutputLookup): SolidsOutput {
  if (feature.targets.length === 0) throw new GeometryError(`${feature.name} : choisissez au moins un corps.`);
  if (!(feature.count >= 1)) throw new GeometryError(`${feature.name} : au moins une copie.`);
  const around = feature.around;
  if (around) {
    if (!Number.isFinite(around.angle) || Math.abs(around.angle) < 1e-9) throw new GeometryError(`${feature.name} : l'angle entre les copies est nul.`);
  } else if (Math.hypot(...feature.step) < MIN_LENGTH || (feature.second && Math.hypot(...feature.second.step) < MIN_LENGTH)) throw new GeometryError(`${feature.name} : le pas entre les copies est nul.`);
  const shapes: Shape3D[] = [];
  try {
    for (const id of feature.targets) {
      const shape = requireSolid(lookup, id).shape;
      if (around) {
        for (let k = 1; k <= feature.count; k++) shapes.push((shape.clone() as Shape3D).rotate(around.angle * k, around.center, unitAxis(around.axis)) as Shape3D);
      } else for (const offset of arrayOffsets(feature)) shapes.push((shape.clone() as Shape3D).translate(offset) as Shape3D);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}

export function buildRotate(feature: RotateFeature, lookup: OutputLookup): SolidOutput {
  if (!Number.isFinite(feature.angle) || Math.abs(feature.angle) < 1e-9) throw new GeometryError(`${feature.name} : l'angle de rotation est nul.`);
  const target = requireSolid(lookup, feature.target).shape;
  return { kind: "solid", shape: (target.clone() as Shape3D).rotate(feature.angle, feature.center, unitAxis(feature.axis)) as Shape3D };
}

// ---- align ------------------------------------------------------------------------------

/** Translation that lines the box `target` up with `reference`, axis by axis. */
export function alignDelta(target: Box, reference: Box, modes: readonly AlignMode[]): Vec3 {
  return [0, 1, 2].map((i) => {
    const [t0, t1] = [target[0][i] as number, target[1][i] as number];
    const [r0, r1] = [reference[0][i] as number, reference[1][i] as number];
    switch (modes[i]) {
      case "min":
        return r0 - t0;
      case "center":
        return (r0 + r1) / 2 - (t0 + t1) / 2;
      case "max":
        return r1 - t1;
      case "after":
        return r1 - t0;
      case "before":
        return r0 - t1;
      default:
        return 0;
    }
  }) as Vec3;
}

export function buildAlign(feature: AlignFeature, lookup: OutputLookup): SolidOutput {
  if (feature.target === feature.reference) throw new GeometryError(`${feature.name} : un corps ne s'aligne pas sur lui-même.`);
  if (feature.modes.every((m) => m === "none")) throw new GeometryError(`${feature.name} : choisissez au moins un alignement (X, Y ou Z).`);
  const target = requireSolid(lookup, feature.target).shape;
  const reference = requireSolid(lookup, feature.reference).shape;
  const delta = alignDelta(boxOf(target), boxOf(reference), feature.modes);
  return { kind: "solid", shape: (target.clone() as Shape3D).translate(delta) as Shape3D };
}

// ---- stretch ----------------------------------------------------------------------------

/** Where a box lies with respect to the plane: entirely before it, entirely beyond it, or across it. */
export function stretchSide(box: Box, axis: Axis, position: number): "before" | "beyond" | "across" {
  const eps = 1e-6;
  if ((box[1][axis] as number) <= position + eps) return "before";
  if ((box[0][axis] as number) >= position - eps) return "beyond";
  return "across";
}

/** The side of `shape` on the low (negative) or high (positive) side of the plane, or null when empty. */
function sideOf(shape: Shape3D, axis: Axis, position: number, which: "positive" | "negative"): Shape3D | null {
  const origin: Vec3 = [0, 0, 0];
  origin[axis] = position;
  const sides = (shape.clone() as Shape3D).split(new Plane(origin, null, unitAxis(axis)));
  sides.on?.delete();
  const other = which === "positive" ? sides.negative : sides.positive;
  other?.delete();
  return (sides[which] as Shape3D | null) ?? null;
}

/** The faces of `part` lying in the plane (its cut section), each swept along the axis by `distance`. */
function sectionPrism(part: Shape3D, axis: Axis, position: number, distance: number): Shape3D | null {
  let prism: Shape3D | null = null;
  for (const face of part.faces) {
    if (face.geomType !== "PLANE") continue;
    const n = face.normalAt(face.center);
    const c = face.center;
    const along = [n.x, n.y, n.z][axis] as number;
    if (Math.abs(Math.abs(along) - 1) > 1e-6 || Math.abs(([c.x, c.y, c.z][axis] as number) - position) > 1e-6) continue;
    const vector = new Vector(unitAxis(axis).map((u) => u * distance) as Vec3);
    const piece = basicFaceExtrusion(face, vector) as Shape3D;
    vector.delete();
    if (!prism) prism = piece;
    else {
      const fused: Shape3D = prism.fuse(piece);
      prism.delete();
      piece.delete();
      prism = fused;
    }
  }
  return prism;
}

export function buildStretch(feature: StretchFeature, lookup: OutputLookup): SolidOutput {
  const { axis, position, distance, name } = feature;
  if (!Number.isFinite(position) || !Number.isFinite(distance)) throw new GeometryError(`${name} : la position ou la distance n'est pas un nombre.`);
  if (Math.abs(distance) < MIN_LENGTH) throw new GeometryError(`${name} : la distance d'étirement est nulle.`);
  const target = requireSolid(lookup, feature.target).shape;
  const box = boxOf(target);
  const side = stretchSide(box, axis, position);
  const move = unitAxis(axis).map((u) => u * distance) as Vec3;
  if (side === "before") return { kind: "solid", shape: target.clone() as Shape3D };
  if (side === "beyond") return { kind: "solid", shape: (target.clone() as Shape3D).translate(move) as Shape3D };
  if (distance < 0 && position + distance <= (box[0][axis] as number) + MIN_LENGTH) {
    throw new GeometryError(`${name} : on ne peut pas raccourcir de plus que la longueur avant le plan.`);
  }
  // Longer: the part before the plane, the section swept by the distance, the part beyond moved.
  // Shorter: the part before (plane − distance), and the part beyond moved back onto it.
  const low = sideOf(target, axis, distance > 0 ? position : position + distance, "negative");
  const high = sideOf(target, axis, position, "positive");
  if (!low || !high) {
    low?.delete();
    high?.delete();
    throw new GeometryError(`${name} : le plan ne traverse pas le corps.`);
  }
  const parts: Shape3D[] = [low, high.translate(move) as Shape3D];
  if (distance > 0) {
    const prism = sectionPrism(low, axis, position, distance);
    if (!prism) {
      for (const p of parts) p.delete();
      throw new GeometryError(`${name} : la section du corps dans le plan est introuvable.`);
    }
    parts.push(prism);
  }
  let result = parts[0] as Shape3D;
  for (const part of parts.slice(1)) {
    const fused: Shape3D = result.fuse(part);
    result.delete();
    part.delete();
    result = fused;
  }
  return { kind: "solid", shape: requireSingleValidSolid(result.simplify(), name) };
}
