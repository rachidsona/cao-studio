/**
 * Parametric sketch model (document schema v2).
 *
 * A sketch is a set of points, curves that reference those points, and
 * constraints. Point coordinates are the last solved positions: they are the
 * solver's starting guess, which keeps solutions stable from one edit to the
 * next. Coordinates are in millimetres in the sketch plane; angles in degrees.
 */
import type { GlassKind, ProfileFinish } from "./types";

/** Implicit, fixed references available in every sketch. */
export const ORIGIN = "origin";
export const AXIS_X = "axisX";
export const AXIS_Y = "axisY";
export const RESERVED_IDS: ReadonlySet<string> = new Set([ORIGIN, AXIS_X, AXIS_Y]);

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
  /** Fixed in place (projected body geometry): the solver never moves it. */
  fixed?: boolean;
}

interface CurveBase {
  id: string;
  /** Construction geometry guides the sketch but never forms a profile. */
  construction?: boolean;
  /** Projected from a body edge: fixed reference geometry, drawn in purple, used for snapping. */
  projected?: boolean;
}

export interface LineCurve extends CurveBase {
  kind: "line";
  p1: string;
  p2: string;
}

export interface CircleCurve extends CurveBase {
  kind: "circle";
  center: string;
  radius: number;
}

/** Arc drawn counter-clockwise from `start` to `end` around `center`. */
export interface ArcCurve extends CurveBase {
  kind: "arc";
  center: string;
  start: string;
  end: string;
  radius: number;
  /** Radians, kept consistent with the end points by the solver. */
  startAngle: number;
  endAngle: number;
}

export type SketchCurve = LineCurve | CircleCurve | ArcCurve;
export type CurveKind = SketchCurve["kind"];

/** Geometric relations (no value). */
export type GeometricConstraint =
  | { id: string; kind: "coincident"; a: string; b: string }
  | { id: string; kind: "horizontal"; line: string }
  | { id: string; kind: "vertical"; line: string }
  | { id: string; kind: "parallel"; a: string; b: string }
  | { id: string; kind: "perpendicular"; a: string; b: string }
  | { id: string; kind: "tangent"; a: string; b: string }
  | { id: string; kind: "equal"; a: string; b: string }
  /** Points a and b symmetric about a point or a line. */
  | { id: string; kind: "symmetric"; a: string; b: string; axis: string }
  | { id: string; kind: "concentric"; a: string; b: string }
  | { id: string; kind: "fix"; point: string; x: number; y: number }
  | { id: string; kind: "pointOnCurve"; point: string; curve: string }
  | { id: string; kind: "midpoint"; point: string; line: string };

interface DimensionBase {
  id: string;
  /** Friendly name shown in the properties panel, e.g. "Largeur". */
  label?: string;
  /** Reference dimensions are measured, never imposed. */
  driving?: boolean;
  value: number;
  /**
   * Where the dimension is drawn (presentation only, set by dragging it):
   * distance (mm) of a linear dimension line beyond the geometry, or angle
   * (degrees) of the leader of a radius/diameter.
   */
  offset?: number;
}

/** Dimensional constraints (mm, or degrees for angles). */
export type DimensionConstraint = DimensionBase &
  (
    | { kind: "distance"; a: string; b: string }
    /** Signed horizontal distance: b.x − a.x. */
    | { kind: "distanceX"; a: string; b: string }
    /** Signed vertical distance: b.y − a.y. */
    | { kind: "distanceY"; a: string; b: string }
    | { kind: "pointLineDistance"; point: string; line: string }
    | { kind: "length"; line: string }
    | { kind: "angle"; a: string; b: string }
    | { kind: "radius"; curve: string }
    | { kind: "diameter"; curve: string }
  );

export type SketchConstraint = GeometricConstraint | DimensionConstraint;
export type ConstraintKind = SketchConstraint["kind"];

export const DIMENSION_KINDS: ReadonlySet<ConstraintKind> = new Set([
  "distance",
  "distanceX",
  "distanceY",
  "pointLineDistance",
  "length",
  "angle",
  "radius",
  "diameter",
]);

export function isDimension(c: SketchConstraint): c is DimensionConstraint {
  return DIMENSION_KINDS.has(c.kind);
}

/** A divider: one panel, two back to back, or none (the two cases on each side make one niche). */
export type DividerKind = "single" | "double" | "none";
/** Which runs through at a junction: the top and bottom board (across), or the side (over the full height). */
export type Pass = "board" | "side";
/** The outer sides can also meet the top and the bottom « d'onglet »: both cut at 45° along the corner's diagonal. */
export type OuterPass = Pass | "miter";
/** How the niches share the height: all equal, the bottom one fixed, the top one fixed, or each as set (`heights`). */
export type ShelfMode = "equal" | "bottom" | "top" | "set";

/** What a « Répartition » is made from (see sketcher/partition.ts). */
export interface PartitionParams {
  /** Along x. */
  length: number;
  /** Along y. */
  height: number;
  /** Thickness of every panel (and height of the top). */
  thickness: number;
  /** Number of cases (doors), 2 or more. */
  cases: number;
  /** The dividers from left to right (cases − 1 of them). */
  dividers: DividerKind[];
  /**
   * The share of the free length each case gets, from the left (absent: all equal). « 1, 2 »: the second case is
   * twice as wide as the first (a cabinet of 1 door + 2 doors).
   */
  widths?: number[];
  /** Top and bottom panels. */
  boards: boolean;
  /** No top panel, the sides going up to the height: a sloped ceiling cuts them, a sloped board closes them. */
  openTop?: boolean;
  /** The bottom board is raised by this height, which leaves a plinth under it (mm; 0: no plinth). */
  plinth: number;
  /** Which runs through where the outer sides, the simple dividers and the double ones meet the boards. */
  outer: OuterPass;
  single: Pass;
  double: Pass;
}

/** What a division of a niche by shelves is made from (see sketcher/shelves.ts). */
export interface ShelfParams {
  /** Number of shelves; n shelves make n + 1 niches. */
  count: number;
  /** Thickness of each shelf. */
  thickness: number;
  mode: ShelfMode;
  /** Height of the fixed niche (mode "bottom" or "top"). */
  fixed: number;
  /** Mode "set": the height of each niche from the bottom, null for those sharing what is left (« Niche »). */
  heights?: (number | null)[];
  /**
   * « Cloisons »: upright panels dividing the niche from left to right (the niches share its width; "bottom" is then
   * the left one, "top" the right one). Absent: shelves.
   */
  vertical?: boolean;
}

/**
 * The parametric history of a « Répartition »: the partition itself, then the divisions of its niches by shelves
 * (each its own step, after it). The curves are made again from these steps whenever one of them is changed.
 */
/** The doors of a partition: the gap round each one (mm), their thickness, handle holes. */
export interface DoorSettings {
  gap: number;
  thickness: number;
  handles: boolean;
  /** The side each door opens from (its hinges), from the left; missing: left, right, left… in turn. */
  hinges?: ("left" | "right")[];
  /** The cases sharing one door with the next one (the index of the first of each pair). */
  joined?: number[];
  /** The cases left without a door (a door shared by several: its first case). Kept empty rather than removed. */
  skipped?: number[];
  /**
   * A frame door (« shaker », routed in one piece): a frame `frameWidth` wide round a panel set back `frameDepth`; a
   * glass door: an aluminium frame `frameWidth` wide (`profile`) round tempered glass (`glass`); a fluted or slatted
   * door: grooves `pitch` apart, `frameDepth` deep, `frameWidth` from its top and bottom edges (features/door-decor.ts).
   */
  style?: "flat" | "frame" | "glass" | "fluted" | "slats";
  frameWidth?: number;
  frameDepth?: number;
  pitch?: number;
  /** Fluted or slatted: the grooves run across the door (absent: up and down). */
  grooves?: "horizontal";
  glass?: GlassKind;
  profile?: ProfileFinish;
}

/**
 * The back of a partition, applied behind it (over the rear edges of the top, the bottom and the sides): one panel for
 * the whole cabinet, or one per case (cut at the middle of a simple divider, like the doors), `thickness` mm.
 */
export interface BackSettings {
  thickness: number;
  split: "whole" | "cases";
}

export type PartitionStep =
  | {
      kind: "partition";
      input: PartitionParams;
      origin: [number, number];
      /** Depth of the bodies made from the panels (mm), when extruded. */
      depth?: number;
      /** A door in front of every case (made by a « Portes » equipment of the partition: document/partition-doors.ts). */
      doors?: DoorSettings;
      /** A back behind the panels (made by a « Fond » equipment of the partition, like the doors). */
      back?: BackSettings;
    }
  | {
      kind: "shelves";
      /** The partition whose niche this divides. */
      of: string;
      /** Which niche: the case (from the left), then the niche of each earlier division (from the bottom). */
      niche: number[];
      input: ShelfParams;
      /** Depth of the bodies made from the shelves (mm), when extruded. */
      depth?: number;
    };

/**
 * A "Décalage" made in the sketch: listed in the timeline, where it can be
 * renamed, edited again or deleted. The curves it created are ordinary curves
 * of the sketch; this record only remembers how they were made.
 */
export interface OffsetRecord {
  id: string;
  name: string;
  /** Curves it created in this sketch. */
  curves: string[];
  /** Curves that were offset. */
  source: string[];
  /** Signed distance in mm, as on the arrow (the magnitude when `both`). */
  distance: number;
  /** One copy on each side, at the same distance. */
  both: boolean;
  join: "round" | "sharp";
  /** A « Répartition » or a division by shelves: how it was made, to make it again (the fields above are then empty). */
  step?: PartitionStep;
  /** The extrusions made with it (feature ids), one body per element. */
  bodies?: string[];
}

/** A text of a sketch: its baseline starts at (x, y), letters `height` mm high, turned by `angle` degrees. */
export interface SketchText {
  id: string;
  text: string;
  x: number;
  y: number;
  height: number;
  angle?: number;
}

/**
 * An image laid under the sketch to trace over (a photo of a piece of furniture, a hand drawing): a data URL, its
 * lower-left corner and its size in the sketch (mm), and how see-through it is (0…1). Never seen by the solver.
 */
export interface SketchUnderlay {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface SketchGeometry {
  points: SketchPoint[];
  curves: SketchCurve[];
  constraints: SketchConstraint[];
  offsets?: OffsetRecord[];
  /** Texts written in the sketch (not seen by the solver). */
  texts?: SketchText[];
  /** Reference image under the sketch. */
  underlay?: SketchUnderlay;
}

/** Ids of the points a curve is built on. */
export function curvePoints(curve: SketchCurve): string[] {
  switch (curve.kind) {
    case "line":
      return [curve.p1, curve.p2];
    case "circle":
      return [curve.center];
    case "arc":
      return [curve.center, curve.start, curve.end];
  }
}

/** Every entity id a constraint refers to. */
export function constraintRefs(c: SketchConstraint): string[] {
  switch (c.kind) {
    case "coincident":
    case "parallel":
    case "perpendicular":
    case "tangent":
    case "equal":
    case "concentric":
    case "distance":
    case "distanceX":
    case "distanceY":
    case "angle":
      return [c.a, c.b];
    case "symmetric":
      return [c.a, c.b, c.axis];
    case "horizontal":
    case "vertical":
    case "length":
      return [c.line];
    case "fix":
      return [c.point];
    case "pointOnCurve":
      return [c.point, c.curve];
    case "midpoint":
    case "pointLineDistance":
      return [c.point, c.line];
    case "radius":
    case "diameter":
      return [c.curve];
  }
}

export function emptySketchGeometry(): SketchGeometry {
  return { points: [], curves: [], constraints: [] };
}

/** Fully constrained rectangle centred on the origin (used by the reference part). */
export function centeredRectangle(width: number, height: number): SketchGeometry {
  const w = width / 2;
  const h = height / 2;
  return {
    points: [
      { id: "p1", x: -w, y: -h },
      { id: "p2", x: w, y: -h },
      { id: "p3", x: w, y: h },
      { id: "p4", x: -w, y: h },
    ],
    curves: [
      { id: "l1", kind: "line", p1: "p1", p2: "p2" },
      { id: "l2", kind: "line", p1: "p2", p2: "p3" },
      { id: "l3", kind: "line", p1: "p3", p2: "p4" },
      { id: "l4", kind: "line", p1: "p4", p2: "p1" },
    ],
    constraints: [
      { id: "c1", kind: "horizontal", line: "l1" },
      { id: "c2", kind: "horizontal", line: "l3" },
      { id: "c3", kind: "vertical", line: "l2" },
      { id: "c4", kind: "vertical", line: "l4" },
      { id: "c5", kind: "symmetric", a: "p1", b: "p3", axis: ORIGIN },
      { id: "d1", kind: "length", line: "l1", value: width, label: "Longueur" },
      { id: "d2", kind: "length", line: "l2", value: height, label: "Largeur" },
    ],
  };
}

/**
 * Fully constrained rectangle centred on (cx, cy): the centre is a point placed
 * by signed distances from the origin (or on the origin when cx = cy = 0).
 */
export function rectangleAt(cx: number, cy: number, width: number, height: number): SketchGeometry {
  const geometry = centeredRectangle(width, height);
  if (cx === 0 && cy === 0) return geometry;
  for (const p of geometry.points) {
    p.x += cx;
    p.y += cy;
  }
  geometry.points.push({ id: "pc", x: cx, y: cy });
  geometry.constraints = geometry.constraints.map((c) => (c.kind === "symmetric" ? { ...c, axis: "pc" } : c));
  geometry.constraints.push(
    { id: "dcx", kind: "distanceX", a: ORIGIN, b: "pc", value: cx, label: "Position X" },
    { id: "dcy", kind: "distanceY", a: ORIGIN, b: "pc", value: cy, label: "Position Y" },
  );
  return geometry;
}
