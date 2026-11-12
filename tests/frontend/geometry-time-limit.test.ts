/**
 * Le délai du noyau 3D (audit de sécurité du 10/11/2026, constat L6) : un calcul plus long que sa limite arrête le
 * worker, fait échouer ce qui attendait et en démarre un nouveau ; le chargement du noyau ne compte pas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeometryClient, TIME_LIMITS } from "../../frontend/src/geometry/client";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: { id: number; type: string }[] = [];
  terminated = false;
  postMessage(message: { id: number; type: string }) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}

let workers: FakeWorker[];
const w = (i: number): FakeWorker => workers[i]!;
const client = () => new GeometryClient(() => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; });

beforeEach(() => { workers = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("délai du noyau 3D", () => {
  it("un recalcul trop long arrête le worker, fait échouer les demandes en attente et en démarre un nouveau", async () => {
    const geometry = client();
    const restarted = vi.fn();
    geometry.onRestart = restarted;
    const long = geometry.recompute({ format: "cao-studio", schemaVersion: 2, units: "cm", parameters: {}, features: [] } as never);
    const waiting = geometry.faceInfo("b1", 0);
    const recompute = w(0).sent[0]!;
    const face = w(0).sent[1]!;
    // The kernel loads for a long time: that does not count.
    vi.advanceTimersByTime((TIME_LIMITS.recompute ?? 0) * 2000);
    expect(workers).toHaveLength(1);
    w(0).reply({ id: recompute.id, started: true });
    vi.advanceTimersByTime((TIME_LIMITS.recompute ?? 0) * 1000 - 1);
    expect(w(0).terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(w(0).terminated).toBe(true);
    await expect(long).rejects.toThrow(/plus de 90 s.*Ctrl\+Z/);
    await expect(waiting).rejects.toThrow("Le noyau 3D a redémarré");
    expect(face.type).toBe("faceInfo");
    expect(workers).toHaveLength(2);
    expect(restarted).toHaveBeenCalledOnce();
    // The new worker answers the next requests.
    const next = geometry.init();
    const init = w(1).sent[0]!;
    w(1).reply({ id: init.id, started: true });
    w(1).reply({ id: init.id, ok: true, result: true });
    await expect(next).resolves.toBe(true);
  });

  it("un calcul fini à temps ne laisse aucun délai courir", async () => {
    const geometry = client();
    const done = geometry.offset([], 1, "round");
    const request = w(0).sent[0]!;
    w(0).reply({ id: request.id, started: true });
    w(0).reply({ id: request.id, ok: true, result: { paths: [] } });
    await expect(done).resolves.toEqual({ paths: [] });
    vi.advanceTimersByTime(TIME_LIMITS.other * 10_000);
    expect(w(0).terminated).toBe(false);
  });

  it("le démarrage du noyau (init) n'a pas de limite", () => {
    const geometry = client();
    void geometry.init();
    w(0).reply({ id: w(0).sent[0]!.id, started: true });
    vi.advanceTimersByTime(3_600_000);
    expect(w(0).terminated).toBe(false);
  });
});

describe("questions sur les corps d'un recalcul", () => {
  it("portent le numéro du recalcul montré ; un recalcul en attente ne change pas ce numéro avant sa réponse", async () => {
    const geometry = client();
    const first = geometry.recompute({ format: "cao-studio", schemaVersion: 2, units: "cm", parameters: {}, features: [] } as never);
    const r1 = w(0).sent[0]! as { id: number; generation?: number };
    expect(r1.generation).toBe(1);
    w(0).reply({ id: r1.id, started: true });
    w(0).reply({ id: r1.id, ok: true, result: { statuses: [], bodies: [], durationMs: 1 } });
    await first;
    void geometry.recompute({ format: "cao-studio", schemaVersion: 2, units: "cm", parameters: {}, features: [] } as never);
    void geometry.faceInfo("b1", 3);
    void geometry.offset([], 1, "round");
    const [r2, face, offset] = w(0).sent.slice(1) as { type: string; generation?: number }[];
    expect(r2!.generation).toBe(2);
    // Asked while the second is computing: about the bodies shown, those of the first.
    expect(face!.generation).toBe(1);
    expect(offset!.generation).toBeUndefined();
  });
});

describe("maillages gardés entre deux recalculs", () => {
  it("le client dit au noyau les maillages qu'il a, et garde le même objet pour un corps inchangé", async () => {
    const geometry = client();
    const doc = { format: "cao-studio", schemaVersion: 2, units: "cm", parameters: {}, features: [] } as never;
    const mesh = (bodyId: string, meshId: number) => ({ bodyId, meshId, vertices: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), edges: new Float32Array(), faceGroups: [], edgeGroups: [], metrics: { bbox: [[0, 0, 0], [1, 1, 1]], volume: 1, area: 6 } });
    const first = geometry.recompute(doc);
    const r1 = w(0).sent[0]! as { id: number; known?: Record<string, number> };
    expect(r1.known).toEqual({});
    w(0).reply({ id: r1.id, started: true });
    w(0).reply({ id: r1.id, ok: true, result: { statuses: [], bodies: [mesh("a", 1), mesh("b", 2)], durationMs: 1 } });
    const one = await first;
    const second = geometry.recompute(doc);
    const r2 = w(0).sent[1]! as { id: number; known?: Record<string, number> };
    expect(r2.known).toEqual({ a: 1, b: 2 });
    w(0).reply({ id: r2.id, started: true });
    w(0).reply({ id: r2.id, ok: true, result: { statuses: [], bodies: [{ bodyId: "a", meshId: 1, same: true }, mesh("b", 3)], durationMs: 1 } });
    const two = await second;
    expect(two.bodies.map((b) => b.bodyId)).toEqual(["a", "b"]);
    // The unchanged body is the very same object: the view keeps its geometry.
    expect(two.bodies[0]).toBe(one.bodies[0]);
    expect(two.bodies[1]).not.toBe(one.bodies[1]);
  });
});
