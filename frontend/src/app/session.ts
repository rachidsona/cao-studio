/**
 * Document session: current document, undo/redo, dirty tracking, local
 * recovery and saves to the Django API (manual and automatic).
 */
import type { CadDocument } from "../document/types";
import { UndoStack } from "../history/undo";
import { ApiError, saveOnExit, saveProject, type ProjectSnapshot } from "../persistence/api";
import { clearRecovery, writeRecovery } from "../persistence/recovery";

export type SaveState = "saved" | "modified" | "saving" | "offline" | "conflict";

const AUTOSAVE_DELAY_MS = 4000;

export class DocumentSession {
  readonly undo = new UndoStack();
  private savedJson: string;
  private saving: Promise<void> | null = null;
  private autosaveTimer: number | undefined;
  state: SaveState = "saved";
  autosave = true;
  onStateChange: (state: SaveState, detail?: string) => void = () => {};

  constructor(
    private readonly projectId: string,
    private readonly apiUrl: string,
    public doc: CadDocument,
    public baseVersion: number,
  ) {
    this.savedJson = JSON.stringify(doc);
  }

  get dirty(): boolean {
    return JSON.stringify(this.doc) !== this.savedJson;
  }

  /** Applies a new document state as one undoable step. */
  apply(next: CadDocument): void {
    this.undo.push(this.doc);
    this.replace(next);
  }

  /** Replaces the document without recording an undo step (undo/redo/restore). */
  replace(next: CadDocument): void {
    this.doc = next;
    this.afterChange();
  }

  stepBack(): boolean {
    const previous = this.undo.undo(this.doc);
    if (!previous) return false;
    this.replace(previous);
    return true;
  }

  stepForward(): boolean {
    const next = this.undo.redo(this.doc);
    if (!next) return false;
    this.replace(next);
    return true;
  }

  private afterChange(): void {
    if (!this.dirty) {
      clearRecovery(this.projectId);
      this.setState("saved");
      return;
    }
    writeRecovery(this.projectId, this.doc, this.baseVersion);
    if (this.state !== "conflict") this.setState("modified");
    window.clearTimeout(this.autosaveTimer);
    if (this.autosave && this.state !== "conflict") {
      // Failures are already reported through onStateChange.
      this.autosaveTimer = window.setTimeout(
        () => void this.save("Enregistrement automatique").catch(() => undefined),
        AUTOSAVE_DELAY_MS,
      );
    }
  }

  /** Saves the current document as a new server version. */
  async save(message = ""): Promise<void> {
    window.clearTimeout(this.autosaveTimer);
    if (this.saving) await this.saving;
    if (!this.dirty || this.state === "conflict") return;
    this.saving = this.doSave(message).finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  private async doSave(message: string): Promise<void> {
    const json = JSON.stringify(this.doc);
    this.setState("saving");
    try {
      const snapshot: ProjectSnapshot = await saveProject(this.apiUrl, this.doc, this.baseVersion, message);
      this.baseVersion = snapshot.version;
      this.savedJson = json;
      if (this.dirty) {
        // Edited while the request was in flight: keep the newer local copy.
        writeRecovery(this.projectId, this.doc, this.baseVersion);
        this.setState("modified");
      } else {
        clearRecovery(this.projectId);
        this.setState("saved", `Version ${snapshot.version} enregistrée`);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = Number(error.payload.current_version);
        this.setState("conflict", `Le projet a été modifié ailleurs (version ${current}). Vos modifications sont conservées localement.`);
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("offline", `Échec de l'enregistrement : ${detail}. Copie locale conservée.`);
      }
      throw error;
    }
  }

  /** Called when the page is hidden or closed: pushes pending changes without waiting. */
  flushOnExit(): void {
    window.clearTimeout(this.autosaveTimer);
    if (!this.autosave || !this.dirty || this.saving || this.state === "conflict") return;
    saveOnExit(this.apiUrl, this.doc, this.baseVersion);
  }

  private setState(state: SaveState, detail?: string): void {
    this.state = state;
    this.onStateChange(state, detail);
  }
}
