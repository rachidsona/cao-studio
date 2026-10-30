/** Shared helpers of the feature builders (inputs, validation, boolean operations). */
import { Plane, type Drawing, type Shape3D, type SketchInterface, type Sketches } from "replicad";
import type { BooleanOperation } from "../document/types";
import { GeometryError, isShapeValid, requireSingleValidSolid, solidCount } from "../geometry/kernel";
import { frameOf, sketchFrame } from "../sketcher/frame";
import type { FeatureOutput, ProfileOutput, SolidOutput, SolidsOutput } from "./outputs";

/** Smallest dimension accepted by the modeller (mm). */
export const MIN_LENGTH = 1e-3;

/**
 * Where a profile's plane is for the kernel: its offset along the normal, or the origin point when the sketch
 * was also moved inside its plane.
 */
export function planeOrigin(profile: ProfileOutput): number | [number, number, number] {
  return profile.shift ? sketchFrame(profile.plane, profile.offset, profile.shift).origin : profile.offset;
}

/**
 * A drawing placed on a profile's plane: its main plane at its origin, or its construction plane (x axis and
 * normal as in the sketcher, so what is drawn is what is built).
 */
export function onProfilePlane(drawing: Drawing, profile: ProfileOutput): SketchInterface | Sketches {
  if (!profile.frame) return drawing.sketchOnPlane(profile.plane, planeOrigin(profile));
  const f = frameOf(profile);
  return drawing.sketchOnPlane(new Plane(f.origin, f.u, f.normal));
}

export type OutputLookup = (id: string) => FeatureOutput | undefined;

export function requirePositive(value: number, label: string): void {
  if (!(value >= MIN_LENGTH)) throw new GeometryError(`${label} doit être supérieur à ${MIN_LENGTH} mm.`);
}

export function requireProfile(lookup: OutputLookup, id: string): ProfileOutput {
  const output = lookup(id);
  if (!output || output.kind !== "profile") throw new GeometryError(`« ${id} » n'est pas une esquisse valide.`);
  return output;
}

export function requireSolid(lookup: OutputLookup, id: string): SolidOutput {
  const output = lookup(id);
  if (!output || output.kind !== "solid") throw new GeometryError(`« ${id} » n'est pas un corps solide valide.`);
  return output;
}

const OPERATION_LABELS: Record<BooleanOperation, string> = {
  new: "Nouveau corps",
  join: "Joindre",
  cut: "Couper",
  intersect: "Intersection",
};

/**
 * One body, or several when the result falls apart in separate solids (two profiles apart extruded at once, a
 * cut through a whole panel): bodies "<feature>#<n>", numbered by position (x, then y, then z) so that references
 * to them survive regenerations. Takes ownership of `shape`.
 */
export function solidsResult(shape: Shape3D, name: string): SolidOutput | SolidsOutput {
  if (solidCount(shape) <= 1) return { kind: "solid", shape: requireSingleValidSolid(shape, name) };
  const parts = shape.solids.map((s) => s.clone() as Shape3D);
  shape.delete();
  if (!parts.every(isShapeValid)) {
    for (const part of parts) part.delete();
    throw new GeometryError(`${name} : un des solides obtenus est invalide.`);
  }
  const centre = (part: Shape3D): number[] => {
    const box = part.boundingBox;
    const c = [...box.center];
    box.delete();
    return c;
  };
  const order = parts.map((part) => ({ part, c: centre(part) }));
  order.sort((a, b) => a.c[0]! - b.c[0]! || a.c[1]! - b.c[1]! || a.c[2]! - b.c[2]!);
  return { kind: "solids", shapes: order.map((o) => o.part) };
}

/**
 * Turns a tool solid into the feature result: a new body, or the target body
 * joined / cut / intersected with it — several bodies when it falls apart. Takes ownership of `tool`.
 */
export function applyOperation(
  name: string,
  tool: Shape3D,
  operation: BooleanOperation,
  targetId: string | undefined,
  lookup: OutputLookup,
): SolidOutput | SolidsOutput {
  if (operation === "new") return solidsResult(tool, name);
  if (!targetId) {
    tool.delete();
    throw new GeometryError(`${name} : un corps cible est requis pour l'opération « ${OPERATION_LABELS[operation]} ».`);
  }
  try {
    const target = requireSolid(lookup, targetId).shape;
    const result = operation === "join" ? target.fuse(tool) : operation === "cut" ? target.cut(tool) : target.intersect(tool);
    return solidsResult(result, name);
  } finally {
    tool.delete();
  }
}

export function profileDrawing(name: string, profile: ProfileOutput) {
  if (!profile.drawing) throw new GeometryError(`${name} : ${profile.openReason ?? "l'esquisse ne contient aucun profil fermé."}`);
  return profile.drawing;
}
