/**
 * Geometry worker: owns the OpenCascade kernel and the parametric history so
 * that B-rep computations never block the user interface.
 */
import { makePolygon, measureArea, type Edge, type Shape3D } from "replicad";
import init from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { initSolver } from "../constraints/solver";
import { Recomputer } from "../history/recompute";
import { exportBodies } from "../io/exporters";
import { readWithProgress } from "./download";
import { fontBytes } from "./font";
import { loadTextFont, textFontReady } from "../features/text";
import { GeometryError, bodyMetrics, initKernel, isKernelReady } from "./kernel";
import { offsetPaths } from "./offset";
import { seamEdges } from "./seams";
import { describeEdge, describeFace } from "./references";
import type { BodyMesh, DescribeResponse, EdgeInfo, EdgeOutline, FaceInfo, FaceOutline, OutlineEdge, P3, RecomputeResponse, WorkerEnvelope, WorkerResponse } from "./protocol";

interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerEnvelope>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const recomputer = new Recomputer();
let visibleBodies: string[] = [];

async function ensureKernel(requestId: number): Promise<void> {
  await initSolver({ locateFile: () => gcsWasmUrl });
  if (isKernelReady()) return;
  // The kernel is downloaded here (not by the module loader) so its progress reaches the loading screen.
  let last = 0;
  const wasmBinary = await readWithProgress(await fetch(wasmUrl), OC_WASM_BYTES, (loaded, total) => {
    if (loaded - last < 256 * 1024 && loaded < total) return;
    last = loaded;
    scope.postMessage({ id: requestId, progress: { loaded, total } });
  });
  const oc = await (init as (options: object) => ReturnType<typeof init>)({ locateFile: () => wasmUrl, wasmBinary });
  initKernel(oc);
}

function solid(bodyId: string): Shape3D {
  const output = recomputer.output(bodyId);
  if (!output || output.kind !== "solid") throw new GeometryError(`Corps « ${bodyId} » introuvable.`);
  return output.shape;
}

function meshBody(bodyId: string): BodyMesh {
  const shape = solid(bodyId);
  const mesh = shape.mesh({ tolerance: 0.02, angularTolerance: 0.15 });
  const edges = shape.meshEdges({ tolerance: 0.02, angularTolerance: 0.15 });
  return {
    bodyId,
    vertices: Float32Array.from(mesh.vertices),
    normals: Float32Array.from(mesh.normals),
    indices: Uint32Array.from(mesh.triangles),
    faceGroups: mesh.faceGroups,
    edges: Float32Array.from(edges.lines),
    edgeGroups: edges.edgeGroups.map(({ start, count }) => ({ start, count })),
    seams: seamEdges(shape),
    metrics: bodyMetrics(shape),
  };
}

/** Radius of the circle through three points (circular edges). */
function circumradius(a: number[], b: number[], c: number[]): number {
  const ab = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  const bc = Math.hypot(b[0]! - c[0]!, b[1]! - c[1]!, b[2]! - c[2]!);
  const ca = Math.hypot(c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!);
  const s = (ab + bc + ca) / 2;
  const area = Math.sqrt(Math.max(s * (s - ab) * (s - bc) * (s - ca), 0));
  return area > 1e-12 ? (ab * bc * ca) / (4 * area) : 0;
}

function edgeInfo(bodyId: string, edgeIndex: number): EdgeInfo {
  const edge = solid(bodyId).edges[edgeIndex];
  if (!edge) throw new GeometryError(`Arête ${edgeIndex} introuvable.`);
  const info: EdgeInfo = { bodyId, edgeIndex, curve: edge.geomType, length: edge.length };
  if (edge.geomType === "CIRCLE") {
    const p = (t: number) => {
      const v = edge.pointAt(t);
      return [v.x, v.y, v.z];
    };
    info.radius = circumradius(p(0), p(1 / 3), p(2 / 3));
  }
  return info;
}

/** Centre of the circle through three 3D points. */
function circumcentre(a: number[], b: number[], c: number[]): [number, number, number] {
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
function outlineEdges(edge: Edge): OutlineEdge[] {
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
function edgeOutline(bodyId: string, edgeIndex: number): EdgeOutline {
  const edge = solid(bodyId).edges[edgeIndex];
  if (!edge) throw new GeometryError(`Arête ${edgeIndex} introuvable.`);
  const samples = Array.from({ length: 9 }, (_, i) => {
    const v = edge.pointAt(i / 8);
    return [v.x, v.y, v.z] as [number, number, number];
  });
  return { edges: outlineEdges(edge), samples };
}

/** Every edge of a body (« Projeter » with Maj: the whole body). */
function bodyOutline(bodyId: string): EdgeOutline[] {
  return solid(bodyId).edges.map((_, i) => edgeOutline(bodyId, i));
}

/** Where a plane cuts a body (« Intersection »): the edges of the part of a large square of the plane inside it. */
function sectionOutline(bodyId: string, origin: P3, u: P3, v: P3): EdgeOutline[] {
  const s = 1e5;
  const corner = (a: number, b: number): P3 => [0, 1, 2].map((i) => origin[i]! + u[i]! * a + v[i]! * b) as P3;
  const cut = solid(bodyId).intersect(makePolygon([corner(-s, -s), corner(s, -s), corner(s, s), corner(-s, s)]));
  return cut.edges.map((edge) => ({
    edges: outlineEdges(edge),
    samples: Array.from({ length: 9 }, (_, i) => {
      const p = edge.pointAt(i / 8);
      return [p.x, p.y, p.z] as P3;
    }),
  }));
}

function faceOutline(bodyId: string, faceIndex: number): FaceOutline {
  const face = solid(bodyId).faces[faceIndex];
  if (!face) throw new GeometryError(`Face ${faceIndex} introuvable.`);
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

function faceInfo(bodyId: string, faceIndex: number): FaceInfo {
  const face = solid(bodyId).faces[faceIndex];
  if (!face) throw new GeometryError(`Face ${faceIndex} introuvable.`);
  return { bodyId, faceIndex, surface: face.geomType, area: measureArea(face) };
}

async function handle(request: WorkerEnvelope): Promise<{ result: unknown; transfer: Transferable[] }> {
  await ensureKernel(request.id);
  // The download and start of the kernel do not count in the request's time limit.
  scope.postMessage({ id: request.id, started: true });
  switch (request.type) {
    case "init":
      return { result: true, transfer: [] };
    case "recompute": {
      // Texts need the font in the kernel: loaded the first time a document has some.
      if (!textFontReady() && request.doc.features.some((f) => f.type === "sketch" && f.texts?.length)) await loadTextFont(await fontBytes());
      const started = performance.now();
      const { statuses, bodies } = recomputer.recompute(request.doc);
      visibleBodies = bodies;
      const meshes = bodies.map(meshBody);
      const response: RecomputeResponse = { statuses, bodies: meshes, durationMs: performance.now() - started };
      const transfer = meshes.flatMap((m) => [m.vertices.buffer, m.normals.buffer, m.indices.buffer, m.edges.buffer]);
      return { result: response, transfer };
    }
    case "export": {
      const bodies = visibleBodies.map((id) => ({ name: request.names[id] ?? id, shape: solid(id) }));
      return { result: { blob: exportBodies(bodies, request.format) }, transfer: [] };
    }
    case "faceInfo":
      return { result: faceInfo(request.bodyId, request.faceIndex), transfer: [] };
    case "edgeInfo":
      return { result: edgeInfo(request.bodyId, request.edgeIndex), transfer: [] };
    case "faceOutline":
      return { result: faceOutline(request.bodyId, request.faceIndex), transfer: [] };
    case "edgeOutline":
      return { result: edgeOutline(request.bodyId, request.edgeIndex), transfer: [] };
    case "bodyOutline":
      return { result: bodyOutline(request.bodyId), transfer: [] };
    case "sectionOutline":
      return { result: sectionOutline(request.bodyId, request.origin, request.u, request.v), transfer: [] };
    case "describe": {
      const shape = solid(request.bodyId);
      const all = shape.edges;
      const edges = request.edges.map((i) => {
        const edge = all[i];
        if (!edge) throw new GeometryError(`Arête ${i} introuvable.`);
        return describeEdge(shape, edge);
      });
      const faceShape = request.face === undefined ? undefined : shape.faces[request.face];
      if (request.face !== undefined && !faceShape) throw new GeometryError(`Face ${request.face} introuvable.`);
      const result: DescribeResponse = { edges, ...(faceShape ? { face: describeFace(shape, faceShape) } : {}) };
      return { result, transfer: [] };
    }
    case "offset":
      return { result: offsetPaths(request.paths, request.distance, request.join), transfer: [] };
    case "mesh": {
      const mesh = meshBody(request.bodyId);
      return { result: mesh, transfer: [mesh.vertices.buffer, mesh.normals.buffer, mesh.indices.buffer, mesh.edges.buffer] };
    }
  }
}

// Requests are processed strictly in order: the kernel is single-threaded.
let queue = Promise.resolve();
scope.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      const { result, transfer } = await handle(request);
      scope.postMessage({ id: request.id, ok: true, result }, transfer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scope.postMessage({ id: request.id, ok: false, error: message });
    }
  });
};
