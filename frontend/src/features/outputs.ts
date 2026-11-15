/**
 * Results produced by features in the parametric history. Each output owns
 * its OpenCascade objects and must be disposed exactly once.
 */
import type { Drawing, Shape3D } from "replicad";
import type { SketchGeometry } from "../document/sketch";
import type { PlaneFrame, PlaneName } from "../document/types";

export interface ProfileOutput {
  kind: "profile";
  plane: PlaneName;
  offset: number;
  /** Move of the sketch origin inside its plane (mm), if the sketch was moved. */
  shift?: [number, number];
  /** Construction plane of any position, replacing `plane` and `offset`. */
  frame?: PlaneFrame;
  /**
   * Region bounded by the closed loops, or null when the sketch has none: made when first read (a Répartition's
   * boards extrude their own areas and never need the whole region — 60 ms or more for a wall).
   */
  readonly drawing: Drawing | null;
  /** Whether it has a closed profile (or text): known without making the region. */
  closed: boolean;
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

/** Several bodies from one operation (split): body ids "<feature>#<n>". */
export interface SolidsOutput {
  kind: "solids";
  shapes: Shape3D[];
}

export type FeatureOutput = ProfileOutput | SolidOutput | SolidsOutput;

export function disposeOutput(output: FeatureOutput): void {
  // Profiles hold 2D drawings, which replicad reclaims through garbage collection.
  if (output.kind === "solid") output.shape.delete();
  else if (output.kind === "solids") for (const shape of output.shapes) shape.delete();
}
