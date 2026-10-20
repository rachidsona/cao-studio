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
import { GeometryError, bodyMetrics, initKernel, isKernelReady } from "./kernel";
import { describeEdge, describeFace } from "./references";
import type { BodyMesh, DescribeResponse, EdgeInfo, FaceInfo, RecomputeResponse, WorkerEnvelope, WorkerResponse } from "./protocol";

interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerEnvelope>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const recomputer = new Recomputer();
let visibleBodies: string[] = [];

async function ensureKernel(): Promise<void> {
  await initSolver({ locateFile: () => gcsWasmUrl });
  if (isKernelReady()) return;
  const oc = await init({ locateFile: () => wasmUrl });
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

function faceInfo(bodyId: string, faceIndex: number): FaceInfo {
  const face = solid(bodyId).faces[faceIndex];
  if (!face) throw new GeometryError(`Face ${faceIndex} introuvable.`);
  return { bodyId, faceIndex, surface: face.geomType, area: measureArea(face) };
}

async function handle(request: WorkerEnvelope): Promise<{ result: unknown; transfer: Transferable[] }> {
  await ensureKernel();
  switch (request.type) {
    case "init":
      return { result: true, transfer: [] };
    case "recompute": {
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
