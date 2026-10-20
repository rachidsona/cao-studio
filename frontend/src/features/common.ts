/** Shared helpers of the feature builders (inputs, validation, boolean operations). */
import type { Shape3D } from "replicad";
import type { BooleanOperation } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { sketchFrame } from "../sketcher/frame";
import type { FeatureOutput, ProfileOutput, SolidOutput } from "./outputs";

/** Smallest dimension accepted by the modeller (mm). */
export const MIN_LENGTH = 1e-3;

/**
 * Where a profile's plane is for the kernel: its offset along the normal, or the origin point when the sketch
 * was also moved inside its plane.
 */
export function planeOrigin(profile: ProfileOutput): number | [number, number, number] {
  return profile.shift ? sketchFrame(profile.plane, profile.offset, profile.shift).origin : profile.offset;
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
  new: "nouveau corps",
  join: "union",
  cut: "soustraction",
  intersect: "intersection",
};

/**
 * Turns a tool solid into the feature result: a new body, or the target body
 * joined / cut / intersected with it. Takes ownership of `tool`.
 */
export function applyOperation(
  name: string,
  tool: Shape3D,
  operation: BooleanOperation,
  targetId: string | undefined,
  lookup: OutputLookup,
): SolidOutput {
  if (operation === "new") return { kind: "solid", shape: requireSingleValidSolid(tool, name) };
  if (!targetId) {
    tool.delete();
    throw new GeometryError(`${name} : un corps cible est requis pour l'opération « ${OPERATION_LABELS[operation]} ».`);
  }
  try {
    const target = requireSolid(lookup, targetId).shape;
    const result = operation === "join" ? target.fuse(tool) : operation === "cut" ? target.cut(tool) : target.intersect(tool);
    return { kind: "solid", shape: requireSingleValidSolid(result, name) };
  } finally {
    tool.delete();
  }
}

export function profileDrawing(name: string, profile: ProfileOutput) {
  if (!profile.drawing) throw new GeometryError(`${name} : ${profile.openReason ?? "l'esquisse ne contient aucun profil fermé."}`);
  return profile.drawing;
}
