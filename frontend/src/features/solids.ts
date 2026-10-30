/**
 * Builders of the solid operations added in phase 5: revolution, fillet,
 * chamfer and combination of bodies. Edges are found again through
 * persistent references (geometry/references.ts).
 */
import { basicFaceExtrusion, Vector, type Edge, type Shape3D } from "replicad";
import { AXIS_X, AXIS_Y } from "../document/sketch";
import type { ChamferFeature, CombineFeature, ExtrudeFeature, FilletFeature, RevolveFeature } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveEdges, resolveFace } from "../geometry/references";
import { frameOf, toWorld } from "../sketcher/frame";
import { applyOperation, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";

/** Axis of a revolution, in world coordinates, from a sketch line or a sketch axis. */
function revolveAxis(feature: RevolveFeature, lookup: OutputLookup): { origin: [number, number, number]; direction: [number, number, number] } {
  const profile = requireProfile(lookup, feature.sketch);
  const frame = frameOf(profile);
  let a: [number, number];
  let b: [number, number];
  if (feature.axis === AXIS_X) [a, b] = [[0, 0], [1, 0]];
  else if (feature.axis === AXIS_Y) [a, b] = [[0, 0], [0, 1]];
  else {
    const line = profile.geometry.curves.find((c) => c.id === feature.axis);
    if (line?.kind !== "line") throw new GeometryError(`${feature.name} : l'axe « ${feature.axis} » n'est pas une ligne de l'esquisse.`);
    const p = (id: string): [number, number] => {
      if (id === "origin") return [0, 0];
      const pt = profile.geometry.points.find((q) => q.id === id);
      if (!pt) throw new GeometryError(`${feature.name} : point « ${id} » introuvable.`);
      return [pt.x, pt.y];
    };
    [a, b] = [p(line.p1), p(line.p2)];
  }
  const origin = toWorld(frame, a[0], a[1]);
  const end = toWorld(frame, b[0], b[1]);
  const direction: [number, number, number] = [end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]];
  if (Math.hypot(...direction) < 1e-9) throw new GeometryError(`${feature.name} : l'axe a une longueur nulle.`);
  return { origin, direction };
}

export function buildRevolve(feature: RevolveFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  if (!(feature.angle > 0 && feature.angle <= 360)) throw new GeometryError("L'angle de révolution doit être compris entre 0 et 360°.");
  const profile = requireProfile(lookup, feature.sketch);
  const drawing = profileDrawing(feature.name, profile);
  const { origin, direction } = revolveAxis(feature, lookup);
  let tool: Shape3D;
  try {
    tool = onProfilePlane(drawing.clone(), profile).revolve(direction, { origin, angle: feature.angle }) as Shape3D;
  } catch {
    throw new GeometryError(`${feature.name} : révolution impossible (le profil coupe-t-il l'axe ?).`);
  }
  return applyOperation(feature.name, tool, feature.operation, feature.target, lookup);
}

function edgePredicate(edges: Edge[], value: number) {
  return (edge: Edge) => (edges.some((e) => e.isSame(edge)) ? value : null);
}

export function buildFillet(feature: FilletFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.radius, "Le rayon du congé");
  if (feature.edges.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une arête.`);
  const target = requireSolid(lookup, feature.target).shape;
  const edges = resolveEdges(target, feature.edges);
  let result: Shape3D;
  try {
    result = target.fillet(edgePredicate(edges, feature.radius));
  } catch {
    throw new GeometryError(`${feature.name} : congé impossible avec ce rayon (trop grand pour les faces voisines ?).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}

export function buildChamfer(feature: ChamferFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.distance, "La distance du chanfrein");
  if (feature.edges.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une arête.`);
  const target = requireSolid(lookup, feature.target).shape;
  const edges = resolveEdges(target, feature.edges);
  let result: Shape3D;
  try {
    result = target.chamfer(edgePredicate(edges, feature.distance));
  } catch {
    throw new GeometryError(`${feature.name} : chanfrein impossible avec cette distance (trop grande ?).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}

export function buildCombine(feature: CombineFeature, lookup: OutputLookup): SolidOutput {
  if (feature.tools.length === 0) throw new GeometryError(`${feature.name} : choisissez au moins un corps outil.`);
  if (feature.tools.includes(feature.target)) throw new GeometryError(`${feature.name} : le corps cible ne peut pas être aussi un outil.`);
  let current = requireSolid(lookup, feature.target).shape;
  let owned = false;
  try {
    for (const toolId of feature.tools) {
      const tool = requireSolid(lookup, toolId).shape;
      const next = feature.operation === "join" ? current.fuse(tool) : feature.operation === "cut" ? current.cut(tool) : current.intersect(tool);
      if (owned) current.delete();
      current = next;
      owned = true;
    }
  } catch (error) {
    if (owned) current.delete();
    throw error;
  }
  const messages = { join: "les corps ne se touchent pas", cut: "la coupe sépare le corps", intersect: "les corps n'ont pas de volume commun" };
  if (current.solids.length !== 1) {
    const count = current.solids.length;
    current.delete();
    throw new GeometryError(`${feature.name} : ${count === 0 ? "résultat vide" : messages[feature.operation]}.`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(current, feature.name) };
}

/**
 * Push/pull of planar faces: each face is swept along its outward normal by
 * `distance` (negative: into the body), then combined with the target.
 */
export function buildFaceExtrude(feature: ExtrudeFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const faces = feature.faces ?? [];
  if (faces.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une face.`);
  if (!feature.target) throw new GeometryError(`${feature.name} : corps des faces manquant.`);
  const target = requireSolid(lookup, feature.target).shape;
  let tool: Shape3D | null = null;
  try {
    for (const ref of faces) {
      const face = resolveFace(target, ref);
      if (face.geomType !== "PLANE") throw new GeometryError(`${feature.name} : seules les faces planes peuvent être extrudées.`);
      const n = face.normalAt(face.center);
      const length = Math.hypot(n.x, n.y, n.z) || 1;
      const k = feature.distance / length;
      const vector = new Vector([n.x * k, n.y * k, n.z * k]);
      const prism = basicFaceExtrusion(face, vector) as Shape3D;
      vector.delete();
      if (!tool) tool = prism;
      else {
        const fused: Shape3D = tool.fuse(prism);
        tool.delete();
        prism.delete();
        tool = fused;
      }
    }
  } catch (error) {
    tool?.delete();
    throw error;
  }
  return applyOperation(feature.name, tool as Shape3D, feature.operation, feature.target, lookup);
}
