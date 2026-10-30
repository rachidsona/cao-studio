/**
 * Ce que le mètre mesure, pris dans le maillage d'un corps : une arête (ses segments), une face (ses triangles, ses
 * sommets et son contour) ou un corps entier (tous ses triangles et ses arêtes). Le contour sert à montrer l'élément
 * choisi dans la vue.
 */
import type { Vec3 } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import { planeNormal, type MeasureShape } from "../measurements/closest";

export interface Picked {
  shape: MeasureShape;
  /** Lines that show it. */
  outline: [Vec3, Vec3][];
  /** A flat face's normal, a straight edge's direction: for the angle between two of them. */
  direction: Vec3 | null;
}

const vertex = (mesh: BodyMesh, i: number): Vec3 => [mesh.vertices[3 * i]!, mesh.vertices[3 * i + 1]!, mesh.vertices[3 * i + 2]!];
const key = (p: Vec3) => p.map((c) => c.toFixed(4)).join(",");

function edgeSegments(mesh: BodyMesh, start: number, count: number): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  const at = (i: number): Vec3 => [mesh.edges[3 * i]!, mesh.edges[3 * i + 1]!, mesh.edges[3 * i + 2]!];
  for (let i = start; i + 1 < start + count; i += 2) out.push([at(i), at(i + 1)]);
  return out;
}

function trianglesOf(mesh: BodyMesh, start: number, count: number): [Vec3, Vec3, Vec3][] {
  const out: [Vec3, Vec3, Vec3][] = [];
  for (let k = start; k + 2 < start + count; k += 3) out.push([vertex(mesh, mesh.indices[k]!), vertex(mesh, mesh.indices[k + 1]!), vertex(mesh, mesh.indices[k + 2]!)]);
  return out;
}

function uniquePoints(points: Vec3[]): Vec3[] {
  const seen = new Map<string, Vec3>();
  for (const p of points) seen.set(key(p), p);
  return [...seen.values()];
}

export function edgePicked(mesh: BodyMesh, edgeIndex: number): Picked | null {
  const group = mesh.edgeGroups[edgeIndex];
  if (!group) return null;
  const segments = edgeSegments(mesh, group.start, group.count);
  if (!segments.length) return null;
  const first = segments[0]![0];
  const last = segments.at(-1)![1];
  const chord: Vec3 = [last[0] - first[0], last[1] - first[1], last[2] - first[2]];
  // Straight when every segment goes the way of the chord.
  const straight = Math.hypot(...chord) > 1e-6 && segments.every(([a, b]) => {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const cross = [d[1] * chord[2] - d[2] * chord[1], d[2] * chord[0] - d[0] * chord[2], d[0] * chord[1] - d[1] * chord[0]];
    return Math.hypot(...cross) <= 1e-6 * Math.hypot(...d) * Math.hypot(...chord) + 1e-9;
  });
  return { shape: { points: uniquePoints(segments.flat()), segments, triangles: [] }, outline: segments, direction: straight ? chord : null };
}

export function facePicked(mesh: BodyMesh, faceIndex: number): Picked | null {
  const group = mesh.faceGroups[faceIndex];
  if (!group) return null;
  const triangles = trianglesOf(mesh, group.start, group.count);
  if (!triangles.length) return null;
  // The outline: the triangles' sides that belong to one triangle only.
  const sides = new Map<string, { count: number; side: [Vec3, Vec3] }>();
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [Vec3, Vec3][]) {
      const k = [key(p), key(q)].sort().join("|");
      const entry = sides.get(k);
      if (entry) entry.count++;
      else sides.set(k, { count: 1, side: [p, q] });
    }
  }
  const all = [...sides.values()].map((s) => s.side);
  const outline = [...sides.values()].filter((s) => s.count === 1).map((s) => s.side);
  return { shape: { points: uniquePoints(triangles.flat()), segments: all, triangles }, outline, direction: planeNormal(triangles) };
}

export function bodyPicked(mesh: BodyMesh): Picked {
  const triangles = trianglesOf(mesh, 0, mesh.indices.length);
  const segments = edgeSegments(mesh, 0, mesh.edges.length / 3);
  return { shape: { points: uniquePoints(triangles.flat()), segments, triangles }, outline: segments, direction: null };
}
