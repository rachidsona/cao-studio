/**
 * Ouverture rapide : le modèle gardé dans le navigateur, nommé par la clé du document dont il a été calculé. La clé
 * change avec le modèle (et seulement lui), l'entrée d'une autre clé n'est pas montrée, les projets les plus anciens
 * s'en vont ; une question sur les corps montrés avant le premier calcul attend ce calcul dans le worker.
 */
import { describe, expect, it } from "vitest";
import { GeometryClient } from "../../frontend/src/geometry/client";
import { KEPT_PROJECTS, ModelCache, modelKey, type ModelStore } from "../../frontend/src/persistence/model-cache";
import type { BodyMesh } from "../../frontend/src/geometry/protocol";
import type { CadDocument } from "../../frontend/src/document/types";

const cabinet = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
const doc = (over: Partial<CadDocument> = {}, feature: Record<string, unknown> = cabinet): CadDocument =>
  ({ format: "cao-studio", schemaVersion: 2, units: "cm", parameters: {}, features: [feature], ...over }) as unknown as CadDocument;

function mapStore(): ModelStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (id) => structuredClone(data.get(id)),
    put: async (id, value) => void data.set(id, structuredClone(value)),
    delete: async (id) => void data.delete(id),
  };
}

const mesh = (bodyId: string): BodyMesh => ({
  bodyId, meshId: 7, vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]),
  faceGroups: [{ start: 0, count: 3, faceId: 0 }], edges: new Float32Array(6), edgeGroups: [{ start: 0, count: 2 }],
  metrics: { bbox: [[0, 0, 0], [1, 1, 0]] } as BodyMesh["metrics"],
});
const result = (ids: string[]) => ({ statuses: [{ id: "cb1", state: "ok" as const, reused: false, durationMs: 3 }], bodies: ids.map(mesh) });

describe("clé du modèle", () => {
  it("est la même pour le même document, quel que soit l'ordre de ses champs", () => {
    const reordered = Object.fromEntries(Object.entries(cabinet).reverse());
    expect(modelKey(doc())).toBe(modelKey(doc({}, reordered)));
  });

  it("change quand une cote, une opération ou une pièce supprimée change", () => {
    const base = modelKey(doc());
    expect(modelKey(doc({}, { ...cabinet, width: 601 }))).not.toBe(base);
    expect(modelKey(doc({ features: [cabinet, { ...cabinet, id: "cb2" }] } as never))).not.toBe(base);
    expect(modelKey(doc({ removedBodies: ["cb1#0"] }))).not.toBe(base);
  });

  it("ne change pas pour ce qui laisse le modèle tel quel (devis, vues, noms de corps)", () => {
    const base = modelKey(doc());
    expect(modelKey(doc({ views: [{ id: "v", name: "Vue" }], bodyNames: { cb1: "Bas" }, quotes: [] } as never))).toBe(base);
  });

  it("change avec la version de l'éditeur", () => {
    expect(modelKey(doc(), "a")).not.toBe(modelKey(doc(), "b"));
  });
});

describe("modèle gardé", () => {
  it("est relu pour la même clé, pas pour une autre (document changé)", async () => {
    const store = mapStore();
    const key = modelKey(doc());
    expect(await new ModelCache(store).write("p1", key, result(["cb1#0", "cb1#1"]))).toBe(true);
    const cache = new ModelCache(store);
    const entry = await cache.read("p1");
    const shown = cache.matching("p1", entry, key);
    expect(shown?.bodies.map((b) => b.bodyId)).toEqual(["cb1#0", "cb1#1"]);
    expect(shown?.bodies[0]!.vertices).toBeInstanceOf(Float32Array);
    expect(shown?.bodies[0]!.meshId).toBeUndefined();
    expect(shown?.statuses[0]!.state).toBe("ok");
    expect(cache.matching("p1", entry, modelKey(doc({}, { ...cabinet, height: 900 })))).toBeNull();
    expect(await cache.read("p2")).toBeNull();
  });

  it("le modèle montré n'est pas réécrit ; un modèle changé remplace l'ancien", async () => {
    const store = mapStore();
    const cache = new ModelCache(store);
    const key = modelKey(doc());
    await cache.write("p1", key, result(["cb1#0"]));
    cache.matching("p1", await cache.read("p1"), key);
    expect(await cache.write("p1", key, result(["cb1#0"]))).toBe(false);
    const changed = modelKey(doc({}, { ...cabinet, width: 800 }));
    expect(await cache.write("p1", changed, result(["cb1#0", "cb1#1", "cb1#2"]))).toBe(true);
    const entry = await cache.read("p1");
    expect(cache.matching("p1", entry, key)).toBeNull();
    expect(cache.matching("p1", entry, changed)?.bodies).toHaveLength(3);
  });

  it(`garde les ${KEPT_PROJECTS} projets calculés le plus récemment`, async () => {
    const store = mapStore();
    const cache = new ModelCache(store);
    for (let i = 0; i <= KEPT_PROJECTS; i++) {
      await cache.write(`p${i}`, `k${i}`, result(["cb1#0"]));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(await cache.read("p0")).toBeNull();
    expect(await cache.read(`p${KEPT_PROJECTS}`)).not.toBeNull();
    expect([...store.data.keys()].filter((k) => k !== "index")).toHaveLength(KEPT_PROJECTS);
  });

  it("un stockage absent, plein ou refusé ne fait qu'une ouverture sans cache", async () => {
    const broken: ModelStore = { get: () => Promise.reject(new Error("refusé")), put: () => Promise.reject(new Error("plein")), delete: () => Promise.resolve() };
    expect(await new ModelCache(broken).read("p1")).toBeNull();
    expect(await new ModelCache(broken).write("p1", "k", result(["cb1#0"]))).toBe(false);
    expect(await new ModelCache(null).read("p1")).toBeNull();
    expect(await new ModelCache(null).write("p1", "k", result(["cb1#0"]))).toBe(false);
  });
});

describe("questions sur les corps montrés avant le premier calcul", () => {
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    sent: { id: number; type: string; generation?: number }[] = [];
    postMessage(message: { id: number; type: string }) { this.sent.push(message); }
    terminate() {}
  }

  it("nomment le premier recalcul, auquel le worker répond d'abord (il répond dans l'ordre)", () => {
    const worker = new FakeWorker();
    const geometry = new GeometryClient(() => worker as unknown as Worker);
    // Nothing computed nor shown: as before, generation 0.
    void geometry.faceInfo("cb1#0", 0).catch(() => undefined);
    expect(worker.sent[0]!.generation).toBe(0);
    void geometry.recompute(doc()).catch(() => undefined);
    void geometry.faceInfo("cb1#0", 2).catch(() => undefined);
    void geometry.recompute(doc({}, { ...cabinet, width: 700 })).catch(() => undefined);
    void geometry.edgeInfo("cb1#0", 1).catch(() => undefined);
    expect(worker.sent.map((m) => [m.type, m.generation])).toEqual([
      ["faceInfo", 0], ["recompute", 1], ["faceInfo", 1], ["recompute", 2], ["edgeInfo", 1],
    ]);
  });
});
