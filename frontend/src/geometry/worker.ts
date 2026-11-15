/**
 * Geometry worker: owns the OpenCascade kernel and the parametric history so
 * that B-rep computations never block the user interface.
 */
import { measureArea, type Shape3D } from "replicad";
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
import { describeEdge, describeFace, resolveFace } from "./references";
import { outlineOf, outlineOfFace, sectionOf } from "./outlines";
import { BODY_QUESTIONS, type BodyMesh, type DescribeResponse, type EdgeInfo, type EdgeOutline, type FaceInfo, type FaceOutline, type P3, type WireMesh, type WorkerEnvelope, type WorkerResponse } from "./protocol";

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

/**
 * The meshes of a recompute (audit of 11/11/2026): a body whose solid is the very one already tessellated (its operation
 * was reused from the cache) and whose mesh the editor holds is sent as « same » — not tessellated, measured and copied
 * again; the others are meshed anew. On a dressing of 200 boards, a change remeshes only what it changed.
 */
const meshCache = new Map<string, { shape: Shape3D; meshId: number; key: string }>();
let nextMeshId = 1;

function meshesOf(bodies: readonly string[], known: Record<string, number>): { wire: WireMesh[]; keys: Map<string, string> } {
  const wire: WireMesh[] = [];
  const keys = new Map<string, string>();
  for (const bodyId of bodies) {
    const shape = solid(bodyId);
    const cached = meshCache.get(bodyId);
    if (cached && cached.shape === shape && known[bodyId] === cached.meshId) {
      wire.push({ bodyId, meshId: cached.meshId, same: true });
      keys.set(bodyId, cached.key);
      continue;
    }
    const mesh = { ...meshBody(bodyId), meshId: nextMeshId++ };
    const key = shapeKey(mesh);
    meshCache.set(bodyId, { shape, meshId: mesh.meshId, key });
    keys.set(bodyId, key);
    wire.push(mesh);
  }
  for (const id of [...meshCache.keys()]) if (!keys.has(id)) meshCache.delete(id);
  return { wire, keys };
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

/** The kernel's wrappers of a list of edges or faces, released when read (they are not left to the garbage collector). */
function release(items: readonly { delete(): void }[]): void {
  for (const item of items) item.delete();
}

function edgeOutline(bodyId: string, edgeIndex: number): EdgeOutline {
  const edges = solid(bodyId).edges;
  try {
    const edge = edges[edgeIndex];
    if (!edge) throw new GeometryError(`Arête ${edgeIndex} introuvable.`);
    return outlineOf(edge);
  } finally {
    release(edges);
  }
}

/** Every edge of a body (« Projeter » with Maj: the whole body): its edges read once, not once per edge. */
function bodyOutline(bodyId: string): EdgeOutline[] {
  const edges = solid(bodyId).edges;
  try {
    return edges.map(outlineOf);
  } finally {
    release(edges);
  }
}

/** Where a plane cuts a body (« Intersection »): the edges of the part of a large square of the plane inside it. */
function sectionOutline(bodyId: string, origin: P3, u: P3, v: P3): EdgeOutline[] {
  return sectionOf(solid(bodyId), origin, u, v);
}

function faceOutline(bodyId: string, faceIndex: number): FaceOutline {
  const face = solid(bodyId).faces[faceIndex];
  if (!face) throw new GeometryError(`Face ${faceIndex} introuvable.`);
  return outlineOfFace(face);
}

function faceInfo(bodyId: string, faceIndex: number): FaceInfo {
  const face = solid(bodyId).faces[faceIndex];
  if (!face) throw new GeometryError(`Face ${faceIndex} introuvable.`);
  return { bodyId, faceIndex, surface: face.geomType, area: measureArea(face) };
}

/** The recompute whose bodies the worker holds (protocol.ts, WorkerEnvelope). */
let generation = 0;
/** For the last recomputes, what each body was (its numbers of faces and edges, its box): a question asked about an
 * older one is answered while its body stayed the same, and refused once the body changed. */
const shapes = new Map<number, Map<string, string>>();
const shapeKey = (m: BodyMesh) => [m.faceGroups.length, m.edgeGroups.length, ...m.metrics.bbox.flat().map((v) => Math.round(v * 100))].join(",");

async function handle(request: WorkerEnvelope): Promise<{ result: unknown; transfer: Transferable[] }> {
  await ensureKernel(request.id);
  // A question about the bodies of an older recompute: its face numbers would be other faces now.
  if (BODY_QUESTIONS.has(request.type) && request.generation !== undefined && request.generation !== generation && "bodyId" in request) {
    const then = shapes.get(request.generation)?.get(request.bodyId);
    if (then === undefined || then !== shapes.get(generation)?.get(request.bodyId)) {
      throw new GeometryError("Le modèle vient d'être recalculé : refaites la sélection.");
    }
  }
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
      const { wire, keys } = meshesOf(bodies, request.known ?? {});
      if (request.generation !== undefined) {
        generation = request.generation;
        shapes.set(generation, keys);
        for (const old of shapes.keys()) if (old < generation - 3) shapes.delete(old);
      }
      const response = { statuses, bodies: wire, durationMs: performance.now() - started };
      const transfer = wire.flatMap((m) => ("same" in m ? [] : [m.vertices.buffer, m.normals.buffer, m.indices.buffer, m.edges.buffer]));
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
    case "refOutline":
      return { result: outlineOfFace(resolveFace(solid(request.bodyId), request.ref)), transfer: [] };
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
