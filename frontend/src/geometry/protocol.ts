/** Messages exchanged between the editor (main thread) and the geometry worker. */
import type { CadDocument, EdgeRef, FaceRef } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import type { ExportFormat } from "../io/exporters";
import type { BodyMetrics } from "./kernel";

export type WorkerRequest =
  | { type: "init" }
  | { type: "recompute"; doc: CadDocument }
  | { type: "export"; format: ExportFormat; names: Record<string, string> }
  | { type: "faceInfo"; bodyId: string; faceIndex: number }
  | { type: "edgeInfo"; bodyId: string; edgeIndex: number }
  /** Persistent references for edges / a face picked on a body (topological naming). */
  | { type: "describe"; bodyId: string; edges: number[]; face?: number }
  /** Mesh of any body of the last recompute, including intermediate (consumed) ones. */
  | { type: "mesh"; bodyId: string };

export interface BodyMesh {
  bodyId: string;
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Triangle ranges (in index units) per B-rep face, in face order. */
  faceGroups: { start: number; count: number; faceId: number }[];
  edges: Float32Array;
  /** Vertex ranges (in vertex units of `edges`) per B-rep edge, in edge order. */
  edgeGroups: { start: number; count: number }[];
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

export interface EdgeInfo {
  bodyId: string;
  edgeIndex: number;
  /** OpenCascade curve type: LINE, CIRCLE… */
  curve: string;
  length: number;
  /** Radius for circular edges (full circles and arcs). */
  radius?: number;
}

export interface DescribeResponse {
  edges: EdgeRef[];
  face?: FaceRef;
}

export interface ExportResponse {
  blob: Blob;
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type WorkerEnvelope = WorkerRequest & { id: number };
