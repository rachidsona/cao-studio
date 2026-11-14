/** Ce qu'on garde pour tous ses projets suit le compte : la copie du serveur prise à l'ouverture, chaque changement envoyé. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const sent: { key: string; value: string | null }[] = [];
let storage: MemoryStorage;

beforeAll(() => {
  vi.useFakeTimers();
  storage = new MemoryStorage();
  // The browser's: a storage whose prototype is the one patched, a cookie, a server.
  vi.stubGlobal("Storage", MemoryStorage);
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("document", { cookie: "csrftoken=abc" });
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "PUT") {
      sent.push({ key: decodeURIComponent(url.split("/")[3]!), value: (JSON.parse(init.body!) as { value: string | null }).value });
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({ data: { "cao.kitchen-own-units": '[{"name":"Du serveur"}]' } }) };
  });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("données gardées par le serveur", () => {
  it("prend la copie du serveur, envoie ce qu'il n'a pas, puis chaque changement d'une clé gardée", async () => {
    storage.setItem("cao.kitchen-own-units", '[{"name":"Ancien"}]');
    storage.setItem("cao.suppliers", '[{"name":"Panneaux du Sud"}]');
    storage.setItem("cao.units", "cm");
    const { startKeptData } = await import("../../frontend/src/persistence/kept-data");
    await startKeptData();
    // The server's wins; what it did not have goes to it; a setting of this screen stays here.
    expect(storage.getItem("cao.kitchen-own-units")).toBe('[{"name":"Du serveur"}]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([{ key: "cao.suppliers", value: '[{"name":"Panneaux du Sud"}]' }]);
    // Quick changes: the last one sent, once.
    storage.setItem("cao.kitchen-own-units", "[1]");
    storage.setItem("cao.kitchen-own-units", "[1,2]");
    storage.setItem("cao.units", "mm");
    storage.removeItem("cao.suppliers");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.slice(1)).toEqual([{ key: "cao.kitchen-own-units", value: "[1,2]" }, { key: "cao.suppliers", value: null }]);
  });
});
