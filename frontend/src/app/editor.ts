/**
 * Editor controller: wires the Django page, the document session, the
 * geometry worker, the viewport and the panels together.
 */
import { addExtrude, addPlate, bodyLabel, bodyOrigin, dependentsOf, deleteFeature, findFeature, isBodyHidden, latestBody, renameBody, toggleHidden, updateFeature } from "../document/operations";
import { featureOfBody, type CadDocument, type DisplayUnit, type SketchFeature } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { RecomputeResponse } from "../geometry/protocol";
import type { FeatureStatus } from "../history/recompute";
import { trim } from "../measurements/units";
import { ref, toast } from "../ui/dom";
import { renderProperties, type FeaturePatch } from "../ui/properties";
import { removeOffsetFrom, renameOffsetIn } from "../sketcher/offset";
import { Navigator } from "./navigator";
import type { StandardView, Viewport } from "../viewport/viewport";
import type { DocumentSession, SaveState } from "./session";
import { ExtrudeTool } from "./extrude-tool";
import { FileCommands } from "./file-commands";
import { bindShortcuts } from "./keyboard";
import { ModelSelectionController } from "./model-selection";
import { extrudeTargets, ToolLauncher, toolOptions, type PanelToolKind } from "./tool-launcher";
import { SketchController } from "./sketch-controller";
import { SketchDisplay } from "./sketch-display";

export interface EditorConfig {
  projectId: string;
  projectName: string;
  apiUrl: string;
  projectsUrl: string;
}

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Enregistré",
  modified: "Modifications non enregistrées",
  saving: "Enregistrement…",
  offline: "Non enregistré (copie locale)",
  conflict: "Conflit de version",
};

export class Editor {
  private statuses = new Map<string, FeatureStatus>();
  private result: RecomputeResponse | null = null;
  private selectedFeature: string | null = null;
  private picked: ModelSelectionController;
  private recomputing = false;
  private recomputeAgain = false;
  private sketches: SketchController;
  private sketchDisplay: SketchDisplay;
  private navigator: Navigator;
  private files: FileCommands;
  private panelDeferred = false;
  private extrudeTool: ExtrudeTool | null = null;
  private tools: ToolLauncher;
  /** Provisional document shown while a tool previews its result (null: the real one). */
  private previewDoc: CadDocument | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly config: EditorConfig,
    private readonly session: DocumentSession,
    private readonly geometry: GeometryClient,
    private readonly viewport: Viewport,
  ) {
    session.onStateChange = (state, detail) => this.showSaveState(state, detail);
    this.picked = new ModelSelectionController(viewport, geometry, {
      unit: () => this.unit,
      bodyName: (id) => bodyLabel(this.doc, id),
      changed: () => {
        ref(this.root, "status-selection").textContent = this.picked.statusText();
        if (!this.picked.empty) this.openPanel("properties");
        this.render();
      },
    });
    this.sketchDisplay = new SketchDisplay(viewport, { doc: () => this.doc, selected: () => this.selectedFeature, select: (id) => this.selectFeature(id) });
    this.sketches = new SketchController(root, viewport, {
      doc: () => this.doc,
      change: (next) => void this.change(next),
      notify: (message, kind) => this.notify(message, kind),
      select: (id) => {
        this.selectedFeature = id;
      },
      render: () => this.render(),
      openPanel: (panel) => this.openPanel(panel),
      unit: () => this.unit,
      extrude: () => this.extrudeCommand(),
      selectedFace: () => this.picked.lastFace,
      faceOutline: (bodyId, faceIndex) => this.geometry.faceOutline(bodyId, faceIndex),
      offset: (paths, distance, join) => this.geometry.offset(paths, distance, join),
    });
    this.files = new FileCommands({
      session,
      geometry,
      projectName: config.projectName,
      doc: () => this.doc,
      bodies: () => this.visibleBodies(),
      notify: (message, kind) => this.notify(message, kind),
      imported: async (doc) => {
        this.selectedFeature = null;
        this.viewport.clearSelection();
        this.session.apply(doc);
        ref<HTMLSelectElement>(this.root, "units").value = doc.units;
        await this.recompute(true);
      },
    });
    this.navigator = new Navigator(root, {
      doc: () => this.doc,
      statuses: () => this.statuses,
      bodyIds: () => (this.result?.bodies ?? []).map((b) => b.bodyId),
      selectedId: () => this.selectedFeature,
      selectedBodyId: () => this.picked.bodyId ?? null,
      selectFeature: (id) => this.selectFeature(id),
      selectBody: (id) => ((this.selectedFeature = id), this.viewport.selectBody(id), this.render()),
      toggleHidden: (id) => void this.change(toggleHidden(this.doc, id)),
      rename: (id, name) => void this.change(updateFeature(this.doc, id, (f) => ({ ...f, name }))),
      renameBody: (id, name) => void this.change(renameBody(this.doc, id, name)),
      removeBody: (id) => this.removeBody(id),
      renameOffset: (sketch, id, name) => this.changeSketch(sketch, (f) => renameOffsetIn(f, id, name)),
      editOffset: (sketch, id) => this.sketches.editOffset(sketch, id),
      removeOffset: (sketch, id) => this.changeSketch(sketch, (f) => removeOffsetFrom(f, id)),
      edit: (id) => this.editFeature(id),
      toggleSuppress: (id) => this.toggleSuppress(id),
      remove: (id) => this.removeFeature(id),
    });
    const main = root.querySelector("main") as HTMLElement;
    this.tools = new ToolLauncher({
      viewport,
      geometry,
      container: main,
      doc: () => this.doc,
      unit: () => this.unit,
      bodies: () => this.visibleBodies(),
      status: (id) => this.statuses.get(id),
      preview: (doc) => {
        this.previewDoc = doc;
        return this.recompute();
      },
      commit: (doc, id) => {
        this.previewDoc = null;
        this.selectedFeature = id;
        void this.change(doc);
      },
      notify: (message, kind) => this.notify(message, kind),
      closed: () => {
        this.root.dataset.tool = "";
        this.render();
      },
    });
    this.bindActions();
    this.bindKeyboard();
    ref<HTMLSelectElement>(root, "units").value = session.doc.units;
    window.addEventListener("pagehide", () => session.flushOnExit());
    window.addEventListener("beforeunload", (event) => {
      // Without autosave, warn before losing changes (the recovery copy still exists).
      if (session.dirty && !session.autosave) event.preventDefault();
    });
    new MutationObserver(() => viewport.applyTheme()).observe(document.documentElement, { attributeFilter: ["class"] });
  }

  get doc(): CadDocument {
    return this.session.doc;
  }

  get unit(): DisplayUnit {
    return this.doc.units;
  }

  private notify(message: string, kind: "info" | "success" | "error" = "info"): void {
    toast(ref(this.root, "toasts"), message, kind);
  }

  // ---- regeneration -------------------------------------------------------

  /** Regenerates the model; concurrent requests collapse into one extra pass. */
  async recompute(fitView = false): Promise<void> {
    if (this.recomputing) {
      this.recomputeAgain = true;
      return;
    }
    this.recomputing = true;
    ref(this.root, "status-recompute").textContent = "Recalcul…";
    try {
      const result = await this.geometry.recompute(this.previewDoc ?? this.doc);
      this.result = result;
      this.statuses = new Map(result.statuses.map((s) => [s.id, s]));
      this.picked.invalidate();
      // Bodies hidden with the eye of the browser stay in the document but are not drawn.
      this.viewport.setBodies(result.bodies.filter((b) => !isBodyHidden(this.previewDoc ?? this.doc, b.bodyId)));
      if (fitView) this.viewport.setView("iso");
      const failures = result.statuses.filter((s) => s.state === "error").length;
      ref(this.root, "status-recompute").textContent =
        `Recalcul ${trim(result.durationMs, 0)} ms` + (failures ? ` — ${failures} erreur(s)` : "");
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
      ref(this.root, "status-recompute").textContent = "Échec du recalcul";
    } finally {
      this.recomputing = false;
    }
    this.render();
    if (this.recomputeAgain) {
      this.recomputeAgain = false;
      await this.recompute();
    }
  }

  private change(next: CadDocument): Promise<void> {
    this.session.apply(next);
    this.updateHistoryButtons();
    return this.recompute();
  }

  // ---- rendering ----------------------------------------------------------

  render(): void {
    this.sketchDisplay.sync(this.sketches.mode?.featureId ?? null);
    this.navigator.render();
    const feature = this.selectedFeature ? (findFeature(this.doc, this.selectedFeature) ?? null) : null;
    const panel = ref(this.root, "properties");
    // Never rebuild the panel under the user's fingers: wait until the field being edited loses focus.
    const active = document.activeElement;
    if (active instanceof HTMLElement && panel.contains(active) && active.matches("input, select")) {
      if (!this.panelDeferred) {
        this.panelDeferred = true;
        panel.addEventListener(
          "focusout",
          () => {
            this.panelDeferred = false;
            setTimeout(() => this.render(), 0);
          },
          { once: true },
        );
      }
      this.updateHistoryButtons();
      return;
    }
    const editing = feature !== null && this.sketches.mode?.featureId === feature.id;
    renderProperties(panel, {
      feature,
      status: feature ? this.statuses.get(feature.id) : undefined,
      unit: this.unit,
      bodyName: (id) => bodyLabel(this.doc, id),
      body: this.bodyForPanel(),
      selection: this.picked.summary(),
      selectionActions: {
        fillet: () => this.openTool("fillet"),
        chamfer: () => this.openTool("chamfer"),
        extrude: () => this.extrudeCommand(),
        hole: () => this.openTool("hole"),
        combine: () => this.openTool("combine"),
        split: () => this.openTool("split"),
        move: () => this.openTool("move"),
        sketch: () => {
          const face = this.picked.lastFace;
          if (face) void this.sketches.createOnFace(face);
        },
        clear: () => this.viewport.clearSelection(),
      },
      targets: extrudeTargets(this.doc, feature?.id ?? null),
      sketch: {
        editing,
        onEdit: () => feature && this.sketches.open(feature.id),
        onDimension: (id, value) => (feature ? this.sketches.setDimensionOf(feature.id, id, value) : false),
        onRemoveConstraint: (id) => this.sketches.removeConstraint(id),
        onOffset: (value) => this.patchSelected((f) => (f.type === "sketch" ? { ...f, offset: value } : f)),
      },
      onEditExtrude: () => feature?.type === "extrude" && this.extrudeCommand(feature.id),
      onEditFeature: () => feature && this.tools.edit(feature.id),
      onCommit: (patch) => this.patchSelected(patch),
    });
    this.updateHistoryButtons();
  }

  private bodyForPanel(): { name: string; metrics: NonNullable<RecomputeResponse["bodies"][number]["metrics"]> } | null {
    const bodies = this.result?.bodies ?? [];
    let bodyId = this.picked.bodyId ?? null;
    if (!bodyId && this.selectedFeature) bodyId = latestBody(this.doc, this.selectedFeature);
    bodyId ??= bodies[bodies.length - 1]?.bodyId ?? null;
    const body = bodies.find((b) => b.bodyId === bodyId);
    if (!body) return null;
    return { name: bodyLabel(this.doc, body.bodyId), metrics: body.metrics };
  }

  private updateHistoryButtons(): void {
    ref<HTMLButtonElement>(this.root, "undo").disabled = !this.session.undo.canUndo;
    ref<HTMLButtonElement>(this.root, "redo").disabled = !this.session.undo.canRedo;
  }

  private showSaveState(state: SaveState, detail?: string): void {
    const node = ref(this.root, "status-save");
    node.textContent = SAVE_LABELS[state];
    node.dataset.state = state;
    if (detail) this.notify(detail, state === "saved" ? "success" : state === "saving" ? "info" : "error");
  }

  // ---- selection ----------------------------------------------------------

  private selectFeature(id: string | null): void {
    this.selectedFeature = id;
    this.openPanel("properties");
    this.render();
  }

  // ---- commands -----------------------------------------------------------

  private patchSelected(patch: FeaturePatch): void {
    if (!this.selectedFeature) return;
    void this.change(updateFeature(this.doc, this.selectedFeature, patch));
  }

  /** Reopens the tool of a feature: the sketch editor, the extrusion arrow, or the panel tool. */
  private editFeature(id: string): void {
    const feature = findFeature(this.doc, id);
    if (feature?.type === "sketch") this.sketches.open(id);
    else if (feature?.type === "extrude") this.extrudeCommand(id);
    else if (feature) this.tools.edit(id);
  }

  /** Changes a sketch from outside the sketch mode; the sketch being edited is re-read so it cannot write back old data. */
  private changeSketch(id: string, change: (sketch: SketchFeature) => SketchFeature): void {
    void this.change(updateFeature(this.doc, id, (f) => (f.type === "sketch" ? change(f) : f)));
    this.sketches.sync();
  }

  /** Deleting a body deletes the feature that created it; a piece of a split takes the whole split with it. */
  private removeBody(bodyId: string): void {
    const origin = bodyOrigin(this.doc, bodyId);
    const owner = findFeature(this.doc, featureOfBody(origin));
    if (origin !== owner?.id && !window.confirm(`Supprimer cette pièce supprime la scission « ${owner?.name} » et donc toutes ses pièces. Continuer ?`)) return;
    this.removeFeature(featureOfBody(origin));
  }

  private toggleSuppress(id: string): void {
    void this.change(updateFeature(this.doc, id, (f) => ({ ...f, suppressed: !f.suppressed })));
  }

  private removeFeature(id: string): void {
    const feature = findFeature(this.doc, id);
    if (!feature) return;
    const next = deleteFeature(this.doc, id);
    const lost = dependentsOf(this.doc, id).filter((d) => !findFeature(next, d));
    if (lost.length > 0) {
      const names = lost.map((d) => findFeature(this.doc, d)?.name ?? d).join(", ");
      if (!window.confirm(`Supprimer « ${feature.name} » supprimera aussi : ${names}. Continuer ?`)) return;
    }
    if (this.selectedFeature && !findFeature(next, this.selectedFeature)) this.selectedFeature = null;
    if (this.sketches.mode && !findFeature(next, this.sketches.mode.featureId)) this.sketches.finish();
    this.viewport.clearSelection();
    void this.change(next);
  }

  /**
   * Opens the interactive extrusion: on the sketch being edited or selected,
   * otherwise waiting for a profile click in the view.
   */
  private extrudeCommand(featureId?: string): void {
    // Faces picked in the model, or an extrusion made from faces: push/pull tool.
    const edited = featureId ? findFeature(this.doc, featureId) : undefined;
    const faces = this.picked.selection.faces;
    this.openPanel(null);
    if ((edited?.type === "extrude" && edited.faces) || (!featureId && faces.length && !this.sketches.active)) {
      this.extrudeTool?.cancel();
      this.root.dataset.tool = "extrude";
      this.tools.open("faceExtrude", featureId ? { featureId } : { faces });
      return;
    }
    const selected = this.selectedFeature ? findFeature(this.doc, this.selectedFeature) : undefined;
    const sketchId = this.sketches.mode?.featureId ?? (selected?.type === "sketch" ? selected.id : undefined);
    if (this.sketches.active) this.sketches.finish();
    this.extrudeTool?.cancel();
    this.tools.active?.cancel();
    const main = this.root.querySelector("main");
    if (!main) return;
    this.extrudeTool = new ExtrudeTool(this.viewport, {
      doc: () => this.doc,
      change: (next) => void this.change(next),
      notify: (message, kind) => this.notify(message, kind),
      bodies: () => this.visibleBodies(),
      unit: () => this.unit,
      closed: (id) => {
        this.extrudeTool = null;
        this.root.dataset.tool = "";
        if (id) this.selectedFeature = id;
        this.render();
      },
    }, main);
    this.root.dataset.tool = "extrude";
    this.extrudeTool.start(featureId ? { featureId } : { sketchId });
  }

  private addPlateCommand(): void {
    const bodies = this.result?.bodies ?? [];
    const maxX = bodies.reduce((m, b) => Math.max(m, b.metrics.bbox[1][0]), Number.NEGATIVE_INFINITY);
    // Place the new plate beside the existing bodies instead of on top of them.
    const next = Number.isFinite(maxX) ? addPlate(this.doc, 80, 50, 10, maxX + 20 + 40, 0) : addPlate(this.doc);
    this.selectedFeature = next.features[next.features.length - 1]?.id ?? null;
    void this.change(next).then(() => this.viewport.fit());
  }

  /** Bodies currently displayed, with their feature names. */
  private visibleBodies(): { id: string; name: string }[] {
    return (this.result?.bodies ?? []).map((b) => ({ id: b.bodyId, name: bodyLabel(this.doc, b.bodyId) }));
  }

  /** Opens a panel tool; a face already selected places the hole directly. */
  private openTool(kind: PanelToolKind): void {
    this.openPanel(null); // phones: the tool panel takes the bottom of the screen
    if (this.sketches.active) this.sketches.finish();
    this.extrudeTool?.cancel();
    const selected = this.selectedFeature ? findFeature(this.doc, this.selectedFeature) : undefined;
    this.root.dataset.tool = kind;
    this.tools.open(kind, toolOptions(kind, selected, this.picked));
  }

  private historyStep(direction: "undo" | "redo"): void {
    const moved = direction === "undo" ? this.session.stepBack() : this.session.stepForward();
    if (!moved) return;
    if (this.selectedFeature && !findFeature(this.doc, this.selectedFeature)) this.selectedFeature = null;
    ref<HTMLSelectElement>(this.root, "units").value = this.doc.units;
    this.sketches.sync();
    void this.recompute();
  }

  openPanel(panel: "tree" | "properties" | null): void {
    for (const name of ["tree", "properties"] as const) {
      const aside = ref(this.root, `panel-${name}`);
      aside.dataset.open = String(panel === name && aside.dataset.open !== "true");
    }
  }

  // ---- bindings -----------------------------------------------------------

  private bindActions(): void {
    const actions: Record<string, (target: HTMLElement) => void> = {
      save: () => void this.files.save(),
      undo: () => this.historyStep("undo"),
      redo: () => this.historyStep("redo"),
      "add-plate": () => this.addPlateCommand(),
      "add-hole": () => this.openTool("hole"),
      revolve: () => this.openTool("revolve"),
      fillet: () => this.openTool("fillet"),
      chamfer: () => this.openTool("chamfer"),
      combine: () => this.openTool("combine"),
      split: () => this.openTool("split"),
      move: () => this.openTool("move"),
      extrude: () => this.extrudeCommand(),
      "export-step": () => void this.files.exportGeometry("step"),
      "export-stl": () => void this.files.exportGeometry("stl"),
      "export-native": () => this.files.exportNative(),
      "import-native": () => ref<HTMLInputElement>(this.root, "import-file").click(),
      view: (target) => this.viewport.setView(target.dataset.view as StandardView),
      fit: () => this.viewport.fit(),
      panel: (target) => this.openPanel(target.dataset.panel as "tree" | "properties"),
      "close-panels": () => this.openPanel(null),
      deselect: () => {
        this.viewport.clearSelection();
        this.selectFeature(null);
      },
    };
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      const action = target?.dataset.action;
      if (target && action && actions[action]) actions[action](target);
    });
    ref<HTMLSelectElement>(this.root, "units").addEventListener("change", (event) => {
      const units = (event.target as HTMLSelectElement).value as DisplayUnit;
      this.session.apply({ ...this.doc, units });
      this.render();
    });
    ref<HTMLInputElement>(this.root, "autosave").addEventListener("change", (event) => {
      this.session.autosave = (event.target as HTMLInputElement).checked;
    });
    ref<HTMLInputElement>(this.root, "import-file").addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) void this.files.importNative(file);
    });
  }

  private bindKeyboard(): void {
    bindShortcuts({
      activeTool: () => this.extrudeTool ?? this.tools.active,
      sketchKey: (event) => this.sketches.handleKey(event),
      save: () => void this.files.save(),
      undo: () => this.historyStep("undo"),
      redo: () => this.historyStep("redo"),
      escape: () => {
        this.viewport.clearSelection();
        this.selectFeature(null);
      },
      deleteSelected: () => this.selectedFeature && this.removeFeature(this.selectedFeature),
      fit: () => this.viewport.fit(),
      hole: () => this.openTool("hole"),
      extrude: () => this.extrudeCommand(),
    });
  }
}
