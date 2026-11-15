/**
 * The last computed model of each project, kept in the browser (IndexedDB) so that opening it again shows its bodies at
 * once, while the 3D kernel starts and recomputes in the background; the exact computation then replaces them.
 *
 * An entry is the meshes and statuses of one recompute, named by the key of the document it was computed from: its
 * operations exactly as the kernel receives them (hardware and gorges stamped in) and the build of the editor. Any
 * change of the model, of the catalogue it reads or of the editor's code gives another key, and the entry is not shown.
 * Best effort: a missing, full or refused storage only means a slower opening.
 */
import { canonicalJson } from "../document/canonical";
import type { CadDocument } from "../document/types";
import type { FeatureStatus } from "../history/recompute";
import type { BodyMesh, RecomputeResponse } from "../geometry/protocol";

/** Bump when the stored shape changes. */
const FORMAT = 1;
/** The editor's build: its bundle's address changes with its code, the kernel's code included (geometry/client.ts). */
const BUILD = `${FORMAT}:${import.meta.url}`;
/** Projects kept: the most recently computed ones. */
export const KEPT_PROJECTS = 12;

export interface CachedModel {
  key: string;
  statuses: FeatureStatus[];
  bodies: BodyMesh[];
  savedAt: number;
}

/** Where the entries live: IndexedDB in the browser, a Map in the tests. */
export interface ModelStore {
  get(id: string): Promise<unknown>;
  put(id: string, value: unknown): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Two 32-bit hashes of a string (FNV-1a and a multiplicative one) and its length: a 64-bit key, enough for one entry per project. */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}-${text.length.toString(36)}`;
}

/**
 * Key of a document as the kernel receives it (geometry/client.ts kernelDocument), for this build of the editor: what
 * the model is made of (history/recompute.ts reads its operations and the pieces deleted on their own), not its
 * quotes, views, names or drawings, which leave the model as it is.
 */
export function modelKey(kernelDoc: Pick<CadDocument, "features" | "removedBodies">, build = BUILD): string {
  return hash(`${build}|${canonicalJson({ features: kernelDoc.features, removedBodies: kernelDoc.removedBodies ?? [] })}`);
}

const INDEX = "index";

export class ModelCache {
  /** The key of the model last read or written per project: the same model is not written again. */
  private known = new Map<string, string>();

  constructor(private readonly store: ModelStore | null) {}

  /** What is kept for a project, whatever its key: read while the document loads, then checked with `matching`. */
  async read(projectId: string): Promise<CachedModel | null> {
    try {
      const entry = (await this.store?.get(projectId)) as CachedModel | undefined;
      return entry && typeof entry.key === "string" && Array.isArray(entry.bodies) && Array.isArray(entry.statuses) ? entry : null;
    } catch {
      return null;
    }
  }

  /** The entry read, if it was computed from the document of this key (else nothing is shown from it). */
  matching(projectId: string, entry: CachedModel | null, key: string): CachedModel | null {
    if (!entry || entry.key !== key) return null;
    this.known.set(projectId, key);
    return entry;
  }

  /** Keeps a project's model, computed from the document of this key; the oldest projects past KEPT_PROJECTS go. True when written. */
  async write(projectId: string, key: string, result: Pick<RecomputeResponse, "statuses" | "bodies">): Promise<boolean> {
    if (!this.store || this.known.get(projectId) === key) return false;
    this.known.set(projectId, key);
    const entry: CachedModel = { key, statuses: result.statuses, bodies: result.bodies.map(stripMeshId), savedAt: Date.now() };
    try {
      await this.store.put(projectId, entry);
      const index = { ...((await this.store.get(INDEX)) as Record<string, number> | undefined), [projectId]: entry.savedAt };
      const order = Object.entries(index).sort(([, a], [, b]) => b - a);
      for (const [old] of order.slice(KEPT_PROJECTS)) {
        await this.store.delete(old);
        delete index[old];
      }
      await this.store.put(INDEX, index);
      return true;
    } catch {
      // Storage full or refused: the next opening recomputes, as without the cache.
      this.known.delete(projectId);
      return false;
    }
  }
}

/** The worker's tessellation number means nothing in another page (geometry/client.ts known meshes). */
function stripMeshId({ meshId: _meshId, ...mesh }: BodyMesh): BodyMesh {
  return mesh;
}

/** The browser's store: one IndexedDB database, one object store; null where IndexedDB is missing or refused. */
export function browserStore(name = "cao-studio-models"): ModelStore | null {
  if (typeof indexedDB === "undefined") return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("models");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB bloquée"));
    }));
  const run = <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) =>
    db().then(
      (base) =>
        new Promise<T>((resolve, reject) => {
          const transaction = base.transaction("models", mode);
          const request = act(transaction.objectStore("models"));
          transaction.oncomplete = () => resolve(request.result);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }),
    );
  return {
    get: (id) => run("readonly", (s) => s.get(id)),
    put: (id, value) => run("readwrite", (s) => s.put(value, id)).then(() => undefined),
    delete: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
  };
}
