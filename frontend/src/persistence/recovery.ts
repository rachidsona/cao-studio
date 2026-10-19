/**
 * Local crash recovery: the latest unsaved document is mirrored in
 * localStorage so it survives a closed tab or a lost connection.
 */
import type { CadDocument } from "../document/types";
import { validateDocument } from "../document/validate";

export interface RecoveryEntry {
  document: CadDocument;
  baseVersion: number;
  savedAt: string;
}

const key = (projectId: string) => `cao-studio:recovery:${projectId}`;

export function writeRecovery(projectId: string, document: CadDocument, baseVersion: number): void {
  const entry: RecoveryEntry = { document, baseVersion, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(key(projectId), JSON.stringify(entry));
  } catch {
    // Storage full or disabled (private mode): recovery is best effort.
  }
}

export function readRecovery(projectId: string): RecoveryEntry | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as RecoveryEntry;
    if (validateDocument(entry.document).length > 0 || !Number.isInteger(entry.baseVersion)) return null;
    return entry;
  } catch {
    return null;
  }
}

export function clearRecovery(projectId: string): void {
  try {
    localStorage.removeItem(key(projectId));
  } catch {
    // Ignore: nothing to clear.
  }
}
