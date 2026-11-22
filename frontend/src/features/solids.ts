/**
 * Builders of the solid operations added in phase 5: revolution, fillet,
 * chamfer and combination of bodies. Edges are found again through
 * persistent references (geometry/references.ts).
 */
import { basicFaceExtrusion, drawRectangle, measureArea, Plane, Vector, type ChamferRadius, type Edge, type Face, type Shape3D } from "replicad";
import { AXIS_X, AXIS_Y } from "../document/sketch";
import type { ChamferFeature, CombineFeature, ExtrudeFeature, FilletFeature, RevolveFeature } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveEdges, resolveFace, resolveFacePlane } from "../geometry/references";
import { prismUntil } from "./face-until";
import { frameOf, toWorld } from "../sketcher/frame";
import { applyOperation, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, solidsResult, type OutputLookup } from "./common";
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

function edgePredicate<T>(edges: Edge[], value: T | ((edge: Edge) => T)) {
  return (edge: Edge) => (edges.some((e) => e.isSame(edge)) ? (typeof value === "function" ? (value as (edge: Edge) => T)(edge) : value) : null);
}

/** The faces along an edge, the larger first (the face of a board, then its edge). */
function facesAlong(shape: Shape3D, edge: Edge): Face[] {
  return shape.faces.filter((f) => f.edges.some((e) => e.isSame(edge))).map((f) => ({ f, area: measureArea(f) })).sort((a, b) => b.area - a.area).map((x) => x.f);
}

export function buildFillet(feature: FilletFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.radius, "Le rayon du congé");
  if (feature.edges.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une arête.`);
  const target = requireSolid(lookup, feature.target).shape;
  const edges = resolveEdges(target, feature.edges);
  let result: Shape3D;
  try {
    // Variable: from the start radius to the end one along each edge.
    const end = feature.radiusEnd;
    result = target.fillet(edgePredicate<number | [number, number]>(edges, end !== undefined && end !== feature.radius ? [feature.radius, end] : feature.radius));
  } catch {
    throw new GeometryError(`${feature.name} : congé impossible avec ce rayon (trop grand pour les faces voisines ?).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}

export function buildChamfer(feature: ChamferFeature, lookup: OutputLookup): SolidOutput {
  requirePositive(feature.distance, "La distance du chanfrein");
  if (feature.distance2 !== undefined) requirePositive(feature.distance2, "La seconde distance du chanfrein");
  if (feature.edges.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une arête.`);
  const target = requireSolid(lookup, feature.target).shape;
  const edges = resolveEdges(target, feature.edges);
  let result: Shape3D;
  try {
    const second = feature.distance2;
    // Two distances: the first on the larger face along each edge (the smaller one when swapped).
    const radius = (edge: Edge): ChamferRadius => {
      if (second === undefined || second === feature.distance) return feature.distance;
      const faces = facesAlong(target, edge);
      const face = faces[feature.swap ? faces.length - 1 : 0];
      return face ? { distances: [feature.distance, second], selectedFace: (f) => f.inList([face]) } : feature.distance;
    };
    result = target.chamfer(edgePredicate(edges, radius));
  } catch {
    throw new GeometryError(`${feature.name} : chanfrein impossible avec cette distance (trop grande ?).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}

export function buildCombine(feature: CombineFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
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
  // A cut right through a body (a back crossed by the seat): its pieces, each a body, as an extrusion that cuts.
  if (feature.operation === "cut" && current.solids.length > 1) return solidsResult(current, feature.name);
  if (current.solids.length !== 1) {
    const count = current.solids.length;
    current.delete();
    throw new GeometryError(`${feature.name} : ${count === 0 ? "résultat vide" : messages[feature.operation]}.`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(current, feature.name) };
}

/** The slab between the planes square to the edge `from`–`to` through its two ends (wide enough for any body). */
function stripSlab(strip: NonNullable<ExtrudeFeature["strip"]>, name: string): Shape3D {
  const d = [0, 1, 2].map((i) => strip.to[i]! - strip.from[i]!);
  const length = Math.hypot(...d);
  if (length < 1e-6) throw new GeometryError(`${name} : l'arête est trop courte.`);
  const n = d.map((c) => c / length) as [number, number, number];
  // Any direction square to the edge for the slab's x.
  const seed = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const x = [n[1] * seed[2]! - n[2] * seed[1]!, n[2] * seed[0]! - n[0] * seed[2]!, n[0] * seed[1]! - n[1] * seed[0]!];
  const k = Math.hypot(...x);
  const plane = new Plane(strip.from, x.map((c) => c / k) as [number, number, number], n);
  return drawRectangle(1e6, 1e6).sketchOnPlane(plane).extrude(length) as Shape3D;
}

/**
 * Push/pull of planar faces: each face is swept along its outward normal by
 * `distance` (negative: into the body), then combined with the target. With a `strip`, only the part of the sweep
 * between the planes square to the edge through its ends is kept: the face is pulled along the edge only.
 */
export function buildFaceExtrude(feature: ExtrudeFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  const faces = feature.faces ?? [];
  if (faces.length === 0) throw new GeometryError(`${feature.name} : sélectionnez au moins une face.`);
  if (!feature.target) throw new GeometryError(`${feature.name} : corps des faces manquant.`);
  const target = requireSolid(lookup, feature.target).shape;
  // « Prolonger élément » gardé: up to the face of another body, as it is now.
  const reached = feature.until ? requireSolid(lookup, feature.until.body).shape : null;
  const until = reached ? resolveFacePlane(reached, feature.until!.face) : null;
  const arrival = reached && feature.cover ? resolveFace(reached, feature.until!.face) : undefined;
  let operation = feature.operation;
  let tool: Shape3D | null = null;
  try {
    for (const ref of faces) {
      const face = resolveFace(target, ref);
      if (face.geomType !== "PLANE") throw new GeometryError(`${feature.name} : seules les faces planes peuvent être extrudées.`);
      let prism: Shape3D;
      if (until) {
        const made = prismUntil(face, until, feature.name, feature.direction, arrival);
        if (!made) continue;
        prism = made.prism;
        operation = made.out ? "join" : "cut";
      } else {
        const raw = face.normalAt(face.center);
        const n = feature.direction ?? [raw.x, raw.y, raw.z];
        raw.delete();
        const length = Math.hypot(n[0], n[1], n[2]) || 1;
        const k = feature.distance / length;
        const vector = new Vector([n[0] * k, n[1] * k, n[2] * k]);
        prism = basicFaceExtrusion(face, vector) as Shape3D;
        vector.delete();
      }
      if (feature.strip) {
        const cut = stripSlab(feature.strip, feature.name);
        const kept: Shape3D = prism.intersect(cut);
        prism.delete();
        cut.delete();
        prism = kept;
      }
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
  // Every face already on the face to reach: the body as it is.
  if (!tool) return { kind: "solid", shape: target.clone() as Shape3D };
  return applyOperation(feature.name, tool, operation, feature.target, lookup);
}
