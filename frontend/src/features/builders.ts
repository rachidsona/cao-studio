/**
 * Feature builders: turn one feature of the history plus its already-computed
 * inputs into exact B-rep geometry. Builders validate their parameters and
 * throw GeometryError with an explicit message instead of producing bad
 * geometry.
 */
import { makeCylinder, measureVolume, type Drawing, type Shape3D } from "replicad";
import { solveSketch, SketchError } from "../constraints/solver";
import type { ExtrudeFeature, Feature, HoleFeature, SketchFeature, Vec3 } from "../document/types";
import { buildProfile, ProfileError } from "../sketcher/profiles";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveFace } from "../geometry/references";
import { applyOperation, MIN_LENGTH, profileDrawing, requirePositive, requireProfile, requireSolid, type OutputLookup } from "./common";
import type { FeatureOutput, ProfileOutput, SolidOutput } from "./outputs";
import { buildChamfer, buildCombine, buildFaceExtrude, buildFillet, buildRevolve } from "./solids";

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
  if (solved.state === "failed") throw new GeometryError("Le solveur de contraintes n'a pas trouvé de solution.");
  const base = {
    kind: "profile" as const,
    plane: feature.plane,
    offset: feature.offset,
    dof: solved.dof,
    redundant: solved.redundant,
    geometry: solved.geometry,
  };
  try {
    return { ...base, drawing: buildProfile(solved.geometry), openReason: null };
  } catch (error) {
    if (error instanceof ProfileError) return { ...base, drawing: null, openReason: error.message };
    throw error;
  }
}

function buildExtrude(feature: ExtrudeFeature, lookup: OutputLookup): SolidOutput {
  if (!(Math.abs(feature.distance) >= MIN_LENGTH)) throw new GeometryError("La distance d'extrusion ne peut pas être nulle.");
  if (feature.faces) return buildFaceExtrude(feature, lookup);
  if (!feature.sketch) throw new GeometryError(`${feature.name} : choisissez une esquisse ou des faces à extruder.`);
  const profile = requireProfile(lookup, feature.sketch);
  let drawing: Drawing;
  if (feature.regions) {
    try {
      drawing = buildProfile(profile.geometry, feature.regions) as Drawing;
    } catch (error) {
      if (error instanceof ProfileError) throw new GeometryError(`${feature.name} : ${error.message}`);
      throw error;
    }
  } else drawing = profileDrawing(feature.name, profile).clone();
  const sketch = drawing.sketchOnPlane(profile.plane, profile.offset);
  const prism = sketch.extrude(feature.distance) as Shape3D;
  return applyOperation(feature.name, prism, feature.operation, feature.target, lookup);
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

export function buildFeature(feature: Feature, lookup: OutputLookup): FeatureOutput {
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
  }
}
