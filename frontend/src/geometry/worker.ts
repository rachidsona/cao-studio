/**
 * Geometry worker: owns the OpenCascade kernel and the parametric history so
 * that B-rep computations never block the user interface.
 */
import { measureArea, type Shape3D } from "replicad";
import init from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { Recomputer } from "../history/recompute";
import { exportBodies } from "../io/exporters";
import { GeometryError, bodyMetrics, initKernel, isKernelReady } from "./kernel";
import type { BodyMesh, FaceInfo, RecomputeResponse, WorkerEnvelope, WorkerResponse } from "./protocol";

interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerEnvelope>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const recomputer = new Recomputer();
let visibleBodies: string[] = [];

async function ensureKernel(): Promise<void> {
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
    metrics: bodyMetrics(shape),
  };
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
