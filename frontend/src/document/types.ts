/**
 * Native CAO Studio document model (format "cao-studio", schema v2).
 *
 * The document is the single source of truth: it stores the parametric
 * history (sketches, features, parameters), never meshes. Geometry is always
 * regenerated from it by the kernel. All lengths are stored in millimetres;
 * `units` is only the display preference of the project.
 */

import { centeredRectangle, type SketchConstraint, type SketchCurve, type SketchPoint } from "./sketch";

export const DOCUMENT_FORMAT = "cao-studio";
export const SCHEMA_VERSION = 2;

export type DisplayUnit = "mm" | "cm" | "m" | "in";
export type PlaneName = "XY" | "XZ" | "YZ";

interface FeatureBase {
  id: string;
  name: string;
  suppressed?: boolean;
}

export interface SketchFeature extends FeatureBase {
  type: "sketch";
  plane: PlaneName;
  /** Offset of the sketch plane along its normal (mm). */
  offset: number;
  points: SketchPoint[];
  curves: SketchCurve[];
  constraints: SketchConstraint[];
  /** Body whose face this sketch was drawn on (extrusions then default to a union with it). */
  support?: string;
}

export type BooleanOperation = "new" | "join" | "cut" | "intersect";

export type Vec3 = [number, number, number];

/**
 * Persistent reference to an edge of a body. The edge is found again after a
 * recomputation by matching its curve type, direction and position relative
 * to the body's bounding box (robust to resizing, see geometry/references.ts).
 */
export interface EdgeRef {
  type: string;
  /** Midpoint (mm) when selected, and the same point normalised to the bounding box (0..1). */
  mid: Vec3;
  rel: Vec3;
  /** Unit tangent at the midpoint (sign-normalised). */
  dir: Vec3;
  length: number;
}

/** Persistent reference to a face of a body (same matching principle as EdgeRef). */
export interface FaceRef {
  type: string;
  center: Vec3;
  rel: Vec3;
  /** Outward unit normal at the centre. */
  normal: Vec3;
  area: number;
}

export interface ExtrudeFeature extends FeatureBase {
  type: "extrude";
  /** Profile source: a sketch… */
  sketch?: string;
  /**
   * …or planar faces of the target body, each pushed/pulled along its own
   * outward normal (positive distance adds material, negative digs in).
   */
  faces?: FaceRef[];
  /** Extrusion length along the sketch normal (mm, non-zero). */
  distance: number;
  operation: BooleanOperation;
  /** Body consumed by "join" / "cut" operations. */
  target?: string;
}

export interface HoleFeature extends FeatureBase {
  type: "hole";
  target: string;
  /** Hole axis position on the XY plane (mm); drilled along -Z from the top of the body. */
  x: number;
  y: number;
  diameter: number;
  depth: number | "through";
  /**
   * Hole placed on a face: start point (mm) and drilling direction (into the
   * body). When present, x/y are ignored; the start point is projected onto
   * the face found again from `face` so the hole follows the face.
   */
  origin?: Vec3;
  direction?: Vec3;
  face?: FaceRef;
}

export interface RevolveFeature extends FeatureBase {
  type: "revolve";
  sketch: string;
  /** Line of the sketch used as axis (a sketch line id, "axisX" or "axisY"). */
  axis: string;
  /** Revolution angle in degrees (0 < angle ≤ 360). */
  angle: number;
  operation: BooleanOperation;
  target?: string;
}

export interface FilletFeature extends FeatureBase {
  type: "fillet";
  target: string;
  edges: EdgeRef[];
  radius: number;
}

export interface ChamferFeature extends FeatureBase {
  type: "chamfer";
  target: string;
  edges: EdgeRef[];
  distance: number;
}

/** Boolean between existing bodies: target (op) tools. */
export interface CombineFeature extends FeatureBase {
  type: "combine";
  target: string;
  tools: string[];
  operation: "join" | "cut" | "intersect";
  /** Keep the tool bodies visible after the operation. */
  keepTools?: boolean;
}

export type Feature =
  | SketchFeature
  | ExtrudeFeature
  | HoleFeature
  | RevolveFeature
  | FilletFeature
  | ChamferFeature
  | CombineFeature;
export type FeatureType = Feature["type"];

export interface Parameter {
  value: number;
  unit: "mm" | "deg" | "";
  comment?: string;
}

export interface CadDocument {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  units: DisplayUnit;
  parameters: Record<string, Parameter>;
  features: Feature[];
}

/** Reference part: 80 x 50 x 10 mm plate with a 10 mm through hole. */
export function createReferencePlate(): CadDocument {
  return {
    format: DOCUMENT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    units: "cm",
    parameters: {},
    features: [
      {
        id: "sk1",
        type: "sketch",
        name: "Esquisse 1",
        plane: "XY",
        offset: 0,
        ...centeredRectangle(80, 50),
      },
      { id: "ex1", type: "extrude", name: "Extrusion 1", sketch: "sk1", distance: 10, operation: "new" },
      { id: "h1", type: "hole", name: "Perçage 1", target: "ex1", x: 0, y: 0, diameter: 10, depth: "through" },
    ],
  };
}

/** Ids of the features a feature reads from (its inputs in the history graph). */
export function featureInputs(feature: Feature): string[] {
  switch (feature.type) {
    case "sketch":
      return [];
    case "extrude":
      if (feature.faces) return feature.target ? [feature.target] : [];
      return feature.target && feature.operation !== "new" ? [feature.sketch ?? "", feature.target] : [feature.sketch ?? ""];
    case "revolve":
      return feature.target && feature.operation !== "new" ? [feature.sketch, feature.target] : [feature.sketch];
    case "hole":
    case "fillet":
    case "chamfer":
      return [feature.target];
    case "combine":
      return [feature.target, ...feature.tools];
  }
}

/** Ids of bodies a feature consumes (they are replaced by its own result). */
export function consumedBodies(feature: Feature): string[] {
  switch (feature.type) {
    case "hole":
    case "fillet":
    case "chamfer":
      return [feature.target];
    case "extrude":
    case "revolve":
      return feature.operation !== "new" && feature.target ? [feature.target] : [];
    case "combine":
      return feature.keepTools ? [feature.target] : [feature.target, ...feature.tools];
    case "sketch":
      return [];
  }
}

/** Features whose output is a solid body. */
export const SOLID_FEATURES: ReadonlySet<FeatureType> = new Set(["extrude", "hole", "revolve", "fillet", "chamfer", "combine"]);

export function cloneDocument(doc: CadDocument): CadDocument {
  return structuredClone(doc);
}
