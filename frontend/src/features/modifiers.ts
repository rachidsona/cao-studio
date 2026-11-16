/**
 * Modificateurs de planche (comme ceux de 3ds Max), exacts et dans l'historique : la planche — une boîte — est
 * reconstruite depuis sa section (largeur × épaisseur, à un bout) :
 * - cintrer : la section tourne autour d'un axe parallèle à la largeur, à `amount` mm du milieu de l'épaisseur,
 *   sur l'angle qui garde la longueur (longueur / rayon) ;
 * - effiler : lissage droit vers la même section réduite à `amount` % à l'autre bout ;
 * - vriller : lissage par des sections tournées peu à peu jusqu'à `amount` degrés à l'autre bout ;
 * - déformer (FFD 3×3×3) : n'importe quel corps, maillé, déformé par sa grille (features/ffd.ts) et recousu en solide.
 * - déplacer un trait : les coins du corps sur le trait vont ailleurs, ses faces s'étirent pour les suivre.
 * - agrandir une face : ses points s'écartent de son centre, les côtés du corps suivent (features/face-scale.ts).
 */
import { drawRectangle, makePolygon, makeSolid, Plane, type Face, type Shape3D, type Sketch } from "replicad";
import type { ModifierFeature } from "../document/types";
import { bodyMetrics, GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { requireSolid, type OutputLookup } from "./common";
import { scaledPoint } from "./face-scale";
import { bentOnto } from "./bend-onto";
import { resolveFace } from "../geometry/references";
import { ffdPoint, isDeformed, subdivide, type Box } from "./ffd";
import type { SolidOutput } from "./outputs";

type V = [number, number, number];
const axis = (i: number, s = 1): V => [0, 1, 2].map((k) => (k === i ? s : 0)) as V;

export function buildModifier(feature: ModifierFeature, lookup: OutputLookup): SolidOutput {
  const shape = requireSolid(lookup, feature.target).shape;
  // Bent onto the round face of another body (« Cintrer contre un corps rond »).
  if (feature.kind === "bend" && feature.onto) {
    const round = requireSolid(lookup, feature.onto.body).shape;
    return { kind: "solid", shape: requireSingleValidSolid(bentOnto(feature.name, shape, resolveFace(round, feature.onto.face)), feature.name) };
  }
  if (feature.kind === "ffd") return buildFfd(feature, shape);
  if (feature.kind === "points") return buildPointMove(feature, shape);
  if (feature.kind === "face-scale") return buildFaceScale(feature, shape);
  const { bbox, volume } = bodyMetrics(shape);
  const size = [0, 1, 2].map((i) => bbox[1][i]! - bbox[0][i]!);
  if (Math.abs(volume - size[0]! * size[1]! * size[2]!) > 1e-3 * volume) throw new GeometryError(`${feature.name} : un modificateur s'applique à une planche droite (une boîte), pas à une pièce déjà usinée.`);
  const order = [0, 1, 2].sort((a, b) => size[b]! - size[a]!);
  const [L, W, T] = order as [number, number, number];
  const [length, width, thick] = [size[L]!, size[W]!, size[T]!];
  const center = [0, 1, 2].map((i) => (bbox[0][i]! + bbox[1][i]!) / 2) as V;
  // Section plane at the start of the length: x along the width, normal along the length.
  const at = (t: number): V => center.map((c, i) => (i === L ? bbox[0][i]! + t * length : c)) as V;
  const section = (t: number, scale = 1, turn = 0): Sketch => {
    const a = (turn * Math.PI) / 180;
    const xDir = [0, 1, 2].map((i) => axis(W)[i]! * Math.cos(a) + axis(T)[i]! * Math.sin(a)) as V;
    return drawRectangle(width * scale, thick * scale).sketchOnPlane(new Plane(at(t), xDir, axis(L))) as Sketch;
  };
  let result: Shape3D;
  try {
    if (feature.kind === "bend") {
      const radius = feature.amount;
      if (!(Math.abs(radius) > thick / 2)) throw new GeometryError(`${feature.name} : le rayon de cintrage doit dépasser la demi-épaisseur (${thick / 2} mm).`);
      const angle = ((length / Math.abs(radius)) * 180) / Math.PI;
      if (angle > 360) throw new GeometryError(`${feature.name} : rayon trop petit pour cette longueur (plus d'un tour).`);
      // The axis runs along the width, `radius` away across the thickness (negative: bent the other way).
      const origin = at(0).map((c, i) => (i === T ? c + radius : c)) as V;
      result = section(0).revolve(axis(W, radius > 0 ? -1 : 1), { origin, angle }) as Shape3D;
    } else if (feature.kind === "taper") {
      const scale = feature.amount / 100;
      if (!(scale > 0.01)) throw new GeometryError(`${feature.name} : la réduction doit garder plus de 1 % de la section.`);
      result = section(0).loftWith([section(1, scale)], { ruled: true });
    } else {
      const steps = Math.max(2, Math.ceil(Math.abs(feature.amount) / 15));
      const rest = Array.from({ length: steps }, (_, k) => section((k + 1) / steps, 1, (feature.amount * (k + 1)) / steps));
      result = section(0).loftWith(rest, { ruled: false });
    }
  } catch (error) {
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : la planche ne se modifie pas ainsi (${error instanceof Error ? error.message : String(error)}).`);
  }
  return { kind: "solid", shape: requireSingleValidSolid(result, feature.name) };
}

/** The body meshed, its triangles cut finer, moved by the lattice and sewn back into a solid. */
function buildFfd(feature: ModifierFeature, shape: Shape3D): SolidOutput {
  const offsets = feature.lattice ?? [];
  if (!isDeformed(offsets)) return { kind: "solid", shape: shape.clone() as Shape3D };
  const box = bodyMetrics(shape).bbox as Box;
  const mesh = shape.mesh({ tolerance: 0.5, angularTolerance: 0.3 });
  const faces: Face[] = [];
  try {
    for (const triangle of subdivide(mesh.vertices, mesh.triangles)) {
      const [a, b, c] = triangle.map((p) => ffdPoint(p, box, offsets)) as [V, V, V];
      // A triangle squashed flat by the deformation adds nothing.
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const area = Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!);
      if (area > 1e-6) faces.push(makePolygon([a, b, c]));
    }
    return { kind: "solid", shape: requireSingleValidSolid(makeSolid(faces), feature.name) };
  } catch (error) {
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : la déformation ne donne pas un solide (${error instanceof Error ? error.message : String(error)}) ; déplacez moins les points.`);
  }
}

/** Two corners closer than this (mm) are one: the points of an edge given by the view are a little rounded. */
const SAME_CORNER = 0.01;

/**
 * « Déplacer ce trait » : the body meshed, the corners at `from` moved to `to`, the triangles sewn back into a solid and
 * the faces left flat merged again — moving an edge stretches the faces along it (a board's end slanted to meet a
 * side), as in SketchUp.
 */
function buildPointMove(feature: ModifierFeature, shape: Shape3D): SolidOutput {
  const moves = feature.moves ?? [];
  if (!moves.some((m) => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2]) > 1e-6)) return { kind: "solid", shape: shape.clone() as Shape3D };
  const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.2 });
  const corners = Array.from({ length: mesh.vertices.length / 3 }, (_, i): V => [mesh.vertices[i * 3]!, mesh.vertices[i * 3 + 1]!, mesh.vertices[i * 3 + 2]!]);
  const near = (p: V, q: V) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < SAME_CORNER;
  if (!moves.every((m) => corners.some((p) => near(p, m.from)))) throw new GeometryError(`${feature.name} : le trait n'est plus sur le corps (il a changé) ; refaites le déplacement.`);
  return sewn(feature, mesh, corners.map((p) => {
    const m = moves.find((q) => near(p, q.from));
    return m ? [...m.to] : p;
  }), "le trait traverse une autre face ?");
}

/** A flat face scaled about its centre: its points move, and the sides stretch from the old edge to the new one. */
function buildFaceScale(feature: ModifierFeature, shape: Shape3D): SolidOutput {
  const face = feature.face;
  if (!face || (face.scale[0] === 1 && face.scale[1] === 1)) return { kind: "solid", shape: shape.clone() as Shape3D };
  const mesh = shape.mesh({ tolerance: 0.1, angularTolerance: 0.2 });
  const corners = Array.from({ length: mesh.vertices.length / 3 }, (_, i): V => [mesh.vertices[i * 3]!, mesh.vertices[i * 3 + 1]!, mesh.vertices[i * 3 + 2]!]);
  const moved = corners.map((p) => scaledPoint(face, p));
  if (!moved.some(Boolean)) throw new GeometryError(`${feature.name} : la face n'est plus sur le corps (il a changé) ; refaites la déformation.`);
  return sewn(feature, mesh, corners.map((p, i) => moved[i] ?? p), "une autre face gêne ?");
}

/** The triangles of a mesh with their corners moved, sewn back into a solid, the faces left flat merged again. */
function sewn(feature: ModifierFeature, mesh: { triangles: number[] }, corners: V[], hint: string): SolidOutput {
  const faces: Face[] = [];
  try {
    for (let t = 0; t + 2 < mesh.triangles.length; t += 3) {
      const [a, b, c] = [corners[mesh.triangles[t]!]!, corners[mesh.triangles[t + 1]!]!, corners[mesh.triangles[t + 2]!]!];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const area = Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!);
      if (area > 1e-6) faces.push(makePolygon([a, b, c]));
    }
    return { kind: "solid", shape: requireSingleValidSolid(makeSolid(faces).simplify(), feature.name) };
  } catch (error) {
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : le corps ne se déforme pas ainsi (${hint}).`);
  }
}
