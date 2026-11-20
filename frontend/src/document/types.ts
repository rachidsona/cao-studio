/**
 * Native CAO Studio document model (format "cao-studio"; schema v2).
 *
 * The document is the single source of truth: it stores the parametric
 * history (sketches, features, parameters), never meshes. Geometry is always
 * regenerated from it by the kernel. All lengths are stored in millimetres;
 * `units` is only the display preference of the project.
 */

import type { DrawingSheet } from "../drawing/model";
import type { CatalogEntry } from "./kitchen-catalog";
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

/** A sloped ceiling: `height` at `at` along X or Y, rising by `rise` per mm, up to `cap`. */
export interface SlopedCeiling {
  axis: "x" | "y";
  at: number;
  rise: number;
  height: number;
  cap: number;
  /** Only the slab this thick under it: a sloped top board. */
  slab?: number;
}

/** A square corner of a dressing plan: at the left or right of wall A, or at the far end of a nearly closed U. */
export type CornerJoint = "left" | "right" | "far";

/** The plan of a dressing, seen from above: its model, its sizes (mm), and what was made on each zone. */
export interface DressingPlan {
  model: "I" | "L-left" | "L-right" | "U" | "L-left-cut" | "L-right-cut" | "U-cut" | "facing" | "U-cut-left" | "U-cut-right" | "G-left" | "G-right" | "T" | "back" | "depths" | "L-left-round" | "L-right-round" | "U-round" | "L-left-ell" | "L-right-ell" | "U-ell";
  lengthA: number;
  lengthB: number;
  lengthC: number;
  /** The run across, face to face. */
  lengthD: number;
  /** The run nearly closing a U, or the second part of a wall of two depths. */
  lengthE: number;
  /** The way between two runs, or in front of the island. */
  aisle: number;
  depth: number;
  /** The second part of a wall of two depths. */
  depthB: number;
  /** A cut corner: how far it goes along wall A and along the other wall. */
  cornerA: number;
  cornerB: number;
  /** An island, facing the same way as wall A. */
  island?: boolean;
  islandLength: number;
  islandDepth: number;
  /** A sloped ceiling, low at the left of wall A, at its right, or against it; `height` is its high side. */
  roof?: "left" | "right" | "wall";
  roofLow: number;
  thickness: number;
  height: number;
  plinth: number;
  /** The surveyed room it follows: its wall that is wall A, and how the plan turns and moves onto it. */
  room?: { id: string; wall: number };
  place?: { quarter: 0 | 1 | 2 | 3; origin: [number, number] };
  /** Keeps clear of the doors and windows of its room, and under its low ceilings. */
  avoid?: boolean;
  /** What of each wall it may take: from and to along it (B and C: from the corner with A). */
  spans?: Partial<Record<"A" | "B" | "C", [number, number]>>;
  /** A lower height on a wall, under a drop or a slope of the room. */
  low?: Partial<Record<"A" | "B" | "C", number>>;
  /** The walls drawn behind it, when no surveyed room gives them. */
  walls?: boolean;
  /** By zone: how many sliding doors in front of it. */
  sliding?: Record<string, number>;
  /** Square corners where the other wall runs through: B or C past wall A, D past B or C at the far end. */
  through?: Partial<Record<CornerJoint, boolean>>;
  /** A door on each cut corner. */
  cornerDoor?: boolean;
  /** By zone: the sketch of its Répartition. */
  made?: Record<string, string>;
  /** By zone: the features of what closes it around its Répartition (a corner's far side and door, a filler). */
  boards?: Record<string, string[]>;
  /** By zone filled to size: the width of each case, and which one takes what is left, closed by a filler or not. */
  fills?: Record<string, { cases: number[]; rest: number; filler: boolean }>;
}

/** A unit or an appliance of a kitchen run, in its row from left to right: a model at a width; one's own units carried whole. */
export interface KitchenRunItem {
  id: string;
  /** A model of the catalogue (its entry's id without the width) or an appliance ("app-sink"…). */
  model: string;
  width: number;
  own?: CatalogEntry;
  /** Sizes set for this unit (mm), over those of its model and the plan: a wall or tall unit's height, any depth. */
  height?: number;
  depth?: number;
  /** One door: the side of its hinges, chosen (missing: left; « top »: a lift-up door, « bottom »: a flap). */
  side?: FrontsFeature["side"];
  /** Its fronts without handles, on gorge profiles. */
  grip?: FrontsFeature["grip"];
  /** Its fronts without handles (the shape pipette gave it a door with none). */
  handles?: false;
  /** The style of its fronts, chosen in the Façades tool (missing: plain). */
  facade?: FrontStyle;
  /**
   * Its fronts and its inside chosen for this unit, over its model's (« Façades et intérieur » of the run's editor):
   * no fronts, one door, two, or drawers and how many; a drawer over the doors (its front's height, 0: none), English
   * drawers behind them; its shelves, its upright boards.
   */
  layout?: FrontsFeature["layout"] | "none";
  drawers?: number;
  topDrawer?: number;
  innerDrawers?: number;
  shelves?: number;
  dividers?: number;
  /** Room kept for a caisson furnished by hand (its sketch, document/caisson-follow.ts): it goes where this room goes. */
  furnished?: string;
  /** The model of the unit that stood there before its caisson was furnished by hand: put back by « Remettre le meuble d'origine ». */
  from?: string;
}

/** The plan of a kitchen, seen from above (document/kitchen-plan-shapes.ts): its model, its sizes (mm), and each run's units. */
export interface KitchenFloorPlan {
  model: "I" | "L-left" | "L-right" | "U" | "G-left" | "G-right" | "facing";
  lengthA: number;
  lengthB: number;
  lengthC: number;
  /** The run across (parallel) or the peninsula. */
  lengthD: number;
  /** Between two runs face to face. */
  aisle: number;
  island?: boolean;
  islandLength: number;
  islandDepth: number;
  /** In front of the island, from the front of wall A's run. */
  passage: number;
  height: number;
  /** Base units (worktop included), wall units, and the top of the worktop. */
  depth: number;
  wallDepth: number;
  worktopHeight: number;
  /** Square corners where the other run passes: B or C (or the peninsula) past wall A. */
  through?: Partial<Record<"left" | "right", boolean>>;
  /** A dead corner closed by two fillers, or a corner unit on the run that passes: of every corner, unless set below. */
  corner?: "dead" | "unit";
  /** By corner (document/kitchen-corners.ts): dead, a blind corner unit with a shelf or LeMans trays, an L unit 90 × 90. */
  corners?: Partial<Record<"left" | "right", "dead" | "unit" | "lemans" | "magic" | "l" | "carousel" | "diagonal">>;
  /** By corner, up in the wall row: nothing, a wall corner unit with a door, or an L (document/kitchen-corners.ts). */
  wallCorners?: Partial<Record<"left" | "right", "none" | "unit" | "l">>;
  /** By corner, its sizes as set (mm): the base corner unit's door or its L's side, the wall one's door or side. */
  cornerSizes?: Partial<Record<"left" | "right", { door?: number; arm?: number; wallDoor?: number; wallArm?: number; shelves?: number; wallShelves?: number }>>;
  room?: { id: string; wall: number };
  place?: { quarter: 0 | 1 | 2 | 3; origin: [number, number] };
  /** Walls B and C out of square with wall A, from the surveyed room: the corner's angle less 90° (°). */
  skew?: Partial<Record<"B" | "C", number>>;
  frontMaterial?: string;
  worktopMaterial?: string;
  /** The look of the worktop and splashback (appearance/library.ts: a marble, a Dekton…), over its material's own. */
  worktopLook?: string;
  /** As the Implantation's (features/kitchen-layout.ts): the plinth's height and the worktop's thickness (mm), built. */
  plinth?: number;
  worktopThickness?: number;
  /** What « Proposer une cuisine » puts: the base units' fronts, wall units, appliances, a fridge column, the oven in a column. */
  fronts?: "mixed" | "drawers" | "doors";
  wallUnits?: boolean;
  appliances?: boolean;
  fridge?: boolean;
  ovenColumn?: boolean;
  /** A splashback over the worktop and kick boards under the fronts, built. */
  splashback?: boolean;
  kick?: boolean;
  /** The runs whose worktop was taken away (on the run's strip): no worktop there, nor its cut-outs. */
  noWorktop?: Record<string, boolean>;
  /** The worktop goes down to the floor at the free ends of the runs (in its material, over the units' sides). */
  worktopEnds?: boolean;
  /** How the worktop meets that return: running over it (absent), the return up its end, or both cut at 45°. */
  worktopJoint?: "top" | "side" | "miter";
  /** Finishing sides in the fronts' material at the free ends of the runs: the last column's and the last wall unit's. */
  endPanels?: boolean;
  /** A casquette on top of the wall row (document/kitchen-cap.ts): a plain panel or a caisson; its thickness, a caisson's height, how far it comes out (mm). */
  cap?: "flat" | "box";
  capThickness?: number;
  capHeight?: number;
  capOverhang?: number;
  /** The walls it draws behind its runs (no surveyed room) left out: « Murs de la pièce » unticked (document/kitchen-walls.ts). */
  noWalls?: boolean;
  /** By run: its plinth taken away, and how far it is set back from the fronts (mm). The look of the plinths (appearance/library.ts), over the fronts' material's own. */
  noKick?: Record<string, boolean>;
  kickSetback?: Record<string, number>;
  kickLook?: string;
  /** The splashback only where the hood is, from the worktop up to it (else along the whole worktop, up to it under the hood). */
  splashbackHoodOnly?: boolean;
  /** By run: its units and appliances, and where what is left goes. */
  runs?: Record<string, KitchenRunItem[]>;
  rest?: Record<string, "end" | "start" | "both" | "walls">;
  /** By run (and "walls"): the features made from it. */
  made?: Record<string, string[]>;
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
  /** The plan of a dressing this sketch draws on the floor (document/plan-layout.ts). */
  dressingPlan?: DressingPlan;
  /** The plan of a kitchen this sketch draws on the floor (document/kitchen-floor.ts). */
  kitchenPlan?: KitchenFloorPlan;
  /** What is extruded from this sketch stands over this outline on the floor (ExtrudeFeature.clip). */
  clip?: [number, number][];
  /** What is extruded from this sketch stops under this ceiling, and what equips its niches too. */
  ceiling?: SlopedCeiling;
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
   * « Tirer une face » from an edge: only the strip of the face along the edge is pulled — between the planes square
   * to the edge through its two ends (as when a line drawn on the face splits it, in SketchUp).
   */
  strip?: { from: Vec3; to: Vec3 };
  /**
   * Areas of the sketch to extrude, each given by a point inside it (sketch plane, mm).
   * Absent: every material area by the even–odd rule.
   */
  regions?: [number, number][];
  /** For each area of `regions`, what its outline is made of (sketcher/loops.ts loopKey): it follows its points. */
  regionKeys?: string[];
  /** Only what stands over this outline on the floor (world X, Y): the boards of a corner cut at an angle. */
  clip?: [number, number][];
  /** Only what is under this ceiling: the boards of a dressing under a slope. */
  ceiling?: SlopedCeiling;
  /** Extrusion length along the sketch normal (mm, non-zero). */
  distance: number;
  /**
   * A door made as a plain board (a corner unit's): toward its hinge edge and the way it faces (world, unit vectors).
   * « Ouvrir / fermer les portes » and a click turn it about the vertical through its hinge edge, at its front.
   */
  door?: { hinge: Vec3; out: Vec3 };
  /**
   * Start of the extrusion (as Fusion's "Start: Offset"): this far from the sketch plane along its normal (mm,
   * negative: the other side). Absent or 0: from the sketch plane. Sketch profiles only.
   */
  startOffset?: number;
  /**
   * « Prolonger élément » kept: the faces go up to the plane of this face of another body, found again at each
   * regeneration (they follow it). `distance` is then only what it was when made; a slanted face is reached exactly
   * (the end of the piece takes its slope), and the operation follows the way: join out, cut in. Faces only.
   */
  until?: { body: string; face: FaceRef };
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
  | { kind: "face"; body: string; face: FaceRef }
  /** Plane through a straight line traced on a face, across that face (« Magie extrusion », Couper le corps): a point and the normal. */
  | { kind: "line"; origin: Vec3; normal: Vec3 };

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
  /** Upright boards between the bottom and the top, evenly spaced (missing: none); the shelves are cut bay by bay. */
  dividers?: number;
  /** Sides run full height, or top and bottom run full width. */
  construction: "sides-through" | "top-bottom-through";
  /** What closes its top: a full board (missing), or two rails, in front and at the back, under a sink. */
  top?: "panel" | "rails";
  /**
   * Turn about the vertical through the origin (degrees, counterclockwise seen from above): 0 faces −Y, 90 faces +X,
   * 180 faces +Y, 270 faces −X. Its fronts turn with it.
   */
  rotation?: 0 | 90 | 180 | 270;
  /** Construction standard it follows (document/standards.ts): missing, the project's; « none », set by hand. */
  standard?: string;
  /** The notches its sides take for the gorge profiles of its fronts: copied in for the kernel only (stampGorges). */
  notches?: CabinetNotch[];
  /** Its shelves this far back from its front, behind inset fronts: copied in for the kernel only (features/inset-setback.ts). */
  shelfSetback?: number;
  /** The holes of its joints, drilled by its standard: copied in for the kernel only (features/cabinet-joints.ts). */
  joints?: { part: number; ops: MachiningOp[] }[];
}

/** A notch in the front edge of a cabinet's sides: from `z0` to `z1` above its origin, `depth` back from its front. */
export interface CabinetNotch {
  z0: number;
  z1: number;
  depth: number;
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
  /** Any direction of the axis (a face laid on a slanted face, in Aligner): replaces `axis`, the nearest main one. */
  dir?: Vec3;
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
  cutouts?: { appliance: string; along: number; front: number | null; size?: [number, number]; diameter?: number; radius?: number; name?: string; auto?: boolean }[];
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
  /**
   * Extrude Along Path (JHS PowerBar): the profile, drawn anywhere, is set at the start of the path, square to it — its
   * point `anchor` on the path, its y up, turned `spin` degrees, mirrored when `flip`.
   */
  place?: { anchor: "origin" | "center" | "bottom-left" | "bottom-right"; spin: number; flip: boolean };
  /**
   * Extrude Along Path without a drawn profile (as in JHS PowerBar): a rectangle `width` × `height` standing on the
   * path, centred on it or along its left or right side (seen walking from the start), the path walked from its end
   * when `fromEnd`. `profile` is then not used.
   */
  section?: { width: number; height: number; align: "center" | "left" | "right"; fromEnd?: boolean };
}

/**
 * Shell (as in Fusion): the body hollowed to walls of `thickness` mm, the chosen faces left open. « Vider un corps »
 * makes the same and says what its sides are (`sides`): joined, one hollow body; or separate, each side a body of its
 * own ("<id>#n") — the flat ones boards, mitred or butted (`joint`, as Panneaux sur faces), a curved one its wall.
 */
export interface ShellFeature extends FeatureBase {
  type: "shell";
  target: string;
  /** Faces removed (the openings); none: a closed hollow body. */
  faces: FaceRef[];
  thickness: number;
  /** Missing: joined (a Coque). */
  sides?: "joined" | "separate";
  /** Separate flat sides meeting: mitred (missing) or butted. */
  joint?: "miter" | "butt";
  /**
   * « Séparer les côtés » butted: which pass at the corners — the sides (upright, as a Répartition's), the top and
   * the bottom, or (missing) the longest ones.
   */
  pass?: "sides" | "boards";
  /**
   * « Séparer les côtés » of a solid body: the way it is emptied through — the normal of a face clicked, opened with
   * the one facing it. Missing: its top and bottom (else its two largest faces facing each other).
   */
  open?: Vec3;
  /**
   * « Séparer les côtés »: a frame — the body, already hollow, cut into its sides; solid, first emptied `thickness`
   * thick, open at both ends of its axis (features/ring-sides.ts). With `faces` empty and no `back`.
   */
  frame?: boolean;
  /**
   * A back closing an open face (`face`, one of `faces`), `thickness` mm: « inset », between the sides, flush with
   * the body's outside; « applied », the whole face, the sides stopping before it. A body of its own, first ("<id>#0").
   */
  back?: { face: FaceRef; thickness: number; mount: "inset" | "applied" };
}

/**
 * Panneaux sur faces: the flat faces chosen on a body become boards of `thickness`, taken inside it; mitred at any
 * angle, or butted (the first face runs through). Each board is a body ("<id>#n"); the body itself is used up.
 */
export interface PanelingFeature extends FeatureBase {
  type: "paneling";
  target: string;
  faces: FaceRef[];
  thickness: number;
  joint: "miter" | "butt";
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
  /** "ffd": free-form deformation of any body by a 3 × 3 × 3 lattice (as JHS PowerBar's FFD), see features/ffd.ts. */
  /** "face-scale": a flat face made bigger or smaller about its centre, its sides following (features/face-scale.ts). */
  kind: "bend" | "taper" | "twist" | "ffd" | "points" | "face-scale";
  amount: number;
  /**
   * "points" (« Déplacer ce trait », as moving an edge in SketchUp): the corners of the body at `from` go to `to`, and
   * its faces stretch to follow them (features/modifiers.ts).
   */
  moves?: { from: Vec3; to: Vec3 }[];
  /** FFD: the offsets of the 27 control points (x, y, z each, mm), point (i, j, k) at 3 × (i + 3j + 9k). */
  lattice?: number[];
  /** FFD: the box the lattice was set on (to show it again when editing); the build uses the body's own box. */
  frame?: [Vec3, Vec3];
  /** "face-scale": the face and its scale. */
  face?: FaceScale;
  /** "bend" onto a round body (« Cintrer contre ») : its cylindrical face the board wraps on, instead of `amount`. */
  onto?: { body: string; face: FaceRef };
}

/** A flat face and how it is scaled: its centre, two unit directions in it, its size along them (mm), a scale for each. */
export interface FaceScale {
  center: Vec3;
  u: Vec3;
  v: Vec3;
  size: [number, number];
  scale: [number, number];
}

/**
 * Fronts of a cabinet: one door, two doors or n drawers (with their boxes), overlaid on the carcass or inset in its
 * opening, a `gap` mm apart; hinge cups and handle holes machined when asked. Each part is a body ("<id>#n").
 */
export interface FrontsFeature extends FeatureBase {
  type: "fronts";
  cabinet: string;
  layout: "door" | "doors" | "drawers";
  /**
   * One door: the side of its hinges, as one faces it (missing: left). « top »: a lift-up door, hinged along its top
   * edge and held by a pair of stays; « bottom »: a drop-down flap, hinged along its bottom edge.
   */
  side?: "left" | "right" | "top" | "bottom";
  /**
   * « gorge »: no handles. Each front leaves a finger space above its top edge, in front of a recessed aluminium
   * profile fitted between the sides (features/fronts-parts.ts).
   */
  grip?: "gorge";
  drawers: number;
  mount: "overlay" | "inset";
  gap: number;
  /** Door or doors under a drawer: the height of its front, at the top of the cabinet (mm). */
  topDrawer?: number;
  /** Door or doors with drawers behind them, without fronts (« à l'anglaise »): how many. */
  innerDrawers?: number;
  thickness: number;
  hinges: boolean;
  handles: boolean;
  /**
   * Doors: plain boards, framed (a frame `frameWidth` wide round a panel set back `frameDepth`, routed in one piece),
   * fluted or slatted (grooves `pitch` apart, `frameDepth` deep, `frameWidth` from the top and bottom edges:
   * features/door-decor.ts), or glazed (an aluminium frame `frameWidth` wide round tempered glass, features/glass-door.ts).
   */
  style?: "flat" | "frame" | "glass" | "fluted" | "slats";
  frameWidth?: number;
  frameDepth?: number;
  pitch?: number;
  /** Fluted or slatted: the grooves run across the door (absent: up and down). */
  grooves?: "horizontal";
  glass?: GlassKind;
  profile?: ProfileFinish;
  /** Sizes of the chosen hardware, copied in for the kernel only (document/hardware-catalog.ts). */
  hw?: HardwareSizes;
  /** By part, the hinges of a door heavier than its height asks for: copied in for the kernel only (document/hardware.ts stampHinges). */
  hingeCounts?: Record<number, number>;
}

/** How the fronts of a cabinet look: framed, fluted, slatted or glazed, with their sizes (features/door-decor.ts). */
export type FrontStyle = Pick<FrontsFeature, "style" | "frameWidth" | "frameDepth" | "pitch" | "grooves" | "glass" | "profile">;

/** The glass of a glazed door, and the finish of its aluminium frame. */
export type GlassKind = "clear" | "extra-clear" | "frosted" | "smoked" | "bronze" | "black";
/** The frame of a glazed door: aluminium (brushed, black), or wood — routed in the fronts' own board, round it or in a U (open at its top). */
export type ProfileFinish = "brushed" | "black" | "wood" | "wood-u";

/** Drilling sizes of the hardware chosen for the project: handle holes and hinge cups (mm). */
export interface HardwareSizes {
  handleSpacing: number;
  handleHole: number;
  cupDiameter: number;
  cupDepth: number;
  cupEdge: number;
}

/**
 * Equipment of a niche of a « Répartition »: a hanging rail (rod and its two end supports), drawers inset in the
 * opening (fronts and their boxes on slides), or a bought accessory (features/accessory-parts.ts). It follows its niche: the sketch holding the partition, the partition
 * step, and the niche's path (as the Étagères steps name it). Each part is a body ("<id>#n").
 */
export interface NicheFeature extends FeatureBase {
  type: "niche";
  sketch: string;
  partition: string;
  niche: number[];
  /**
   * « doors »: a door in front of every case of the partition; « back »: its back panel (their `niche` is empty);
   * « door »: one door over the niche and those of `span` (neighbours making a rectangle with it).
   */
  fill: "rod" | "drawers" | "doors" | "back" | "door" | "accessory";
  /** Accessory: its model in the catalogue, and the height of its bottom above the bottom of the niche (mm). */
  accessory?: { model: string; lift: number };
  /** Door: the other niches it covers. */
  span?: number[][];
  /** Rod: its diameter, and the distance from the top of the niche to its axis (mm). */
  diameter: number;
  drop: number;
  /**
   * Drawers: how many (they share the niche's height), the gap above the top front (`gap`), under the bottom one,
   * between two fronts and on their sides (`gap` when missing: older drawers), their thickness, handle holes.
   */
  drawers: number;
  gap: number;
  bottomGap?: number;
  betweenGap?: number;
  sideGap?: number;
  /**
   * Doors: the side of the hinges of each one, from the left (missing: in turn, left first). A door over niches may
   * also be hinged along its top (« top »: a lift-up door, on stays) or its bottom (« bottom »: a flap).
   */
  hinges?: ("left" | "right" | "top" | "bottom")[];
  /** Doors: the cases sharing one door with the next one. */
  joined?: number[];
  /** Doors: the cases left without one. */
  skipped?: number[];
  /**
   * Doors: flat, a frame round a panel set back (routed in one piece), or glazed (an aluminium frame round tempered
   * glass, features/glass-door.ts); the frame's width and the panel's set-back (mm), the glass and the frame's finish.
   */
  style?: "flat" | "frame" | "glass" | "fluted" | "slats";
  frameWidth?: number;
  frameDepth?: number;
  /** Fluted or slatted doors: the spacing of their grooves (features/door-decor.ts). */
  pitch?: number;
  /** Fluted or slatted: the grooves run across the door (absent: up and down). */
  grooves?: "horizontal";
  glass?: GlassKind;
  profile?: ProfileFinish;
  /** Back: one panel for the whole cabinet, or one per case. */
  split?: "whole" | "cases";
  /**
   * Door over niches and drawers: « overlay », in front of the panels (out to the middle of those around, as a case's
   * door), or « inset », in the niche, its face flush with the panels'. Missing: a door overlaid, drawers inset.
   */
  mount?: "overlay" | "inset";
  /**
   * Drawers « à l'anglaise »: behind a door, their fronts set back in the niche (features/niche-parts.ts INNER_*),
  /**
   * A door overlaid, at an edge on a shelf or a cloison inside the cabinet: half of it covered (missing, as a case's
   * door), all of it (its edge level with the panel's other face), or none (level with the face it rests on).
   */
  cover?: "whole" | "none";
   * their slides on spacers past the hinge plates, no handle (a notch).
   */
  inner?: boolean;
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
   * `outline`: a board cut to follow a wall or the ceiling as surveyed (features/wall-survey.ts) — its outline in the
   * plane of the front, as [across, up] along `axis` and Z (`plane` "top": in the plane of the floor, as [across,
   * depth], pushed up); `from` and `to` are then the box around it.
   */
  parts: { name: string; from: Vec3; to: Vec3; radius?: number; hardware?: boolean; item?: string; per?: "m"; outline?: { axis: 0 | 1; points: [number, number][]; plane?: "top" } }[];
  /** What keeps the furniture from going in, by the site survey (a wall that comes too far): for the check before making. */
  issues?: string[];
  /** What the tool was given, to reopen it: the bodies of the furniture and its settings. */
  source?: string[];
  settings?: FinishOptions;
  /** Made by « Snack et comptoir » (features/snack-parts.ts): reopened in that tool, with these settings. */
  snack?: import("../features/snack-parts").SnackSettings;
  /** Made by « Plinthe technique » (features/plinth-tech.ts): grilles and plinth drawers, made again by that tool. */
  plinthTech?: import("../features/plinth-tech").PlinthTechSettings;
}

/** The room as surveyed (features/room-plan.ts): walls, their openings and what is in the way. Its bodies are "room". */
export interface RoomFeature extends FeatureBase, RoomInput {
  type: "room";
}

/**
 * An appliance of the library (features/appliance-library.ts): an oven, a hob, a hood, a fridge, a dishwasher, a
 * microwave, a sink or a tap, drawn piece by piece (body "<id>#n") with its own looks. Placed as a cabinet is: its
 * front-left-bottom corner, turned about the vertical through it (0: it faces −Y). Bought: out of the cut list.
 */
export interface ApplianceFeature extends FeatureBase {
  type: "appliance";
  /** Its model in the library. */
  model: string;
  origin: Vec3;
  rotation?: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  depth: number;
  /** Its finish: stainless steel, black, white (a tap: chrome, black, brass). */
  finish: string;
}

export type Feature =
  | ApplianceFeature
  | RoomFeature
  | TrimFeature
  | NicheFeature
  | FrontsFeature
  | ModifierFeature
  | ShellFeature
  | PanelingFeature
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

/** A version of the project kept as it was, with its price then. */
export interface Variant {
  id: string;
  name: string;
  /** The total of the quote when it was kept (null: no priced piece). */
  total: number | null;
  /** How many pieces it had. */
  parts: number;
  /** A small picture of the view (JPEG data URL). */
  image?: string;
  doc: Omit<CadDocument, "variants">;
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
  /** Whole versions of the project, kept to compare them with a client: document/variants.ts. */
  variants?: Variant[];
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
  /** Cabinets and Répartitions kept against the face of another element by « Prolonger élément » (app/extend-follow.ts). */
  extendLinks?: ExtendLink[];
  /** The furniture placed by the « Assistant meuble », to make it again at other sizes (document/furniture-build.ts). */
  furniture?: FurnitureRecord[];
}

/**
 * A piece of furniture of the « Assistant meuble »: what was asked (document/furniture-models.ts), its material, where
 * it stands — the back left corner of its foot, and the way its width runs (a unit vector in the floor plane; it faces
 * that way turned a quarter clockwise) — and the features it made.
 */
export interface FurnitureRecord {
  name: string;
  ask: { kind: string; width: number; height: number; depth: number; thickness: number; option: string };
  material: string;
  corner: Vec3;
  along: [number, number];
  features: string[];
}

/**
 * A face of a cabinet or a Répartition (on one of its bodies, as first made) kept on a face of another body: when the
 * other changes, the element is extended again up to it — to its plane, or until it touches it when slanted.
 */
export interface ExtendLink {
  id: string;
  from: { body: string; face: FaceRef };
  to: { body: string; face: FaceRef };
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
  /** A run of fronts whose grain goes on from one to the next: which run, and its place along it. */
  grainRun?: { id: string; at: number };
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
      if (feature.faces) return [...(feature.target ? [feature.target] : []), ...(feature.until ? [feature.until.body] : [])];
      return feature.target && feature.operation !== "new" ? [feature.sketch ?? "", feature.target] : [feature.sketch ?? ""];
    case "revolve":
      return feature.target && feature.operation !== "new" ? [feature.sketch, feature.target] : [feature.sketch];
    case "sweep":
      return [...(feature.section ? [] : [feature.profile]), feature.path, ...(feature.target && feature.operation !== "new" ? [feature.target] : [])];
    case "loft":
      return feature.target && feature.operation !== "new" ? [...feature.profiles, feature.target] : [...feature.profiles];
    case "shell":
    case "paneling":
      return [feature.target];
    case "modifier":
      // Bent onto a round body: that body too.
      return feature.onto ? [feature.target, feature.onto.body] : [feature.target];
    case "panels":
      return [feature.sketch];
    case "fronts":
      return [feature.cabinet];
    case "niche":
      return [feature.sketch];
    case "cabinet":
    case "trim":
    case "room":
    case "appliance":
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
    case "move":
      return [feature.target];
    case "split":
      // Cut by a face of another body: that body is read too (features/split.ts toolPlane), its change remakes the cut.
      return feature.tool.kind === "face" ? [feature.target, feature.tool.body] : [feature.target];
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
    case "paneling":
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
    case "appliance":
      return [];
  }
}

/** Features whose output is a solid body. */
export const SOLID_FEATURES: ReadonlySet<FeatureType> = new Set(["appliance", "paneling", "room", "trim", "extrude", "hole", "revolve", "fillet", "chamfer", "combine", "split", "move", "panels", "cabinet", "mirror", "align", "stretch", "array", "rotate", "machining", "sweep", "shell", "loft", "modifier", "fronts", "niche"]);

export function cloneDocument(doc: CadDocument): CadDocument {
  return structuredClone(doc);
}
