/** Promise-based proxy to the geometry worker, used by the editor on the main thread. */
import { stampHardware } from "../document/hardware-catalog";
import type { CadDocument } from "../document/types";
import type { ExportFormat } from "../io/exporters";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "./offset";
import type { BodyMesh, DescribeResponse, EdgeInfo, EdgeOutline, ExportResponse, P3, FaceOutline, FaceInfo, RecomputeResponse, WorkerEnvelope, WorkerRequest, WorkerResponse } from "./protocol";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class GeometryClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Download of the kernel (bytes), while it starts. */
  onProgress: (loaded: number, total: number) => void = () => {};

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if ("progress" in message) {
        this.onProgress(message.progress.loaded, message.progress.total);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(`Le worker géométrique a échoué : ${event.message}`);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  private call<T>(request: WorkerRequest): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ ...request, id } satisfies WorkerEnvelope);
    });
  }

  init(): Promise<boolean> {
    return this.call({ type: "init" });
  }

  recompute(doc: CadDocument): Promise<RecomputeResponse> {
    // The chosen hardware's sizes go into the fronts and doors it drills.
    return this.call({ type: "recompute", doc: stampHardware(doc) });
  }

  async export(format: ExportFormat, names: Record<string, string>): Promise<Blob> {
    const response = await this.call<ExportResponse>({ type: "export", format, names });
    return response.blob;
  }

  faceInfo(bodyId: string, faceIndex: number): Promise<FaceInfo> {
    return this.call({ type: "faceInfo", bodyId, faceIndex });
  }

  edgeInfo(bodyId: string, edgeIndex: number): Promise<EdgeInfo> {
    return this.call({ type: "edgeInfo", bodyId, edgeIndex });
  }

  faceOutline(bodyId: string, faceIndex: number): Promise<FaceOutline> {
    return this.call({ type: "faceOutline", bodyId, faceIndex });
  }

  edgeOutline(bodyId: string, edgeIndex: number): Promise<EdgeOutline> {
    return this.call({ type: "edgeOutline", bodyId, edgeIndex });
  }

  bodyOutline(bodyId: string): Promise<EdgeOutline[]> {
    return this.call({ type: "bodyOutline", bodyId });
  }

  sectionOutline(bodyId: string, origin: P3, u: P3, v: P3): Promise<EdgeOutline[]> {
    return this.call({ type: "sectionOutline", bodyId, origin, u, v });
  }

  describe(bodyId: string, edges: number[], face?: number): Promise<DescribeResponse> {
    return this.call({ type: "describe", bodyId, edges, ...(face === undefined ? {} : { face }) });
  }

  offset(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome> {
    return this.call({ type: "offset", paths, distance, join });
  }

  mesh(bodyId: string): Promise<BodyMesh> {
    return this.call({ type: "mesh", bodyId });
  }
}
