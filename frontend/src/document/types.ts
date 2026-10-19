/**
 * Native CAO Studio document model (format "cao-studio", schema v1).
 *
 * The document is the single source of truth: it stores the parametric
 * history (sketches, features, parameters), never meshes. Geometry is always
 * regenerated from it by the kernel. All lengths are stored in millimetres;
 * `units` is only the display preference of the project.
 */

export const DOCUMENT_FORMAT = "cao-studio";
export const SCHEMA_VERSION = 1;

export type DisplayUnit = "mm" | "cm" | "m" | "in";
export type PlaneName = "XY" | "XZ" | "YZ";

export interface RectangleEntity {
  id: string;
  kind: "rectangle";
  /** Centre of the rectangle in sketch coordinates (mm). */
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface CircleEntity {
  id: string;
  kind: "circle";
  cx: number;
  cy: number;
  diameter: number;
}

export type SketchEntity = RectangleEntity | CircleEntity;

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
  entities: SketchEntity[];
}

export type BooleanOperation = "new" | "join" | "cut";

export interface ExtrudeFeature extends FeatureBase {
  type: "extrude";
  sketch: string;
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
}

export type Feature = SketchFeature | ExtrudeFeature | HoleFeature;
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
    units: "mm",
    parameters: {},
    features: [
      {
        id: "sk1",
        type: "sketch",
        name: "Esquisse 1",
        plane: "XY",
        offset: 0,
        entities: [{ id: "r1", kind: "rectangle", cx: 0, cy: 0, width: 80, height: 50 }],
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
      return feature.target ? [feature.sketch, feature.target] : [feature.sketch];
    case "hole":
      return [feature.target];
  }
}

/** Ids of bodies a feature consumes (they are replaced by its own result). */
export function consumedBodies(feature: Feature): string[] {
  if (feature.type === "hole") return [feature.target];
  if (feature.type === "extrude" && feature.operation !== "new" && feature.target) return [feature.target];
  return [];
}

export function cloneDocument(doc: CadDocument): CadDocument {
  return structuredClone(doc);
}
