/**
 * Results produced by features in the parametric history. Each output owns
 * its OpenCascade objects and must be disposed exactly once.
 */
import type { Drawing, Shape3D } from "replicad";
import type { PlaneName } from "../document/types";

export interface ProfileOutput {
  kind: "profile";
  plane: PlaneName;
  offset: number;
  drawing: Drawing;
}

export interface SolidOutput {
  kind: "solid";
  shape: Shape3D;
}

export type FeatureOutput = ProfileOutput | SolidOutput;

export function disposeOutput(output: FeatureOutput): void {
  // Profiles hold 2D drawings, which replicad reclaims through garbage collection.
  if (output.kind === "solid") output.shape.delete();
}
