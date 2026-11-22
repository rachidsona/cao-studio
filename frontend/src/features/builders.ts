/**
 * Feature builders: turn one feature of the history plus its already-computed
 * inputs into exact B-rep geometry. Builders validate their parameters and
 * throw GeometryError with an explicit message instead of producing bad
 * geometry.
 */
import { buildPaneling } from "./paneling";
import { buildTrim } from "./trim";
import { buildRoom } from "./room";
import { buildAppliance } from "./appliance";
import { draw, makeCylinder, measureVolume, type Drawing, type Shape3D } from "replicad";
import { solveSketch, SketchError } from "../constraints/solver";
import type { ExtrudeFeature, Feature, HoleFeature, SketchFeature, Vec3 } from "../document/types";
import { frameOf } from "../sketcher/frame";
import { buildProfile, ProfileError, sketchLoops } from "../sketcher/profiles";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveFace } from "../geometry/references";
import { applyOperation, MIN_LENGTH, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, type OutputLookup } from "./common";
import type { FeatureOutput, ProfileOutput, SolidOutput, SolidsOutput } from "./outputs";
import { buildChamfer, buildCombine, buildFaceExtrude, buildFillet, buildRevolve } from "./solids";
import { buildMove } from "./move";
import { buildPanels } from "./panels";
import { buildCabinet } from "./cabinet";
import { buildAlign, buildArray, buildMirror, buildRotate, buildStretch } from "./curic";
import { buildSplit } from "./split";
import { buildMachining } from "./machining";
import { buildSweep } from "./sweep";
import { textDrawing } from "./text";
import { buildLoft, buildShell } from "./shell-loft";
import { buildModifier } from "./modifiers";
import { buildFronts } from "./fronts";
import { buildNiche } from "./niche";
import { underCeiling } from "./sloped-ceiling";
import { withinWalls } from "./within-walls";

export { MIN_LENGTH, type OutputLookup } from "./common";

/** Below this removed volume (mm³) a cut is considered to have missed the body. */
const MIN_REMOVED_VOLUME = 1e-6;

function buildSketch(feature: SketchFeature): ProfileOutput {
  let solved;
  try {
    solved = solveSketch(feature);
  } catch (error) {
    if (error instanceof SketchError) throw new GeometryError(error.message);
    throw error;
  }
  if (solved.state === "conflicting") {
    throw new GeometryError(`Esquisse surcontrainte : contraintes en conflit (${solved.conflicting.join(", ")}).`);
  }
  if (solved.state === "failed") throw new GeometryError("Les contraintes de l'esquisse ne peuvent pas toutes être respectées : retirez ou modifiez une contrainte ou une cote.");
  const base = {
    kind: "profile" as const,
    plane: feature.plane,
    offset: feature.offset,
    ...(feature.shift ? { shift: feature.shift } : {}),
    ...(feature.frame ? { frame: feature.frame } : {}),
    dof: solved.dof,
    redundant: solved.redundant,
    geometry: solved.geometry,
  };
  // The texts of the sketch are written with its profile (or alone when it has no closed loop).
  const letters = textDrawing(feature.texts);
  let loops = 0;
  try {
    loops = sketchLoops(solved.geometry).length;
  } catch (error) {
    if (letters && error instanceof ProfileError) return { ...base, drawing: letters, closed: true, openReason: null };
    if (error instanceof ProfileError) return { ...base, drawing: null, closed: false, openReason: error.message };
    throw error;
  }
  // The region itself, the first time it is asked for.
  let made: Drawing | null | undefined;
  const geometry = solved.geometry;
  return {
    ...base,
    closed: loops > 0 || !!letters,
    openReason: null,
    get drawing() {
      if (made === undefined) {
        const drawing = loops > 0 ? buildProfile(geometry) : null;
        made = drawing && letters ? drawing.fuse(letters) : (drawing ?? letters);
      }
      return made;
    },
  };
}

/**
 * The prism with the faces of one plane made one: a side of the profile drawn in two lines one after the other (a
 * point left on it) would give two faces side by side, and a line across the face. Only when there are such.
 */
function merged(prism: Shape3D): Shape3D {
  const flat = prism.faces.filter((f) => f.geomType === "PLANE").map((f) => {
    const c = f.center;
    const n = f.normalAt(c);
    return { n: [n.x, n.y, n.z], d: n.x * c.x + n.y * c.y + n.z * c.z };
  });
  const twins = flat.some((a, i) => flat.slice(i + 1).some((b) => a.n[0]! * b.n[0]! + a.n[1]! * b.n[1]! + a.n[2]! * b.n[2]! > 1 - 1e-9 && Math.abs(a.d - b.d) < 1e-6));
  if (!twins) return prism;
  try {
    const one = prism.simplify() as Shape3D;
    if (one.solids.length === prism.solids.length && Math.abs(measureVolume(one) - measureVolume(prism)) < 1e-6 * Math.max(1, measureVolume(prism))) {
      prism.delete();
      return one;
    }
    one.delete();
  } catch {
    // Kept as made.
  }
  return prism;
}

/** Above and below any piece of furniture (mm). */
const CLIP_REACH = 20000;

function buildExtrude(feature: ExtrudeFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  if (!feature.until && !(Math.abs(feature.distance) >= MIN_LENGTH)) throw new GeometryError("La distance d'extrusion ne peut pas être nulle.");
  if (feature.faces) return buildFaceExtrude(feature, lookup);
  if (!feature.sketch) throw new GeometryError(`${feature.name} : choisissez une esquisse ou des faces à extruder.`);
  const profile = requireProfile(lookup, feature.sketch);
  let drawing: Drawing;
  if (feature.regions) {
    try {
      drawing = buildProfile(profile.geometry, feature.regions, feature.regionKeys) as Drawing;
    } catch (error) {
      if (error instanceof ProfileError) throw new GeometryError(`${feature.name} : ${error.message}`);
      throw error;
    }
  } else drawing = profileDrawing(feature.name, profile).clone();
  const sketch = onProfilePlane(drawing, profile);
  let prism = merged(sketch.extrude(feature.distance) as Shape3D);
  if (feature.startOffset) {
    // Fusion's "Start: Offset": the solid starts this far from the sketch plane.
    const n = frameOf(profile).normal;
    prism = prism.translate([n[0] * feature.startOffset, n[1] * feature.startOffset, n[2] * feature.startOffset]) as Shape3D;
  }
  if (feature.clip) prism = clipped(prism, feature.clip);
  if (feature.ceiling) prism = underCeiling(prism, feature.ceiling, feature.name);
  if (feature.host) prism = withinWalls(prism, feature.host, frameOf(profile), lookup, feature.lean);
  return applyOperation(feature.name, prism, feature.operation, feature.target, lookup);
}

/** What of this solid stands over this outline on the floor (a corner cut at an angle); takes ownership of `solid`. */
function clipped(solid: Shape3D, outline: [number, number][]): Shape3D {
  const [first, ...rest] = outline as [[number, number], ...[number, number][]];
  const column = rest.reduce((pen, p) => pen.lineTo(p), draw(first)).close().sketchOnPlane("XY", -CLIP_REACH).extrude(2 * CLIP_REACH) as Shape3D;
  try {
    return solid.intersect(column);
  } finally {
    solid.delete();
    column.delete();
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Drilling tool for a hole placed on a face (start point + direction into the body). */
function faceHoleTool(feature: HoleFeature, target: Shape3D, origin: Vec3, direction: Vec3): Shape3D {
  let start = origin;
  let dir = unit(direction);
  if (feature.face) {
    const face = resolveFace(target, feature.face);
    if (face.geomType !== "PLANE") throw new GeometryError(`${feature.name} : le perçage doit être placé sur une face plane.`);
    const c = face.center;
    const center: Vec3 = [c.x, c.y, c.z];
    const n = face.normalAt(c);
    const normal = unit([n.x, n.y, n.z]);
    // Follow the face if it moved (e.g. thicker part): project the start point onto it, drill inward.
    start = sub(origin, normal.map((x) => x * dot(sub(origin, center), normal)) as Vec3);
    dir = [-normal[0], -normal[1], -normal[2]];
  }
  const box = target.boundingBox;
  const [min, max] = box.bounds;
  box.delete();
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const margin = 1;
  const length = feature.depth === "through" ? diagonal + 2 * margin : feature.depth + margin;
  const from: Vec3 = [start[0] - dir[0] * margin, start[1] - dir[1] * margin, start[2] - dir[2] * margin];
  return makeCylinder(feature.diameter / 2, length, from, dir);
}

function buildHole(feature: HoleFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.diameter, "Le diamètre du perçage");
  if (feature.depth !== "through") requirePositive(feature.depth, "La profondeur du perçage");
  const target = requireSolid(lookup, feature.target).shape;
  let tool: Shape3D;
  if (feature.origin && feature.direction) {
    tool = faceHoleTool(feature, target, feature.origin, feature.direction);
  } else {
    const box = target.boundingBox;
    const [[, , zMin], [, , zMax]] = box.bounds;
    box.delete();
    // The tool overshoots the faces it must pierce by 1 mm to avoid coplanar booleans.
    const margin = 1;
    const radius = feature.diameter / 2;
    tool =
      feature.depth === "through"
        ? makeCylinder(radius, zMax - zMin + 2 * margin, [feature.x, feature.y, zMin - margin], [0, 0, 1])
        : makeCylinder(radius, feature.depth + margin, [feature.x, feature.y, zMax - feature.depth], [0, 0, 1]);
  }
  try {
    const result = target.cut(tool);
    const shape = requireSingleValidSolid(result, feature.name);
    if (measureVolume(target) - measureVolume(shape) <= MIN_REMOVED_VOLUME) {
      shape.delete();
      throw new GeometryError(`${feature.name} : le perçage ne traverse pas le corps à cette position.`);
    }
    return { kind: "solid", shape };
  } finally {
    tool.delete();
  }
}

export function buildFeature(feature: Feature, lookup: OutputLookup, featureOf: (id: string) => Feature | undefined = () => undefined): FeatureOutput {
  switch (feature.type) {
    case "sketch":
      return buildSketch(feature);
    case "extrude":
      return buildExtrude(feature, lookup);
    case "hole":
      return buildHole(feature, lookup);
    case "revolve":
      return buildRevolve(feature, lookup);
    case "fillet":
      return buildFillet(feature, lookup);
    case "chamfer":
      return buildChamfer(feature, lookup);
    case "combine":
      return buildCombine(feature, lookup);
    case "split":
      return buildSplit(feature, lookup);
    case "move":
      return buildMove(feature, lookup);
    case "panels":
      return buildPanels(feature, lookup);
    case "cabinet":
      return buildCabinet(feature);
    case "mirror":
      return buildMirror(feature, lookup);
    case "align":
      return buildAlign(feature, lookup);
    case "stretch":
      return buildStretch(feature, lookup);
    case "array":
      return buildArray(feature, lookup);
    case "rotate":
      return buildRotate(feature, lookup);
    case "machining":
      return buildMachining(feature, lookup);
    case "sweep":
      return buildSweep(feature, lookup);
    case "shell":
      return buildShell(feature, lookup);
    case "paneling":
      return buildPaneling(feature, lookup);
    case "loft":
      return buildLoft(feature, lookup);
    case "modifier":
      return buildModifier(feature, lookup);
    case "fronts": {
      const cabinet = featureOf(feature.cabinet);
      return buildFronts(feature, lookup, cabinet?.type === "cabinet" ? cabinet : undefined);
    }
    case "niche": {
      const sketch = featureOf(feature.sketch);
      return buildNiche(feature, sketch?.type === "sketch" ? sketch : undefined);
    }
    case "trim":
      return buildTrim(feature);
    case "room":
      return buildRoom(feature);
    case "appliance":
      return buildAppliance(feature);
  }
}
