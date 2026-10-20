/**
 * Persistent references to edges and faces ("topological naming").
 *
 * OpenCascade renumbers edges and faces whenever a solid is rebuilt, so a
 * fillet cannot store "edge 7". A reference stores what identifies the edge
 * for a human: its curve type, its direction, and its position *relative to
 * the bounding box of the body* (0..1 on each axis). When the part is resized
 * (e.g. the plate gets wider), a corner edge keeps its relative position, so
 * it is found again. When no candidate is close enough, an explicit error asks
 * the user to select the edge again rather than silently picking another one.
 */
import type { Edge, Face, Shape3D } from "replicad";
import type { EdgeRef, FaceRef, Vec3 } from "../document/types";
import { GeometryError } from "./kernel";

/** Maximum distance in bounding-box-relative space for a match. */
export const MAX_RELATIVE_DISTANCE = 0.15;
/** Maximum 1 − |cos| between directions/normals for a match (≈ 8°). */
export const MAX_DIRECTION_ERROR = 0.01;

interface Box {
  min: Vec3;
  size: Vec3;
}

function boxOf(shape: Shape3D): Box {
  const bbox = shape.boundingBox;
  try {
    const [min, max] = bbox.bounds;
    return { min: [min[0], min[1], min[2]], size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  } finally {
    bbox.delete();
  }
}

function relative(p: Vec3, box: Box): Vec3 {
  return [0, 1, 2].map((i) => {
    const size = box.size[i] as number;
    return size < 1e-9 ? 0.5 : (p[i]! - box.min[i]!) / size;
  }) as Vec3;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const vec = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

/** Unit vector with a canonical sign (first significant component positive). */
function canonical(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  const u: Vec3 = [v[0] / l, v[1] / l, v[2] / l];
  const first = u.find((c) => Math.abs(c) > 1e-9) ?? 1;
  return first < 0 ? [-u[0], -u[1], -u[2]] : u;
}

function edgeData(edge: Edge): { mid: Vec3; dir: Vec3 } {
  return { mid: vec(edge.pointAt(0.5)), dir: canonical(vec(edge.tangentAt(0.5))) };
}

export function describeEdge(shape: Shape3D, edge: Edge, box = boxOf(shape)): EdgeRef {
  const { mid, dir } = edgeData(edge);
  return { type: edge.geomType, mid, rel: relative(mid, box), dir, length: edge.length };
}

function faceData(face: Face): { center: Vec3; normal: Vec3 } {
  const c = face.center;
  const center = vec(c); // read first: normalAt() releases the vector it is given
  // The centre of mass of a curved face (a cylinder wall) lies off its surface, where the kernel has no normal.
  if (face.geomType !== "PLANE") return { center, normal: vec(face.normalAt()) };
  return { center, normal: vec(face.normalAt(c)) };
}

export function describeFace(shape: Shape3D, face: Face, box = boxOf(shape)): FaceRef {
  const { center, normal } = faceData(face);
  const n = Math.hypot(...normal) || 1;
  return { type: face.geomType, center, rel: relative(center, box), normal: [normal[0] / n, normal[1] / n, normal[2] / n], area: 0 };
}

/** Finds the edges of `shape` matching `refs` (one distinct edge per reference). */
export function resolveEdges(shape: Shape3D, refs: EdgeRef[], what = "Arête"): Edge[] {
  const box = boxOf(shape);
  const edges = shape.edges;
  const used = new Set<number>();
  return refs.map((ref, k) => {
    let best = -1;
    let bestScore = Infinity;
    edges.forEach((edge, i) => {
      if (used.has(i) || edge.geomType !== ref.type) return;
      const { mid, dir } = edgeData(edge);
      const position = dist(relative(mid, box), ref.rel);
      // Straight edges must keep their direction; curved edges are matched on position and size.
      const direction = ref.type === "LINE" ? 1 - Math.abs(dot(dir, ref.dir)) : 0;
      const size = ref.type === "LINE" ? 0 : Math.abs(Math.log(edge.length / ref.length));
      if (position > MAX_RELATIVE_DISTANCE || direction > MAX_DIRECTION_ERROR || size > 0.7) return;
      const score = position + 10 * direction + 0.1 * size;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) throw new GeometryError(`${what} n° ${k + 1} introuvable après recalcul : sélectionnez-la à nouveau.`);
    used.add(best);
    return edges[best] as Edge;
  });
}

/** Finds the face of `shape` matching `ref`. */
export function resolveFace(shape: Shape3D, ref: FaceRef): Face {
  const box = boxOf(shape);
  let best: Face | null = null;
  let bestScore = Infinity;
  for (const face of shape.faces) {
    if (face.geomType !== ref.type) continue;
    const { center, normal } = faceData(face);
    const n = Math.hypot(...normal) || 1;
    const alignment = 1 - dot([normal[0] / n, normal[1] / n, normal[2] / n], ref.normal);
    const position = dist(relative(center, box), ref.rel);
    if (position > MAX_RELATIVE_DISTANCE || (ref.type === "PLANE" && alignment > MAX_DIRECTION_ERROR)) continue;
    const score = position + alignment;
    if (score < bestScore) {
      bestScore = score;
      best = face;
    }
  }
  if (!best) throw new GeometryError("Face d'appui introuvable après recalcul : replacez l'opération sur une face.");
  return best;
}

/** Plane (a point and the outward unit normal) of the planar face of `shape` matching `ref`. */
export function resolveFacePlane(shape: Shape3D, ref: FaceRef): { origin: Vec3; normal: Vec3 } {
  const face = resolveFace(shape, ref);
  if (face.geomType !== "PLANE") {
    throw new GeometryError("Seule une face plane peut servir d'outil de coupe : le moteur découpe un solide par des plans.");
  }
  const { center, normal } = faceData(face);
  const length = Math.hypot(...normal) || 1;
  return { origin: center, normal: [normal[0] / length, normal[1] / length, normal[2] / length] };
}
