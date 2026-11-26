/**
 * Undo/redo over immutable document snapshots. Snapshots are serialized so a
 * later mutation of the live document can never corrupt the history.
 */
import type { CadDocument } from "../document/types";

export class UndoStack {
  private past: string[] = [];
  private future: string[] = [];

  constructor(private readonly limit = 200) {}

  /** Records the state *before* a change. */
  push(doc: CadDocument): void {
    this.past.push(JSON.stringify(doc));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: CadDocument): CadDocument | undefined {
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    this.future.push(JSON.stringify(current));
    return JSON.parse(previous) as CadDocument;
  }

  redo(current: CadDocument): CadDocument | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(JSON.stringify(current));
    return JSON.parse(next) as CadDocument;
  }

  /** The state before the last step (what a step set again in place is compared with). */
  get last(): CadDocument | undefined {
    const previous = this.past.at(-1);
    return previous === undefined ? undefined : (JSON.parse(previous) as CadDocument);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
