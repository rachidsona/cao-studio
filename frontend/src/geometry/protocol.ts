/** Messages exchanged between the editor (main thread) and the geometry worker. */
import type { CadDocument } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import type { ExportFormat } from "../io/exporters";
import type { BodyMetrics } from "./kernel";

export type WorkerRequest =
  | { type: "init" }
  | { type: "recompute"; doc: CadDocument }
  | { type: "export"; format: ExportFormat; names: Record<string, string> }
  | { type: "faceInfo"; bodyId: string; faceIndex: number };

export interface BodyMesh {
  bodyId: string;
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Triangle ranges (in index units) per B-rep face, in face order. */
  faceGroups: { start: number; count: number; faceId: number }[];
  edges: Float32Array;
  metrics: BodyMetrics;
}

export interface RecomputeResponse {
  statuses: FeatureStatus[];
  bodies: BodyMesh[];
  durationMs: number;
}

export interface FaceInfo {
  bodyId: string;
  faceIndex: number;
  surface: string;
  area: number;
}

export interface ExportResponse {
  blob: Blob;
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type WorkerEnvelope = WorkerRequest & { id: number };
