/** Entry point of the editor page rendered by Django (templates/editor/editor.html). */
import { Editor, type EditorConfig } from "./app/editor";
import { bindSelectionFilter } from "./app/selection-filter";
import { DocumentSession } from "./app/session";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { initSolver } from "./constraints/solver";
import { sameDocument } from "./document/canonical";
import { GeometryClient } from "./geometry/client";
import { loadProject } from "./persistence/api";
import { clearRecovery, readRecovery } from "./persistence/recovery";
import { ref } from "./ui/dom";
import { Viewport } from "./viewport/viewport";

function readConfig(): EditorConfig {
  const node = document.getElementById("editor-config");
  if (!node?.textContent) throw new Error("Configuration de l'éditeur absente.");
  return JSON.parse(node.textContent) as EditorConfig;
}

function showFatal(root: HTMLElement, message: string): void {
  const status = ref(root, "status-kernel");
  status.textContent = message;
  status.dataset.state = "error";
}

async function start(): Promise<void> {
  const root = document.getElementById("editor");
  if (!root) return;
  const config = readConfig();
  const viewport = new Viewport(ref(root, "viewport"));
  const geometry = new GeometryClient();

  const kernelStatus = ref(root, "status-kernel");
  kernelStatus.textContent = "Chargement du noyau…";
  const [snapshot] = await Promise.all([
    loadProject(config.apiUrl),
    // The sketcher solves interactively on the main thread (small, fast module).
    initSolver({ locateFile: () => gcsWasmUrl }),
    geometry.init().then(() => {
      kernelStatus.textContent = "Noyau OpenCascade prêt";
      kernelStatus.dataset.state = "ready";
    }),
  ]);

  const session = new DocumentSession(config.projectId, config.apiUrl, snapshot.document, snapshot.version);
  const recovery = readRecovery(config.projectId);
  if (recovery && sameDocument(recovery.document, snapshot.document)) {
    // The exit save reached the server: the local copy is no longer needed.
    clearRecovery(config.projectId);
  } else if (recovery) {
    const stale = recovery.baseVersion !== snapshot.version;
    const question = stale
      ? `Une copie locale non enregistrée (basée sur la version ${recovery.baseVersion}) a été trouvée, mais le serveur est en version ${snapshot.version}. La restaurer quand même ?`
      : `Des modifications non enregistrées du ${new Date(recovery.savedAt).toLocaleString("fr-FR")} ont été trouvées. Les restaurer ?`;
    if (window.confirm(question)) session.replace(recovery.document);
    else clearRecovery(config.projectId);
  }

  bindSelectionFilter(root, viewport);
  const editor = new Editor(root, config, session, geometry, viewport);
  editor.render();
  await editor.recompute(true);
}

start().catch((error: unknown) => {
  const root = document.getElementById("editor");
  const message = error instanceof Error ? error.message : String(error);
  if (root) showFatal(root, `Erreur : ${message}`);
  console.error(error);
});
