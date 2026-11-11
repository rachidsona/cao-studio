/** Promise-based proxy to the geometry worker, used by the editor on the main thread. */
import { stampHardware } from "../document/hardware-catalog";
import type { CadDocument } from "../document/types";
import type { ExportFormat } from "../io/exporters";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "./offset";
import { BODY_QUESTIONS, type BodyMesh, type DescribeResponse, type EdgeInfo, type EdgeOutline, type ExportResponse, type P3, type FaceOutline, type FaceInfo, type RecomputeResponse, type WorkerEnvelope, type WorkerRequest, type WorkerResponse } from "./protocol";

type Pending = { type: WorkerRequest["type"]; resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> };

/**
 * How long one request may compute, in seconds, from when the kernel begins it (audit of 10/11/2026, L6). OpenCascade
 * cannot be interrupted: past this, the worker is stopped and a new one started, so that a document which never ends
 * (a huge pattern, a boolean that loops) does not freeze the editor for good. Far above a real project's times.
 */
export const TIME_LIMITS: Partial<Record<WorkerRequest["type"], number>> & { other: number } = { init: 0, recompute: 90, export: 180, other: 30 };

const limitOf = (type: WorkerRequest["type"]) => TIME_LIMITS[type] ?? TIME_LIMITS.other;

export class GeometryClient {
  private worker!: Worker;
  private nextId = 1;
  /** Recomputes asked, and the last one answered: the bodies the editor shows (protocol.ts, WorkerEnvelope). */
  private sent = 0;
  private shown = 0;
  private pending = new Map<number, Pending>();
  /** Download of the kernel (bytes), while it starts. */
  onProgress: (loaded: number, total: number) => void = () => {};
  /** The worker was stopped after a too long computation, and a new one started (its kernel loads on next use). */
  onRestart: (message: string) => void = () => {};

  constructor(private readonly makeWorker: () => Worker = () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })) {
    this.start();
  }

  private start(): void {
    this.worker = this.makeWorker();
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if ("progress" in message) {
        this.onProgress(message.progress.loaded, message.progress.total);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      if ("started" in message) {
        const seconds = limitOf(entry.type);
        if (seconds > 0) entry.timer = setTimeout(() => this.restart(message.id, seconds), seconds * 1000);
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    };
    this.worker.onerror = (event) => this.failAll(new Error(`Le worker géométrique a échoué : ${event.message}`));
  }

  private failAll(error: Error, first?: { id: number; error: Error }): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(id === first?.id ? first.error : error);
    }
    this.pending.clear();
  }

  /** The request `id` computes for too long: the worker is stopped, every waiting request fails, a new one starts. */
  private restart(id: number, seconds: number): void {
    this.worker.terminate();
    const message = `Le calcul a duré plus de ${seconds} s : il est arrêté et le noyau 3D redémarre. Si la dernière modification en est la cause, annulez-la (Ctrl+Z).`;
    this.failAll(new Error("Le noyau 3D a redémarré : relancez l'opération."), { id, error: new Error(message) });
    this.sent = this.shown = 0;
    this.start();
    this.onRestart(message);
  }

  private call<T>(request: WorkerRequest, generation?: number): Promise<T> {
    const id = this.nextId++;
    // A question about the bodies names the recompute whose bodies are shown: the worker refuses it after a newer one.
    const tag = generation ?? (BODY_QUESTIONS.has(request.type) ? this.shown : undefined);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { type: request.type, resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ ...request, id, ...(tag === undefined ? {} : { generation: tag }) } satisfies WorkerEnvelope);
    });
  }

  init(): Promise<boolean> {
    return this.call({ type: "init" });
  }

  async recompute(doc: CadDocument): Promise<RecomputeResponse> {
    // The chosen hardware's sizes go into the fronts and doors it drills.
    const generation = ++this.sent;
    const result = await this.call<RecomputeResponse>({ type: "recompute", doc: stampHardware(doc) }, generation);
    this.shown = Math.max(this.shown, generation);
    return result;
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
