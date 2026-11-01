/**
 * Native CAO Studio document model (format "cao-studio", schema v2).
 *
 * The document is the single source of truth: it stores the parametric
 * history (sketches, features, parameters), never meshes. Geometry is always
 * regenerated from it by the kernel. All lengths are stored in millimetres;
 * `units` is only the display preference of the project.
 */

import type { DrawingSheet } from "../drawing/model";
import { centeredRectangle, type OffsetRecord, type SketchConstraint, type SketchCurve, type SketchPoint, type SketchText, type SketchUnderlay } from "./sketch";
import type { FinishOptions } from "../features/finish-parts";
import type { RoomInput } from "../features/room-plan";
import type { ConstructionStandard } from "./standards";
import type { SavedQuote } from "./quote";
export type { SketchText } from "./sketch";

export const DOCUMENT_FORMAT = "cao-studio";
export const SCHEMA_VERSION = 2;

export type DisplayUnit = "mm" | "cm" | "m" | "in";
export type PlaneName = "XY" | "XZ" | "YZ";

/** A plane anywhere: its origin, the direction of its x axis (in the plane) and its normal (mm, model frame). */
export interface PlaneFrame {
  origin: [number, number, number];
  xDir: [number, number, number];
  normal: [number, number, number];
}

interface FeatureBase {
  id: string;
  name: string;
  suppressed?: boolean;
  /** Formulas driving numbers of this feature, by field ("width", "translate.0"): see document/expressions.ts. */
  expressions?: Record<string, string>;
  /** Sketches only: not drawn in the 3D view (the eye icon of the tree). Presentation, not geometry. */
  hidden?: boolean;
}

export interface SketchFeature extends FeatureBase {
  type: "sketch";
  plane: PlaneName;
  /** Offset of the sketch plane along its normal (mm). */
  offset: number;
  /** Move of the sketch inside its plane: where its origin is, along the plane's u and v axes (mm). */
  shift?: [number, number];
  /**
   * Construction plane of any position (offset, angled, through 3 points, on a slanted face): when present it
   * replaces `plane` and `offset`, and `plane` only names the nearest main plane.
   */
  frame?: PlaneFrame;
  /** Texts written in the sketch (engraving, labels): extruded with its profile. */
  texts?: SketchText[];
  /** Reference image under the sketch, to trace over (never built). */
  underlay?: SketchUnderlay;
  points: SketchPoint[];
  curves: SketchCurve[];
  constraints: SketchConstraint[];
  /** Body whose face this sketch was drawn on (extrusions then default to a union with it). */
  support?: string;
  /** Offsets made in this sketch (shown in the timeline). */
  offsets?: OffsetRecord[];
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
  /**
   * Areas of the sketch to extrude, each given by a point inside it (sketch plane, mm).
   * Absent: every material area by the even–odd rule.
   */
  regions?: [number, number][];
  /** Extrusion length along the sketch normal (mm, non-zero). */
  distance: number;
  /**
   * Start of the extrusion (as Fusion's "Start: Offset"): this far from the sketch plane along its normal (mm,
   * negative: the other side). Absent or 0: from the sketch plane. Sketch profiles only.
   */
  startOffset?: number;
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
  /** Variable fillet: the radius at the end of each edge, `radius` being the one at its start (linear between). */
  radiusEnd?: number;
}

export interface ChamferFeature extends FeatureBase {
  type: "chamfer";
  target: string;
  edges: EdgeRef[];
  distance: number;
  /**
   * Chamfer with two distances: `distance` on the larger face next to each edge (the face of a board), this one on
   * the other (its edge); `swap` takes `distance` on the smaller face instead.
   */
  distance2?: number;
  swap?: boolean;
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

/**
 * Cutting tool of a split. The kernel splits by planes: a construction plane
 * (a principal plane moved along its normal) or the plane of a planar face.
 * The positive side is the side the plane's normal points to.
 */
export type SplitTool =
  | { kind: "plane"; plane: PlaneName; offset: number }
  /** Plane of a planar face of `body` (the face is found again after a regeneration). */
  | { kind: "face"; body: string; face: FaceRef };

/** Which parts a split keeps: both sides, or only one. */
export type SplitKeep = "both" | "positive" | "negative";

/**
 * Split of a body by a plane. Pieces that are separate solids (a U-shaped
 * body cut across its arms) are separate bodies, referred to as
 * "<feature id>#<n>" (numbered in a stable spatial order); a single remaining
 * solid is simply the same body, cut.
 */
export interface SplitFeature extends FeatureBase {
  type: "split";
  target: string;
  tool: SplitTool;
  keep: SplitKeep;
}

/**
 * Move of a body: the same solid, translated. The translation is stored in
 * the global frame (mm); a local frame in the tool only changes how it is
 * entered. The feature replaces its target body, like a hole or a fillet.
 */
export interface MoveFeature extends FeatureBase {
  type: "move";
  target: string;
  translate: Vec3;
}

/**
 * Boards made from a skeleton sketch (furniture design): every line of the
 * sketch becomes a board of the given thickness, extruded by the depth along
 * the sketch normal. Each board is a body ("<id>#<n>").
 */
export interface PanelsFeature extends FeatureBase {
  type: "panels";
  sketch: string;
  /** Board thickness (mm). */
  thickness: number;
  /** Extrusion along the sketch normal (mm, signed). */
  depth: number;
  /** Side of the outline lines the boards lie on (inner lines are centred). */
  align: "inside" | "center" | "outside";
  /** Boards kept whole at the corners; the others are cut against them. */
  through: "vertical" | "horizontal";
}

/**
 * Parametric cabinet (kitchen unit, wardrobe, cupboard): its parts (sides,
 * bottom, top, back, shelves) are separate bodies ("<id>#<n>") built from
 * the outer dimensions. Origin: front-left-bottom corner; X width, Y depth
 * (towards the back), Z height.
 */
export interface CabinetFeature extends FeatureBase {
  type: "cabinet";
  origin: Vec3;
  width: number;
  height: number;
  depth: number;
  /** Board thickness of the carcass (mm). */
  thickness: number;
  /** Back panel: none, screwed on the back (full size), or inset between the sides. */
  back: "none" | "applied" | "inset";
  backThickness: number;
  /** Number of shelves, evenly spaced. */
  shelves: number;
  /** Height of the plinth under the bottom (0: none). */
  plinth: number;
  /** Sides run full height, or top and bottom run full width. */
  construction: "sides-through" | "top-bottom-through";
  /**
   * Turn about the vertical through the origin (degrees, counterclockwise seen from above): 0 faces −Y, 90 faces +X,
   * 180 faces +Y, 270 faces −X. Its fronts turn with it.
   */
  rotation?: 0 | 90 | 180 | 270;
  /** Construction standard it follows (document/standards.ts): missing, the project's; « none », set by hand. */
  standard?: string;
}

/** Principal axis: 0 = X, 1 = Y, 2 = Z. */
export type Axis = 0 | 1 | 2;

/**
 * Mirror copies of bodies (as Curic Mirror) across the plane perpendicular to
 * `axis` at the coordinate `position` (mm). The originals stay; each copy is a
 * new body ("<id>#<n>").
 */
export interface MirrorFeature extends FeatureBase {
  type: "mirror";
  targets: string[];
  axis: Axis;
  position: number;
}

/**
 * How a body lines up with the reference along one axis: not at all, on its
 * low side, centre or high side, or placed against it after (+) or before (−).
 */
export type AlignMode = "none" | "min" | "center" | "max" | "after" | "before";

/**
 * Moves a body so that it lines up with a reference body (as Curic Align),
 * independently along X, Y and Z. Computed from the bodies themselves, so it
 * follows the reference when the history above changes.
 */
export interface AlignFeature extends FeatureBase {
  type: "align";
  target: string;
  reference: string;
  modes: [AlignMode, AlignMode, AlignMode];
  /**
   * Gap along each axis (mm): between the faces placed against each other (after, before), the face set back inside
   * the reference's (min, max), or the centre shifted towards + (center). An assembly of faces keeps it.
   */
  gaps?: Vec3;
}

/**
 * Stretch of a body across a plane (as Curic Stretch): what lies beyond the
 * plane perpendicular to `axis` at `position` moves by `distance` along the
 * axis, and the section at the plane fills the gap (a negative distance
 * removes a slab instead). A body entirely beyond the plane only moves.
 */
export interface StretchFeature extends FeatureBase {
  type: "stretch";
  target: string;
  axis: Axis;
  position: number;
  distance: number;
}

/**
 * Copies of bodies repeated along a vector (as Curic's arrays, or a copy made
 * while moving): copy k is the body moved by k × step, for k = 1..count. The
 * originals stay; each copy is a new body ("<id>#<n>", copies of the first
 * body first).
 */
export interface ArrayFeature extends FeatureBase {
  type: "array";
  targets: string[];
  step: Vec3;
  count: number;
  /** Circular array: copy k is turned by k × `angle` degrees around the axis (parallel to X, Y or Z) through `center`; `step` is then unused. */
  around?: { axis: Axis; center: Vec3; angle: number };
  /**
   * Rectangular array (as Fusion's): a second direction. The copies make a grid — every j × `second.step` (j = 0..
   * second.count) combined with every k × `step` (k = 0..count) — except the original at (0, 0).
   */
  second?: { step: Vec3; count: number };
}

/** Offsets of the copies of an array, one per copy: k × step, and with a second direction the whole grid. */
export function arrayOffsets(array: Pick<ArrayFeature, "step" | "count" | "second">): Vec3[] {
  const out: Vec3[] = [];
  for (let j = 0; j <= (array.second?.count ?? 0); j++) {
    for (let k = 0; k <= array.count; k++) {
      if (j === 0 && k === 0) continue;
      out.push([0, 1, 2].map((i) => (array.step[i] as number) * k + (array.second ? (array.second.step[i] as number) * j : 0)) as Vec3);
    }
  }
  return out;
}

/** Rotation of a body (as Curic Rotate) by `angle` degrees around the axis parallel to X, Y or Z through `center`. */
export interface RotateFeature extends FeatureBase {
  type: "rotate";
  target: string;
  axis: Axis;
  angle: number;
  center: Vec3;
}

/** One machining operation, in model coordinates (mm). */
export type MachiningOp =
  /** A blind hole: `at` on the surface, `dir` the unit direction into the material. */
  | { kind: "hole"; at: Vec3; dir: Vec3; diameter: number; depth: number }
  /** A box removed from the body (groove, half-lap, mortise) or added to it (tenon). */
  | { kind: "box"; from: Vec3; to: Vec3; mode: "cut" | "join" };

/**
 * Machining of a board (cabinet making): the 32 mm drilling rows, hinge cups,
 * back grooves and joints (dowels, confirmat screws, half-laps, mortise and
 * tenon) as exact cuts of the target body, which the result replaces.
 */
export interface MachiningFeature extends FeatureBase {
  type: "machining";
  target: string;
  /** What the machining is, for the name and the tool when edited. */
  kind: "drilling32" | "hinge" | "groove" | "dowel" | "confirmat" | "minifix" | "halflap" | "tenon" | "cutout" | "custom";
  ops: MachiningOp[];
  /** The cut-outs of a worktop (kind "cutout"), kept to reopen them in their tool. */
  cutouts?: { appliance: string; along: number; front: number | null }[];
  /** The side the worktop faces (kind "cutout"): its low (−1) or high (+1) side across its length. */
  frontSign?: -1 | 1;
  /**
   * Low corner of the target's box when the machining was made. The operations follow the board: they are moved by
   * how far that corner has moved since (a cabinet made wider carries its right side, and its holes, along).
   */
  anchor?: Vec3;
  /**
   * High corner of the box then: with it, each operation follows the nearer end of the board along each axis (the
   * holes at the right end of a bottom made longer follow that end).
   */
  anchorHigh?: Vec3;
}

/**
 * Follow Me: the closed profile of one sketch swept along the path (lines and arcs) of another: skirting boards,
 * mouldings, cornices. Joined to or cut from a body, or a new body.
 */
export interface SweepFeature extends FeatureBase {
  type: "sweep";
  profile: string;
  path: string;
  operation: BooleanOperation;
  target?: string;
  /** Keep the profile turning with the path's curvature (Frenet frame) instead of its plane. */
  frenet?: boolean;
}

/** Shell (as in Fusion): the body hollowed to walls of `thickness` mm, the chosen faces left open. */
export interface ShellFeature extends FeatureBase {
  type: "shell";
  target: string;
  /** Faces removed (the openings); none: a closed hollow body. */
  faces: FaceRef[];
  thickness: number;
}

/** Loft (lissage): a solid through the closed profiles of several sketches, in order (straight between them when `ruled`). */
export interface LoftFeature extends FeatureBase {
  type: "loft";
  profiles: string[];
  ruled?: boolean;
  operation: BooleanOperation;
  target?: string;
}

/**
 * Modifier of a board (as 3ds Max's): the board — a box — rebuilt bent along its length into an arc of `amount` mm
 * radius ("bend"), tapered to `amount` % at its far end ("taper"), or twisted by `amount` degrees ("twist").
 */
export interface ModifierFeature extends FeatureBase {
  type: "modifier";
  target: string;
  kind: "bend" | "taper" | "twist";
  amount: number;
}

/**
 * Fronts of a cabinet: one door, two doors or n drawers (with their boxes), overlaid on the carcass or inset in its
 * opening, a `gap` mm apart; hinge cups and handle holes machined when asked. Each part is a body ("<id>#n").
 */
export interface FrontsFeature extends FeatureBase {
  type: "fronts";
  cabinet: string;
  layout: "door" | "doors" | "drawers";
  drawers: number;
  mount: "overlay" | "inset";
  gap: number;
  thickness: number;
  hinges: boolean;
  handles: boolean;
  /** Sizes of the chosen hardware, copied in for the kernel only (document/hardware-catalog.ts). */
  hw?: HardwareSizes;
}

/** Drilling sizes of the hardware chosen for the project: handle holes and hinge cups (mm). */
export interface HardwareSizes {
  handleSpacing: number;
  handleHole: number;
  cupDiameter: number;
  cupDepth: number;
  cupEdge: number;
}

/**
 * Equipment of a niche of a « Répartition »: a hanging rail (rod and its two end supports) or drawers inset in the
 * opening (fronts and their boxes on slides). It follows its niche: the sketch holding the partition, the partition
 * step, and the niche's path (as the Étagères steps name it). Each part is a body ("<id>#n").
 */
export interface NicheFeature extends FeatureBase {
  type: "niche";
  sketch: string;
  partition: string;
  niche: number[];
  /** « doors »: a door in front of every case of the partition; « back »: its back panel (their `niche` is empty). */
  fill: "rod" | "drawers" | "doors" | "back";
  /** Rod: its diameter, and the distance from the top of the niche to its axis (mm). */
  diameter: number;
  drop: number;
  /**
   * Drawers: how many (they share the niche's height), the gap above and below each front (between two fronts too),
   * the gap on their sides (`gap` when missing: older drawers), their thickness, handle holes.
   */
  drawers: number;
  gap: number;
  sideGap?: number;
  /** Doors: the side of the hinges of each one, from the left (missing: in turn, left first). */
  hinges?: ("left" | "right")[];
  /** Doors: flat, or a frame round a panel set back (routed in one piece), its width and the panel's set-back (mm). */
  style?: "flat" | "frame";
  frameWidth?: number;
  frameDepth?: number;
  /** Back: one panel for the whole cabinet, or one per case. */
  split?: "whole" | "cases";
  thickness: number;
  handles: boolean;
  /** Sizes of the chosen hardware, copied in for the kernel only (document/hardware-catalog.ts). */
  hw?: HardwareSizes;
}

/**
 * Finishing boards of a piece of furniture (end panels, fillers to the walls, plinth, cornice), each a plain box in
 * the model's frame and a body ("<id>#n"), placed by the Finitions tool (features/finish-parts.ts).
 */
export interface TrimFeature extends FeatureBase {
  type: "trim";
  /**
   * A board (a box between two corners), or a foot (`radius`: a cylinder from `from` up to `to`, bought: hardware).
   * Bought parts are quoted as `item` (an adjustable foot when missing), by the piece or by the metre (`per`).
   */
  parts: { name: string; from: Vec3; to: Vec3; radius?: number; hardware?: boolean; item?: string; per?: "m" }[];
  /** What the tool was given, to reopen it: the bodies of the furniture and its settings. */
  source?: string[];
  settings?: FinishOptions;
}

/** The room as surveyed (features/room-plan.ts): walls, their openings and what is in the way. Its bodies are "room". */
export interface RoomFeature extends FeatureBase, RoomInput {
  type: "room";
}

export type Feature =
  | RoomFeature
  | TrimFeature
  | NicheFeature
  | FrontsFeature
  | ModifierFeature
  | ShellFeature
  | LoftFeature
  | SweepFeature
  | MachiningFeature
  | ArrayFeature
  | RotateFeature
  | MirrorFeature
  | AlignFeature
  | StretchFeature
  | CabinetFeature
  | PanelsFeature
  | MoveFeature
  | SplitFeature
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
  /** A formula in other parameters: it sets `value` (document/expressions.ts). */
  expression?: string;
}

export interface CadDocument {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  units: DisplayUnit;
  parameters: Record<string, Parameter>;
  features: Feature[];
  /** Names given to bodies, keyed by the id of the feature that created each body. */
  bodyNames?: Record<string, string>;
  /** Pieces of a split hidden in the 3D view ("sp1#2"); other bodies hide through their feature. */
  hiddenBodies?: string[];
  /**
   * Pieces of multi-body operations deleted on their own (the top of a cabinet, a piece of a split): left out of the
   * model with whatever was made of them, the operation and its other pieces staying.
   */
  removedBodies?: string[];
  /** Material, grain and edge bands of bodies, keyed like `bodyNames`. */
  bodyInfo?: Record<string, BodyInfo>;
  /** Saved views (scenes): where the camera was. */
  views?: SavedView[];
  /** Guide lines laid with the tape measure (SketchUp-style), to snap to. */
  guides?: Guide[];
  /** Layers (SketchUp's tags): bodies go on one by `bodyInfo.layer`; a hidden layer hides its bodies. */
  layers?: Layer[];
  /** Variants of the model: named sets of parameter values. */
  configurations?: Configuration[];
  /** Folders of the navigator (Fusion's): bodies put together by hand — a placard, a dressing… */
  folders?: Folder[];
  /** Appearances made from images imported by hand (« Mes motifs »): appearance/custom.ts. */
  appearances?: CustomAppearance[];
  /** Drawing sheets (« Mise en plan », as Fusion's Drawing): drawing/model.ts. */
  drawings?: DrawingSheet[];
  /** Hardware models chosen in the catalogue (ids of document/hardware-catalog.ts); missing: generic ones. */
  hardware?: { hinge?: string; slide?: string; handle?: string };
  /** Construction standard of the project (an id of `standards` or of document/standards.ts), and its own standards. */
  standard?: string;
  standards?: ConstructionStandard[];
  /** Versions of the quote kept in the project: the quote, then its amendments (document/quote.ts). */
  quotes?: SavedQuote[];
}

/** An image of one's own as an appearance: the image (a data URL, kept with the project) and the size of one tile. */
export interface CustomAppearance {
  id: string;
  name: string;
  image: string;
  /** Size of one tile of the image (mm): along the grain, across it. */
  tile: [number, number];
}

/** A folder of the navigator: its bodies by origin (the id of what created each, as in `bodyNames`). */
export interface Folder {
  id: string;
  name: string;
  bodies: string[];
}

/** A variant of the model: the values of its plain parameters. */
export interface Configuration {
  id: string;
  name: string;
  values: Record<string, number>;
}

/** A layer of bodies (carcass, fronts, hardware…). */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

/** A guide line between two points (mm). */
export interface Guide {
  from: Vec3;
  to: Vec3;
}

/** What a board is cut from (cabinet making). */
export interface BodyInfo {
  /** Id of a material of the catalogue (document/materials.ts). */
  material?: string;
  /** Grain along the board's length, its width, or none (it may then be turned on the sheet). */
  grain?: "length" | "width" | "none";
  /** Edge bands on the two long edges and the two short edges of the board's face. */
  edges?: { length1: boolean; length2: boolean; width1: boolean; width2: boolean };
  /** Edge band thickness (mm). */
  band?: number;
  /** Layer the body is on (id of `CadDocument.layers`). */
  layer?: string;
  /** Part of the room (walls), not of the furniture: left out of the cut list, the quote and the CNC file. */
  room?: boolean;
  /** A light (LED strip, spot) of the « Éclairage » tool: it lights the render (document/lighting.ts). */
  light?: { kind: "strip" | "spot"; color: "warm" | "neutral" | "cool"; up?: boolean };
  /** Appearance from the library (appearance/library.ts), over the material's own; the view and the render only. */
  appearance?: string;
  /** Colour chosen for a paintable appearance (sRGB hex "#rrggbb"). */
  color?: string;
  /** Faces with an appearance of their own, over the body's (appearance/face-looks.ts). */
  faces?: FaceLook[];
}

/** The appearance of one face of a body: the face known by its outward normal and its centre in the body's box (0…1). */
export interface FaceLook {
  normal: Vec3;
  rel: Vec3;
  appearance: string;
  color?: string;
}

export interface SavedView {
  name: string;
  position: Vec3;
  target: Vec3;
  up: Vec3;
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
    case "sweep":
      return feature.target && feature.operation !== "new" ? [feature.profile, feature.path, feature.target] : [feature.profile, feature.path];
    case "loft":
      return feature.target && feature.operation !== "new" ? [...feature.profiles, feature.target] : [...feature.profiles];
    case "shell":
    case "modifier":
      return [feature.target];
    case "panels":
      return [feature.sketch];
    case "fronts":
      return [feature.cabinet];
    case "niche":
      return [feature.sketch];
    case "cabinet":
    case "trim":
    case "room":
      return [];
    case "mirror":
    case "array":
      return [...feature.targets];
    case "rotate":
      return [feature.target];
    case "align":
      return [feature.target, feature.reference];
    case "stretch":
    case "machining":
      return [feature.target];
    case "hole":
    case "fillet":
    case "chamfer":
    case "split":
    case "move":
      return [feature.target];
    case "combine":
      return [feature.target, ...feature.tools];
  }
}

/** Separator between a feature id and the number of one of its bodies ("split1#2"). */
export const PART_SEPARATOR = "#";

/** Feature that produces a body id ("split1#2" → "split1"). */
export function featureOfBody(bodyId: string): string {
  return bodyId.split(PART_SEPARATOR)[0] as string;
}

/** Ids of bodies a feature consumes (they are replaced by its own result). */
export function consumedBodies(feature: Feature): string[] {
  switch (feature.type) {
    case "hole":
    case "fillet":
    case "chamfer":
    case "split":
    case "move":
    case "align":
    case "stretch":
    case "rotate":
    case "machining":
    case "shell":
    case "modifier":
      return [feature.target];
    case "extrude":
    case "revolve":
    case "sweep":
    case "loft":
      return feature.operation !== "new" && feature.target ? [feature.target] : [];
    case "combine":
      return feature.keepTools ? [feature.target] : [feature.target, ...feature.tools];
    case "sketch":
    case "panels":
    case "cabinet":
    case "fronts":
    case "niche":
    case "mirror":
    case "array":
    case "trim":
    case "room":
      return [];
  }
}

/** Features whose output is a solid body. */
export const SOLID_FEATURES: ReadonlySet<FeatureType> = new Set(["room", "trim", "extrude", "hole", "revolve", "fillet", "chamfer", "combine", "split", "move", "panels", "cabinet", "mirror", "align", "stretch", "array", "rotate", "machining", "sweep", "shell", "loft", "modifier", "fronts", "niche"]);

export function cloneDocument(doc: CadDocument): CadDocument {
  return structuredClone(doc);
}
