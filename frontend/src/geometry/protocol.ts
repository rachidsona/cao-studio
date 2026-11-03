/** Messages exchanged between the editor (main thread) and the geometry worker. */
import type { CadDocument, EdgeRef, FaceRef } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import type { ExportFormat } from "../io/exporters";
import type { BodyMetrics } from "./kernel";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "./offset";

export type WorkerRequest =
  | { type: "init" }
  | { type: "recompute"; doc: CadDocument }
  | { type: "export"; format: ExportFormat; names: Record<string, string> }
  | { type: "faceInfo"; bodyId: string; faceIndex: number }
  | { type: "edgeInfo"; bodyId: string; edgeIndex: number }
  /** Boundary of a face (outer and inner loops), to project it into a sketch. */
  | { type: "faceOutline"; bodyId: string; faceIndex: number }
  /** One edge of a body, exactly (line, circle, arc), to project it into a sketch. */
  | { type: "edgeOutline"; bodyId: string; edgeIndex: number }
  /** Every edge of a body (« Projeter » the whole body). */
  | { type: "bodyOutline"; bodyId: string }
  /** Where the plane (origin, u, v) cuts a body (« Intersection »). */
  | { type: "sectionOutline"; bodyId: string; origin: P3; u: P3; v: P3 }
  /** Persistent references for edges / a face picked on a body (topological naming). */
  | { type: "describe"; bodyId: string; edges: number[]; face?: number }
  /** Mesh of any body of the last recompute, including intermediate (consumed) ones. */
  | { type: "mesh"; bodyId: string }
  /** Planar offset of sketch paths (signed distance, mm). */
  | { type: "offset"; paths: OffsetPath[]; distance: number; join: OffsetJoin };

export type { OffsetCurve, OffsetJoin, OffsetOutcome, OffsetPath } from "./offset";

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
  /** Edges between two coplanar faces (a board's face made of pieces): kept for picking, not drawn. */
  seams?: number[];
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

export type P3 = [number, number, number];

export type OutlineEdge =
  | { kind: "line"; a: P3; b: P3 }
  | { kind: "circle"; center: P3; radius: number }
  | { kind: "arc"; center: P3; radius: number; a: P3; b: P3; mid: P3 };

export interface FaceOutline {
  surface: string;
  center: P3;
  /** Outward unit normal. */
  normal: P3;
  edges: OutlineEdge[];
}

export interface EdgeOutline {
  edges: OutlineEdge[];
  /** Points along the edge, from its start to its end. */
  samples: P3[];
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
  | { id: number; ok: false; error: string }
  /** Download of the kernel, while "init" runs (bytes). */
  | { id: number; progress: { loaded: number; total: number } };

export type WorkerEnvelope = WorkerRequest & { id: number };
