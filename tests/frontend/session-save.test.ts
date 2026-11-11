/**
 * L'enregistrement du projet (audit d'architecture du 11/11/2026) : après un échec réseau il réessaie seul, de plus en
 * plus espacé et dès le retour du réseau ; un conflit demande quoi faire, et « garder la mienne » l'enregistre par-dessus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveProject = vi.fn();
vi.mock("../../frontend/src/persistence/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public payload: Record<string, unknown>) {
      super(message);
    }
  },
  saveProject: (...args: unknown[]) => saveProject(...args),
  saveOnExit: () => true,
}));
vi.mock("../../frontend/src/persistence/recovery", () => ({ writeRecovery: () => undefined, clearRecovery: () => undefined }));

const { DocumentSession } = await import("../../frontend/src/app/session");
const { ApiError } = await import("../../frontend/src/persistence/api");
const { createReferencePlate } = await import("../../frontend/src/document/types");

const listeners = new Map<string, () => void>();
beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  vi.stubGlobal("window", { setTimeout, clearTimeout, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) });
  saveProject.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const changed = () => ({ ...createReferencePlate(), units: "mm" as const });

describe("enregistrement du projet", () => {
  it("après un échec réseau, il réessaie seul (5 s, puis 10 s) et dès le retour du réseau", async () => {
    const session = new DocumentSession("p", "/api/projects/p/", createReferencePlate(), 1);
    session.autosave = false;
    session.replace(changed());
    saveProject.mockRejectedValueOnce(new Error("réseau coupé"));
    await session.save().catch(() => undefined);
    expect(session.state).toBe("offline");
    saveProject.mockRejectedValueOnce(new Error("réseau coupé"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(saveProject).toHaveBeenCalledTimes(2);
    saveProject.mockResolvedValueOnce({ version: 2 });
    listeners.get("online")!();
    await vi.runOnlyPendingTimersAsync();
    expect(session.state).toBe("saved");
    expect(session.baseVersion).toBe(2);
  });

  it("un conflit demande quoi faire ; garder la mienne l'enregistre après la version du serveur", async () => {
    const session = new DocumentSession("p", "/api/projects/p/", createReferencePlate(), 1);
    session.autosave = false;
    const asked = vi.fn();
    session.onConflict = asked;
    session.replace(changed());
    saveProject.mockRejectedValueOnce(new ApiError("conflit", 409, { current_version: 5 }));
    await session.save().catch(() => undefined);
    expect(session.state).toBe("conflict");
    expect(asked).toHaveBeenCalledWith(5);
    saveProject.mockResolvedValueOnce({ version: 6 });
    await session.keepMine(5);
    expect(saveProject.mock.calls.at(-1)![2]).toBe(5);
    expect(session.state).toBe("saved");
    expect(session.baseVersion).toBe(6);
  });
});
