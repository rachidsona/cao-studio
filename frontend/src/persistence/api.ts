/**
 * Client for the Django project API. Only whole-document saves are sent;
 * camera moves and edits in progress never reach the server.
 */
import type { CadDocument } from "../document/types";
import { openDocument } from "../document/validate";

export interface ProjectSnapshot {
  id: string;
  name: string;
  version: number;
  document: CadDocument;
  checksum: string;
  /** The operations switched off on opening, and why (document/validate.ts openDocument). */
  problems?: string[];
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

export async function loadProject(apiUrl: string): Promise<ProjectSnapshot> {
  const payload = await request(apiUrl);
  // Opened even with an operation the editor cannot use: it is switched off and said (audit of 11/11/2026).
  const { doc, problems } = openDocument(payload.document);
  return { id: String(payload.id), name: String(payload.name), version: Number(payload.version), checksum: String(payload.checksum), document: doc, problems };
}

export async function saveProject(
  apiUrl: string,
  doc: CadDocument,
  baseVersion: number,
  message = "",
): Promise<ProjectSnapshot> {
  const body = JSON.stringify({ document: doc, base_version: baseVersion, message });
  const payload = await request(apiUrl, { method: "PUT", body });
  // What was sent is what was kept: the answer is not parsed again (a check failing there left the save half done).
  return { id: String(payload.id), name: String(payload.name), version: Number(payload.version), checksum: String(payload.checksum), document: doc };
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

/** The projects of the user, the last changed first. */
export async function listProjects(url: string): Promise<{ id: string; name: string; space?: string }[]> {
  return (await request(url)).projects as { id: string; name: string; space?: string }[];
}

/** A new empty project, of a space (a 3D design by default, a kitchen, a dressing). */
export async function createProject(url: string, name: string, space = "design"): Promise<{ id: string; name: string }> {
  const { id, name: kept } = await request(url, { method: "POST", body: JSON.stringify({ name, space }) });
  return { id: id as string, name: kept as string };
}
