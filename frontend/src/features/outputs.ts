/**
 * Results produced by features in the parametric history. Each output owns
 * its OpenCascade objects and must be disposed exactly once.
 */
import type { Drawing, Shape3D } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import type { PlaneName } from "../document/types";

export interface ProfileOutput {
  kind: "profile";
  plane: PlaneName;
  offset: number;
  /** Region bounded by the closed loops, or null when the sketch has none. */
  drawing: Drawing | null;
  /** Why no region could be built (open or branched profile). */
  openReason: string | null;
  /** Remaining degrees of freedom of the solved sketch. */
  dof: number;
  redundant: string[];
  /** Solved sketch geometry (axes of revolutions, display). */
  geometry: SketchGeometry;
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
