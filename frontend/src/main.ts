/** Entry point of the editor page rendered by Django (templates/editor/editor.html). */
import { Editor, type EditorConfig } from "./app/editor";
import { bindSelectionFilter } from "./app/selection-filter";
import { bindSelectPlus } from "./app/select-plus";
import { bindSection } from "./app/section-view";
import { bindDrawing } from "./app/drawing-view";
import { bindHelp } from "./app/help";
import { bindMeasure } from "./app/measure";
import { bindMotion } from "./app/motion";
import { bindParameters } from "./app/parameters";
import { bindScenes } from "./app/scenes";
import { bindWorkshop } from "./app/workshop";
import { bindWorkshopDocuments } from "./app/workshop-documents";
import { askConfirm } from "./ui/confirm-dialog";
import { DocumentSession } from "./app/session";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { initSolver } from "./constraints/solver";
import { sameDocument } from "./document/canonical";
import { GeometryClient } from "./geometry/client";
import { loadProject } from "./persistence/api";
import { describeError, installErrorReporting, sendReport } from "./persistence/error-report";
import { clearRecovery, readRecovery } from "./persistence/recovery";
import { ref } from "./ui/dom";
import { LoadingScreen } from "./ui/loading";
import { bindRibbonLayout } from "./ui/ribbon-layout";
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
  installErrorReporting();
  const config = readConfig();
  const viewport = new Viewport(ref(root, "viewport"));
  const geometry = new GeometryClient();

  const kernelStatus = ref(root, "status-kernel");
  kernelStatus.textContent = "Chargement du noyau…";
  loading.show("Démarrage du noyau 3D…", 0.05);
  geometry.onProgress = (loaded, total) => loading.download(loaded, total);
  const [snapshot] = await Promise.all([
    loadProject(config.apiUrl),
    // The sketcher solves interactively on the main thread (small, fast module).
    initSolver({ locateFile: () => gcsWasmUrl }),
    geometry.init().then(() => {
      kernelStatus.textContent = "Noyau OpenCascade prêt";
      kernelStatus.dataset.state = "ready";
      loading.show("Préparation du projet…", 0.9);
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
    if (await askConfirm(question, "Restaurer")) session.replace(recovery.document);
    else clearRecovery(config.projectId);
  }

  bindRibbonLayout(root);
  bindSelectionFilter(root, viewport);
  const editor = new Editor(root, config, session, geometry, viewport);
  bindSelectPlus(root, viewport, { doc: () => editor.doc, unit: () => editor.unit });
  bindSection(root, viewport, { unit: () => editor.unit });
  bindWorkshop(root, viewport, editor);
  bindWorkshopDocuments(root, viewport, editor, geometry);
  bindParameters(root, viewport, editor);
  bindScenes(root, viewport, editor);
  bindMeasure(root, viewport, editor);
  bindMotion(root, viewport, editor);
  bindDrawing(root, viewport, editor);
  bindHelp(root);
  editor.render();
  loading.show("Calcul des corps…", 0.95);
  await editor.recompute(true);
  loading.done();
}

const loading = new LoadingScreen(document.querySelector<HTMLElement>('[data-ref="loading"]'));

start().catch((error: unknown) => {
  const root = document.getElementById("editor");
  const message = error instanceof Error ? error.message : String(error);
  if (root) showFatal(root, `Erreur : ${message}`);
  loading.fail(`Erreur : ${message}.`);
  sendReport(describeError(error, "démarrage"));
  console.error(error);
});
