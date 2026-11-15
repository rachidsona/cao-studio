/**
 * Les contours exacts lus sur le noyau, en lignes, arcs et cercles : d'une arête, d'une face (toutes ses boucles), et
 * d'une coupe par un plan (là où le plan traverse le corps). Partagés par le worker et les tests.
 */
import { makePolygon, type Edge, type Face, type Shape3D } from "replicad";
import type { EdgeOutline, FaceOutline, OutlineEdge, P3 } from "./protocol";

/** Centre of the circle through three 3D points. */
export function circumcentre(a: number[], b: number[], c: number[]): [number, number, number] {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  const n = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
  const n2 = n[0]! ** 2 + n[1]! ** 2 + n[2]! ** 2 || 1e-30;
  const ab2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
  const ac2 = ac[0]! ** 2 + ac[1]! ** 2 + ac[2]! ** 2;
  // ((|ac|² (ab × ac) × ab) + (|ab|² ac × (ab × ac))) / (2 |ab × ac|²)
  const cross = (u: number[], v: number[]) => [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const t1 = cross(n, ab).map((x) => x * ac2);
  const t2 = cross(ac, n).map((x) => x * ab2);
  return [0, 1, 2].map((i) => a[i]! + (t1[i]! + t2[i]!) / (2 * n2)) as [number, number, number];
}

/** One B-rep edge as a line, a circle or an arc (other curves: points along it). */
export function outlineEdges(edge: Edge): OutlineEdge[] {
  const p = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
  if (edge.geomType === "LINE") return [{ kind: "line", a: p(edge.startPoint), b: p(edge.endPoint) }];
  if (edge.geomType === "CIRCLE") {
    const q = (t: number) => p(edge.pointAt(t));
    const centre = circumcentre(q(0), q(1 / 3), q(2 / 3));
    const radius = Math.hypot(...q(0).map((v, i) => v - centre[i]!));
    return [edge.isClosed ? { kind: "circle", center: centre, radius } : { kind: "arc", center: centre, radius, a: p(edge.startPoint), b: p(edge.endPoint), mid: q(0.5) }];
  }
  const steps = 12;
  return Array.from({ length: steps }, (_, i): OutlineEdge => ({ kind: "line", a: p(edge.pointAt(i / steps)), b: p(edge.pointAt((i + 1) / steps)) }));
}

/** One edge of a body, exactly, with points along it (to project it into a sketch). */
/** An edge as lines and samples; the kernel's points read are released at once (audit of 11/11/2026). */
export function outlineOf(edge: Edge): EdgeOutline {
  const samples = Array.from({ length: 9 }, (_, i) => {
    const v = edge.pointAt(i / 8);
    const point = [v.x, v.y, v.z] as [number, number, number];
    v.delete();
    return point;
  });
  return { edges: outlineEdges(edge), samples };
}

/** The kernel's wrappers of a list of edges, released when read. */
function release(items: readonly { delete(): void }[]): void {
  for (const item of items) item.delete();
}

export function outlineOfFace(face: Face): FaceOutline {
  const p = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
  const c = face.center;
  // Read the centre before normalAt(), which releases the vector it is given.
  const centre = p(c);
  const n = face.normalAt(c);
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  const edges: OutlineEdge[] = [];
  // face.wires gives every loop (outer and holes); outerWire() then innerWires() fails in replicad 1.1.
  for (const wire of face.wires) {
    // Other curves than lines and circles: a polyline approximation (reference only).
    for (const edge of wire.edges) edges.push(...outlineEdges(edge));
  }
  return { surface: face.geomType, center: centre, normal: [n.x / length, n.y / length, n.z / length], edges };
}

/** Where a plane cuts a body (« Intersection », the flat board's outline): the edges of the part of a large square of the plane inside it. */
export function sectionOf(shape: Shape3D, origin: P3, u: P3, v: P3): EdgeOutline[] {
  const s = 1e5;
  const corner = (a: number, b: number): P3 => [0, 1, 2].map((i) => origin[i]! + u[i]! * a + v[i]! * b) as P3;
  const square = makePolygon([corner(-s, -s), corner(s, -s), corner(s, s), corner(-s, s)]);
  const cut = shape.intersect(square);
  const edges = cut.edges;
  try {
    return edges.map(outlineOf);
  } finally {
    // The section and its square are the worker's own: released here, not kept until the garbage collector.
    release(edges);
    cut.delete();
    square.delete();
  }
}
