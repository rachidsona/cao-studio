/** Promise-based proxy to the geometry worker, used by the editor on the main thread. */
import type { CadDocument } from "../document/types";
import type { ExportFormat } from "../io/exporters";
import type { ExportResponse, FaceInfo, RecomputeResponse, WorkerEnvelope, WorkerRequest, WorkerResponse } from "./protocol";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class GeometryClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
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
    return this.call({ type: "recompute", doc });
  }

  async export(format: ExportFormat, names: Record<string, string>): Promise<Blob> {
    const response = await this.call<ExportResponse>({ type: "export", format, names });
    return response.blob;
  }

  faceInfo(bodyId: string, faceIndex: number): Promise<FaceInfo> {
    return this.call({ type: "faceInfo", bodyId, faceIndex });
  }
}
