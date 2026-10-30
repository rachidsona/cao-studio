/**
 * Seams of a body: edges between two faces of the same plane. A board extruded from a sketch whose outline is cut
 * into pieces (the top of a « Répartition » where the sides meet it) has its face made of several flat pieces; the
 * edges between them are not edges of the board and are not drawn. The faces and edges keep their numbers.
 */
import type { Shape3D } from "replicad";

/** Indices (in `shape.edges` order) of the edges shared by two coplanar faces of the body. */
export function seamEdges(shape: Shape3D): number[] {
  const edges = shape.edges;
  const byHash = new Map<number, number[]>();
  edges.forEach((edge, i) => byHash.set(edge.hashCode, [...(byHash.get(edge.hashCode) ?? []), i]));
  const adjacent = edges.map(() => new Set<number>());
  const faces = shape.faces;
  faces.forEach((face, f) => {
    for (const edge of face.edges) for (const i of byHash.get(edge.hashCode) ?? []) if (edges[i]!.isSame(edge)) adjacent[i]!.add(f);
  });
  const normals = faces.map((face) => (face.geomType === "PLANE" ? face.normalAt() : null));
  const seams: number[] = [];
  adjacent.forEach((set, i) => {
    if (set.size !== 2) return;
    const [a, b] = [...set].map((f) => normals[f]);
    if (!a || !b) return;
    // Two outward normals pointing the same way: the faces continue each other.
    if (a.x * b.x + a.y * b.y + a.z * b.z > 1 - 1e-7) seams.push(i);
  });
  return seams;
}
