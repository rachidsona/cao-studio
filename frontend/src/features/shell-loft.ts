/**
 * Coque et lissage dans le noyau (comme Fusion) :
 * - la coque creuse le corps à une épaisseur de paroi, les faces choisies (planes) restant ouvertes : un tiroir, un
 *   bac, une boîte sans couvercle à partir d'un bloc ;
 * - le lissage relie les profils fermés de plusieurs esquisses, dans l'ordre (courbe ou droit entre eux) : un pied
 *   galbé, une moulure qui change de section, une trémie.
 */
import type { Face, Shape3D, Sketch } from "replicad";
import type { LoftFeature, ShellFeature } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveFace } from "../geometry/references";
import { applyOperation, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";

/** A point inside a planar face (its centre), to find it again among the faces of the body. */
function insidePoint(face: Face): [number, number, number] {
  const c = face.center;
  return [c.x, c.y, c.z];
}

export function buildShell(feature: ShellFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(Math.abs(feature.thickness), `${feature.name} : l'épaisseur`);
  const target = requireSolid(lookup, feature.target).shape;
  const faces = feature.faces.map((ref) => resolveFace(target, ref));
  if (faces.some((f) => f.geomType !== "PLANE")) throw new GeometryError(`${feature.name} : seules des faces planes peuvent rester ouvertes.`);
  const points = faces.map(insidePoint);
  let shelled: Shape3D;
  try {
    // A positive thickness hollows inwards: the walls stay inside the body's outline.
    shelled = target.clone().shell(Math.abs(feature.thickness), (f) => (points.length ? f.either(points.map((p) => (g: typeof f) => g.containsPoint(p))) : f.containsPoint([Infinity, Infinity, Infinity])));
  } catch {
    throw new GeometryError(`${feature.name} : la coque est impossible ; essayez une paroi plus fine que la plus petite épaisseur du corps.`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(shelled, feature.name) };
}

export function buildLoft(feature: LoftFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  if (feature.profiles.length < 2) throw new GeometryError(`${feature.name} : choisissez au moins deux esquisses à relier.`);
  if (new Set(feature.profiles).size !== feature.profiles.length) throw new GeometryError(`${feature.name} : une esquisse ne peut servir qu'une fois.`);
  const sketches = feature.profiles.map((id, i) => {
    const profile = requireProfile(lookup, id);
    const placed = onProfilePlane(profileDrawing(`${feature.name} (profil ${i + 1})`, profile).clone(), profile);
    if (!("wire" in placed)) throw new GeometryError(`${feature.name} : le profil ${i + 1} doit être un seul contour fermé, sans trou.`);
    return placed as Sketch;
  });
  let solid: Shape3D;
  try {
    solid = sketches[0]!.loftWith(sketches.slice(1), { ruled: feature.ruled ?? false });
  } catch {
    throw new GeometryError(`${feature.name} : le lissage est impossible ; les profils doivent être dans des plans séparés, dans l'ordre.`);
  }
  return applyOperation(feature.name, solid, feature.operation, feature.target, lookup);
}
