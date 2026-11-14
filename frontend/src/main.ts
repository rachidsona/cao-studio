/** Entry point of the editor page rendered by Django (templates/editor/editor.html). */
import { bindHighStorage } from "./app/dressing/high-storage-tool";
import { bindInventory } from "./app/dressing/inventory-tool";
import { bindPlinthTech } from "./app/kitchen/plinth-tech-tool";
import { bindWorktopBars } from "./app/kitchen/worktop-bars-tool";
import { bindTechPlan } from "./app/kitchen/tech-plan-tool";
import { startKeptData } from "./persistence/kept-data";
import { Editor, type EditorConfig } from "./app/editor";
import { bindCommandPalette } from "./app/command-palette";
import { bindToolColumns } from "./ui/tool-columns";
import { bindNavigatorFold } from "./ui/navigator-fold";
import { bindContextBar } from "./app/context-bar";
import { bindLiveCheck } from "./app/workshop/live-check";
import { bindVariants } from "./app/workshop/variants-tool";
import { bindModulePalette } from "./app/dressing/module-palette";
import { bindIconTitles } from "./ui/icon-titles";
import { bindFieldKeypads } from "./ui/field-keypads";
import { bindPlanLayout } from "./app/dressing/plan-layout-tool";
import { bindKitchenPlan } from "./app/kitchen/kitchen-plan-tool";
import { bindProductionFolder } from "./app/workshop/production-folder";
import { bindProjectTabs } from "./app/project-tabs";
import { bindProjectOrganizer } from "./app/project-organizer";
import { bindSelectionFilter } from "./app/selection-filter";
import { bindSelectPlus } from "./app/select-plus";
import { bindSection } from "./app/section-view";
import { bindDrawingWorkspace } from "./app/drawing/workspace";
import { bindProjectMenu } from "./app/project-menu";
import { bindHelp } from "./app/help";
import { bindDoorFronts } from "./app/dressing/door-fronts-tool";
import { bindEdgePaint } from "./app/edge-paint-tool";
import { bindLivePrice } from "./app/workshop/live-price";
import { bindNicheCopy } from "./app/dressing/niche-copy-tool";
import { bindFurnitureTool } from "./app/furniture-tool";
import { bindWalk } from "./app/walk-tool";
import { bindNicheMenu } from "./app/dressing/niche-menu";
import { bindShelfDrag } from "./app/dressing/shelf-drag";
import { bindStylePanel } from "./app/dressing/style-panel";
import { bindZoneView } from "./app/zone-view";
import { bindLayers } from "./app/layers-panel";
import { bindLinkedCopy } from "./app/linked-copy";
import { bindMeasure } from "./app/measure";
import { bindSnapButtons } from "./app/body-snap";
import { bindAssembly } from "./app/workshop/assembly-guide";
import { bindLibrary } from "./app/library-panel";
import { bindHardwarePanel } from "./app/workshop/hardware-panel";
import { bindStandardsPanel } from "./app/workshop/standards-panel";
import { bindProduction } from "./app/workshop/production";
import { bindPurchaseOrders } from "./app/workshop/purchase-orders-tool";
import { bindReplace } from "./app/replace-panel";
import { bindDrivers } from "./app/drivers-3d";
import { bindCabinetDrag } from "./app/cabinet-drag";
import { bindKitchenUnits } from "./app/kitchen/kitchen-units";
import { bindPieceDims } from "./app/piece-dims";
import { bindSelectWhole } from "./app/select-whole";
import { bindGridToggle } from "./app/grid-toggle";
import { bindDisplayToggles } from "./app/display-toggles";
import { bindRibbonToggle } from "./app/ribbon-toggle";
import { bindWallCutaway } from "./app/wall-cutaway";
import { bindIsolateSelection } from "./app/isolate-selection";
import { bindOrbit } from "./app/orbit-tool";
import { bindPartTags } from "./app/part-tags";
import { bindHiddenJoints } from "./app/hidden-joints";
import { bindProgress } from "./app/workshop/workshop-progress";
import { bindSag } from "./app/workshop/sag-panel";
import { bindWeight } from "./app/workshop/weight-panel";
import { bindMotion } from "./app/motion";
import { bindDrawers } from "./app/drawer-toggle";
import { bindTabPanels } from "./app/tab-panels";
import { bindSpaceSwitch } from "./app/space-switch";
import { bindWorkflowSteps } from "./app/workflow-steps";
import { bindParameters } from "./app/parameters";
import { bindScenes } from "./app/workshop/scenes";
import { bindWorkshop } from "./app/workshop/workshop";
import { bindPresentationBoard } from "./app/workshop/presentation-board-tool";
import { adoptBrowserRates, bindWorkshopDocuments } from "./app/workshop/workshop-documents";
import { bindSharing } from "./app/workshop/sharing";
import { bindAssistant } from "./app/assistant-panel";
import { askConfirm } from "./ui/confirm-dialog";
import { DocumentSession } from "./app/session";
import gcsWasmUrl from "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url";
import { initSolver } from "./constraints/solver";
import { sameDocument } from "./document/canonical";
import { GeometryClient } from "./geometry/client";
import { loadProject } from "./persistence/api";
import { loadCatalog } from "./persistence/catalog";
import { companyHeaderHtml, registerCatalog } from "./document/catalog";
import { setLetterhead } from "./app/workshop/workshop-ui";
import { describeError, installErrorReporting, sendReport } from "./persistence/error-report";
import { clearRecovery, readRecovery } from "./persistence/recovery";
import { ref } from "./ui/dom";
import { LoadingScreen } from "./ui/loading";
import { fontBytes } from "./geometry/font";
import { setTextFont } from "./sketcher/text-outline";
import { bindAppearance } from "./app/appearance-tool";
import { bindRenderWorkspace } from "./app/render-workspace";
import { bindPanelResize } from "./ui/panel-resize";
import { bindRibbonLayout } from "./ui/ribbon-layout";
import { bindDigitKeys } from "./ui/digit-keys";
import { bindScrollArrows } from "./ui/scroll-arrows";
import { Viewport } from "./viewport/viewport";
import { bindProjectPreview } from "./app/project-preview";

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
  bindDigitKeys();
  // The font of sketch texts, for their outline on screen.
  void fontBytes().then(setTextFont).catch(() => undefined);
  const config = readConfig();
  const viewport = new Viewport(ref(root, "viewport"));
  const geometry = new GeometryClient();

  const kernelStatus = ref(root, "status-kernel");
  kernelStatus.textContent = "Chargement du noyau…";
  loading.show("Démarrage du noyau 3D…", 0.05);
  geometry.onProgress = (loaded, total) => loading.download(loaded, total);
  // A computation stopped after its time limit: the next one starts a new kernel (geometry/client.ts, TIME_LIMITS).
  geometry.onRestart = () => {
    kernelStatus.textContent = "Redémarrage du noyau…";
    kernelStatus.dataset.state = "";
    void geometry.init().then(() => {
      kernelStatus.textContent = "Noyau OpenCascade prêt";
      kernelStatus.dataset.state = "ready";
    }).catch(() => undefined);
  };
  // What one keeps for all one's projects (« Mes caissons », suppliers, rates…): the server's copy, while the rest loads.
  const kept = startKeptData();
  const [snapshot, catalog] = await Promise.all([
    loadProject(config.apiUrl),
    // The workshop's catalogue: its materials and hardware join the built-in ones, its profile heads the documents.
    loadCatalog(config.catalogUrl),
    // The sketcher solves interactively on the main thread (small, fast module).
    initSolver({ locateFile: () => gcsWasmUrl }),
    geometry.init().then(() => {
      kernelStatus.textContent = "Noyau OpenCascade prêt";
      kernelStatus.dataset.state = "ready";
      loading.show("Préparation du projet…", 0.9);
    }),
  ]);
  // The libraries in place before the tools read them (a moment at most: the server is near).
  await kept;

  if (catalog) {
    registerCatalog(catalog);
    adoptBrowserRates();
    setLetterhead(companyHeaderHtml(catalog.company));
  }
  const session = new DocumentSession(config.projectId, config.apiUrl, snapshot.document, snapshot.version);
  // A newer version on the server: keep this copy over it, or reload the server's (the local copy stays offered).
  session.onConflict = (current) => {
    void askConfirm(`Le projet a été modifié ailleurs (version ${current}). Garder votre version et l'enregistrer par-dessus ? « Annuler » recharge la version du serveur ; la vôtre vous sera encore proposée.`, "Garder la mienne").then((keep) => {
      if (keep) void session.keepMine(current).catch(() => undefined);
      else window.location.reload();
    });
  };
  // Back from the browser's page cache: its version may be old, the page is loaded again.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
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
  bindScrollArrows(ref(root, "tree"));
  bindPanelResize(root);
  bindSelectionFilter(root, viewport);
  const editor = new Editor(root, config, session, geometry, viewport);
  bindSelectPlus(root, viewport, { doc: () => editor.doc, unit: () => editor.unit });
  bindSection(root, viewport, { unit: () => editor.unit });
  bindWorkshop(root, viewport, editor);
  bindRenderWorkspace(root, viewport, editor);
  bindAppearance(root, viewport, editor);
  bindWorkshopDocuments(root, viewport, editor, geometry);
  bindPresentationBoard(root, viewport, editor);
  bindParameters(root, viewport, editor);
  bindScenes(root, viewport, editor);
  bindMeasure(root, viewport, editor);
  bindSnapButtons(root, (message) => editor.notify(message, "info"));
  const notice = bindAssembly(root, viewport, editor);
  bindLibrary(root, viewport, editor);
  bindHardwarePanel(root, viewport, editor);
  bindStandardsPanel(root, viewport, editor);
  bindReplace(root, editor);
  bindDrivers(root, viewport, editor);
  bindCabinetDrag(root, viewport, editor);
  bindKitchenUnits(root, viewport, editor);
  bindPieceDims(root, viewport, editor);
  bindSelectWhole(root, viewport, editor);
  bindGridToggle(root, viewport);
  bindDisplayToggles(root, viewport, editor);
  bindRibbonToggle(root);
  bindTechPlan(root, editor);
  bindWorktopBars(root, editor);
  bindPlinthTech(root, editor);
  bindInventory(root, editor);
  bindHighStorage(root, editor);
  bindWallCutaway(root, viewport, editor);
  bindIsolateSelection(root, viewport, editor);
  bindOrbit(root, viewport, (message) => editor.notify(message, "info"));
  bindPartTags(root, viewport, editor);
  bindHiddenJoints(root, viewport);
  bindProgress(root, viewport, editor, config.apiUrl);
  bindSag(root, viewport, editor);
  bindWeight(root, viewport, editor);
  bindMotion(root, viewport, editor);
  bindDrawers(root, viewport, editor);
  bindProjectMenu(root, viewport, editor, bindDrawingWorkspace(root, viewport, editor));
  bindHelp(root);
  bindLayers(root, viewport, editor);
  bindLinkedCopy(root, viewport, editor);
  bindSharing(root, viewport, editor, config.apiUrl, config.projectName);
  bindProduction(root, viewport, editor, config.apiUrl, config.projectName);
  bindPurchaseOrders(root, viewport, editor);
  bindAssistant(root, viewport, editor, config.apiUrl);
  bindZoneView(viewport, editor);
  bindPlanLayout(root, viewport, editor);
  bindKitchenPlan(root, viewport, editor);
  bindTabPanels(root);
  bindSpaceSwitch(config, root.dataset.space, (m, k) => editor.notify(m, k));
  bindWorkflowSteps(root, editor);
  bindLivePrice(root, viewport, editor, config.apiUrl);
  bindNicheCopy(root, viewport, editor);
  bindFurnitureTool(root, viewport, editor);
  bindWalk(root, viewport, editor);
  bindNicheMenu(root, viewport, editor);
  bindModulePalette(root, viewport, editor);
  // The tooltip of a tool's icon says its name only (its description is in the Help, and in the tool search).
  bindIconTitles(document.body);
  // A calculator beside every number field (tools, panels, drawing), those without one of their own.
  bindFieldKeypads(document.body);
  bindContextBar(root, viewport, editor);
  bindLiveCheck(root, viewport, editor);
  bindVariants(root, viewport, editor);
  bindShelfDrag(viewport, editor);
  bindStylePanel(root, viewport, editor);
  bindDoorFronts(root, viewport, editor);
  bindEdgePaint(root, viewport, editor);
  bindCommandPalette(root);
  bindNavigatorFold(root);
  bindToolColumns(root);
  bindProductionFolder(root, viewport, editor, geometry, notice);
  bindProjectTabs(root, config, session, (message, kind) => editor.notify(message, kind));
  bindProjectOrganizer(root, config, (message, kind) => editor.notify(message, kind));
  editor.render();
  loading.show("Calcul des corps…", 0.95);
  await editor.recompute(true);
  loading.done();
  // The picture of the model on its card of the home page (app/project-preview.ts): after the saves, and now if none.
  const preview = bindProjectPreview(viewport, () => editor.doc, config.apiUrl);
  const savedState = session.onStateChange;
  session.onStateChange = (state, detail) => {
    savedState(state, detail);
    if (state === "saved") preview.saved();
  };
  if (!config.hasPreview) preview.now();
  // Operations switched off on opening (document/validate.ts openDocument): said once, they stay in the history.
  if (snapshot.problems?.length) {
    editor.notify(`Projet ouvert, mais ${snapshot.problems.length} opération(s) désactivée(s) : ${snapshot.problems.join(" — ")}`, "error");
  }
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
