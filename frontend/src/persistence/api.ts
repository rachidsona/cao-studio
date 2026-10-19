/**
 * Client for the Django project API. Only whole-document saves are sent;
 * camera moves and edits in progress never reach the server.
 */
import type { CadDocument } from "../document/types";
import { parseDocument } from "../document/validate";

export interface ProjectSnapshot {
  id: string;
  name: string;
  version: number;
  document: CadDocument;
  checksum: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1] as string) : "";
}

async function request(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json", "X-CSRFToken": csrfToken() } : {}),
      ...init.headers,
    },
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error page: keep an empty payload.
  }
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Erreur serveur (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

function toSnapshot(payload: Record<string, unknown>): ProjectSnapshot {
  return {
    id: String(payload.id),
    name: String(payload.name),
    version: Number(payload.version),
    checksum: String(payload.checksum),
    document: parseDocument(payload.document),
  };
}

export async function loadProject(apiUrl: string): Promise<ProjectSnapshot> {
  return toSnapshot(await request(apiUrl));
}

export async function saveProject(
  apiUrl: string,
  doc: CadDocument,
  baseVersion: number,
  message = "",
): Promise<ProjectSnapshot> {
  const body = JSON.stringify({ document: doc, base_version: baseVersion, message });
  return toSnapshot(await request(apiUrl, { method: "PUT", body }));
}

/** Browsers cap keepalive request bodies at 64 KiB. */
export const KEEPALIVE_MAX_BYTES = 60 * 1024;

/**
 * Best-effort save while the page is being closed. The request outlives the
 * page (keepalive); its result cannot be observed, so the local recovery copy
 * is kept until the next load confirms the server state.
 */
export function saveOnExit(apiUrl: string, doc: CadDocument, baseVersion: number): boolean {
  const body = JSON.stringify({ document: doc, base_version: baseVersion, message: "Enregistrement à la fermeture" });
  if (new Blob([body]).size > KEEPALIVE_MAX_BYTES) return false;
  void fetch(apiUrl, {
    method: "PUT",
    body,
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRFToken": csrfToken() },
  }).catch(() => undefined);
  return true;
}
