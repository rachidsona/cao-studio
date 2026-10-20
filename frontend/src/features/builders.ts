/**
 * Feature builders: turn one feature of the history plus its already-computed
 * inputs into exact B-rep geometry. Builders validate their parameters and
 * throw GeometryError with an explicit message instead of producing bad
 * geometry.
 */
import { makeCylinder, measureVolume, type Shape3D } from "replicad";
import { solveSketch, SketchError } from "../constraints/solver";
import type { ExtrudeFeature, Feature, HoleFeature, SketchFeature } from "../document/types";
import { buildProfile, ProfileError } from "../sketcher/profiles";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import type { FeatureOutput, ProfileOutput, SolidOutput } from "./outputs";

/** Smallest dimension accepted by the modeller (mm). */
export const MIN_LENGTH = 1e-3;

/** Below this removed volume (mm³) a cut is considered to have missed the body. */
const MIN_REMOVED_VOLUME = 1e-6;

export type OutputLookup = (id: string) => FeatureOutput | undefined;

function requirePositive(value: number, label: string): void {
  if (!(value >= MIN_LENGTH)) throw new GeometryError(`${label} doit être supérieur à ${MIN_LENGTH} mm.`);
}

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
  const base = { kind: "profile" as const, plane: feature.plane, offset: feature.offset, dof: solved.dof, redundant: solved.redundant };
  try {
    return { ...base, drawing: buildProfile(solved.geometry), openReason: null };
  } catch (error) {
    if (error instanceof ProfileError) return { ...base, drawing: null, openReason: error.message };
    throw error;
  }
}

function requireProfile(lookup: OutputLookup, id: string): ProfileOutput {
  const output = lookup(id);
  if (!output || output.kind !== "profile") throw new GeometryError(`« ${id} » n'est pas une esquisse valide.`);
  return output;
}

function requireSolid(lookup: OutputLookup, id: string): SolidOutput {
  const output = lookup(id);
  if (!output || output.kind !== "solid") throw new GeometryError(`« ${id} » n'est pas un corps solide valide.`);
  return output;
}

function buildExtrude(feature: ExtrudeFeature, lookup: OutputLookup): SolidOutput {
  if (!(Math.abs(feature.distance) >= MIN_LENGTH)) throw new GeometryError("La distance d'extrusion ne peut pas être nulle.");
  const profile = requireProfile(lookup, feature.sketch);
  if (!profile.drawing) {
    throw new GeometryError(`${feature.name} : ${profile.openReason ?? "l'esquisse ne contient aucun profil fermé."}`);
  }
  const sketch = profile.drawing.clone().sketchOnPlane(profile.plane, profile.offset);
  const prism = sketch.extrude(feature.distance) as Shape3D;
  if (feature.operation === "new") {
    return { kind: "solid", shape: requireSingleValidSolid(prism, feature.name) };
  }
  if (!feature.target) {
    prism.delete();
    throw new GeometryError(`${feature.name} : un corps cible est requis pour l'opération « ${feature.operation} ».`);
  }
  const target = requireSolid(lookup, feature.target).shape;
  try {
    const result = feature.operation === "join" ? target.fuse(prism) : target.cut(prism);
    return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
  } finally {
    prism.delete();
  }
}

function buildHole(feature: HoleFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.diameter, "Le diamètre du perçage");
  if (feature.depth !== "through") requirePositive(feature.depth, "La profondeur du perçage");
  const target = requireSolid(lookup, feature.target).shape;
  const box = target.boundingBox;
  const [[, , zMin], [, , zMax]] = box.bounds;
  box.delete();

  // The tool overshoots the faces it must pierce by 1 mm to avoid coplanar booleans.
  const margin = 1;
  const radius = feature.diameter / 2;
  const tool =
    feature.depth === "through"
      ? makeCylinder(radius, zMax - zMin + 2 * margin, [feature.x, feature.y, zMin - margin], [0, 0, 1])
      : makeCylinder(radius, feature.depth + margin, [feature.x, feature.y, zMax - feature.depth], [0, 0, 1]);
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
  }
}
