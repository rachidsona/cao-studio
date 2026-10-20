/**
 * Editor controller: wires the Django page, the document session, the
 * geometry worker, the viewport and the panels together.
 */
import { solveSketch } from "../constraints/solver";
import { addExtrude, addPlate, dependentsOf, deleteFeature, findFeature, latestBody, updateFeature } from "../document/operations";
import { setDimensionValue } from "../sketcher/edit";
import type { CadDocument, DisplayUnit } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { RecomputeResponse } from "../geometry/protocol";
import type { FeatureStatus } from "../history/recompute";
import type { ExportFormat } from "../io/exporters";
import { NATIVE_EXTENSION, parseNative, serializeNative } from "../io/native";
import { trim } from "../measurements/units";
import { download, ref, slugify, toast } from "../ui/dom";
import { renderProperties, type FeaturePatch } from "../ui/properties";
import { renderTree } from "../ui/tree";
import type { StandardView, Viewport } from "../viewport/viewport";
import type { DocumentSession, SaveState } from "./session";
import { ExtrudeTool } from "./extrude-tool";
import { bindShortcuts } from "./keyboard";
import { ModelSelectionController } from "./model-selection";
import { ToolLauncher, type PanelToolKind } from "./tool-launcher";
import { SketchController } from "./sketch-controller";

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
      bodyName: (id) => findFeature(this.doc, id)?.name ?? id,
      changed: () => {
        const { faces, edges, bodies } = this.picked.selection;
        ref(this.root, "status-selection").textContent = this.picked.empty
          ? "Aucune sélection"
          : bodies.length
            ? `${bodies.length} corps sélectionné(s)`
            : `${edges.length} arête(s), ${faces.length} face(s) sélectionnée(s)`;
        if (!this.picked.empty) this.openPanel("properties");
        this.render();
      },
    });
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
      this.viewport.setBodies(result.bodies);
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
    renderTree(ref(this.root, "tree"), this.doc, this.statuses, this.selectedFeature, {
      onSelect: (id) => this.selectFeature(id),
      onToggleSuppress: (id) => this.toggleSuppress(id),
      onDelete: (id) => this.removeFeature(id),
    });
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
      body: this.bodyForPanel(),
      selection: this.picked.summary(),
      selectionActions: {
        fillet: () => this.openTool("fillet"),
        chamfer: () => this.openTool("chamfer"),
        extrude: () => this.extrudeCommand(),
        hole: () => this.openTool("hole"),
        combine: () => this.openTool("combine"),
        clear: () => this.viewport.clearSelection(),
      },
      targets: this.extrudeTargets(feature?.id ?? null),
      sketch: {
        editing,
        onEdit: () => feature && this.sketches.open(feature.id),
        onDimension: (id, value) =>
          editing ? this.sketches.setDimension(id, value) : feature ? this.setSketchDimension(feature.id, id, value) : false,
        onRemoveConstraint: (id) => this.sketches.removeConstraint(id),
        onOffset: (value) => this.patchSelected((f) => (f.type === "sketch" ? { ...f, offset: value } : f)),
      },
      onEditExtrude: () => feature?.type === "extrude" && this.extrudeCommand(feature.id),
      onEditFeature: () => feature && this.tools.edit(feature.id),
      onCommit: (patch) => this.patchSelected(patch),
    });
    this.updateHistoryButtons();
  }

  /** Bodies created before `featureId` that an extrusion may join or cut. */
  private extrudeTargets(featureId: string | null): { id: string; name: string }[] {
    const index = this.doc.features.findIndex((f) => f.id === featureId);
    return this.doc.features
      .slice(0, index < 0 ? undefined : index)
      .filter((f) => f.type === "extrude" || f.type === "hole")
      .map((f) => ({ id: f.id, name: f.name }));
  }

  /** Edits a dimension outside sketch mode: solved first, refused if the sketch cannot satisfy it. */
  private setSketchDimension(featureId: string, dimensionId: string, value: number): boolean {
    const feature = findFeature(this.doc, featureId);
    if (feature?.type !== "sketch") return false;
    try {
      const result = solveSketch(setDimensionValue(feature, dimensionId, value));
      if (result.state === "conflicting" || result.state === "failed") {
        this.notify("Cote refusée : l'esquisse ne peut pas la respecter.", "error");
        return false;
      }
      void this.change(updateFeature(this.doc, featureId, (f) => (f.type === "sketch" ? { ...f, ...result.geometry } : f)));
      return true;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    }
  }

  private bodyForPanel(): { name: string; metrics: NonNullable<RecomputeResponse["bodies"][number]["metrics"]> } | null {
    const bodies = this.result?.bodies ?? [];
    let bodyId = this.picked.bodyId ?? null;
    if (!bodyId && this.selectedFeature) bodyId = latestBody(this.doc, this.selectedFeature);
    bodyId ??= bodies[bodies.length - 1]?.bodyId ?? null;
    const body = bodies.find((b) => b.bodyId === bodyId);
    if (!body) return null;
    return { name: findFeature(this.doc, body.bodyId)?.name ?? body.bodyId, metrics: body.metrics };
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

  /** Extrudes the selected sketch (or the last one) as a new body. */
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
      bodies: () => (this.result?.bodies ?? []).map((b) => ({ id: b.bodyId, name: findFeature(this.doc, b.bodyId)?.name ?? b.bodyId })),
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
    return (this.result?.bodies ?? []).map((b) => ({ id: b.bodyId, name: findFeature(this.doc, b.bodyId)?.name ?? b.bodyId }));
  }

  /** Opens a panel tool; a face already selected places the hole directly. */
  private openTool(kind: PanelToolKind): void {
    this.openPanel(null); // phones: the tool panel takes the bottom of the screen
    if (this.sketches.active) this.sketches.finish();
    this.extrudeTool?.cancel();
    const selected = this.selectedFeature ? findFeature(this.doc, this.selectedFeature) : undefined;
    this.root.dataset.tool = kind;
    this.tools.open(kind, {
      ...(selected?.type === "sketch" ? { sketchId: selected.id } : {}),
      ...(kind === "hole" && this.picked.lastFace ? { pick: this.picked.lastFace } : {}),
      ...((kind === "fillet" || kind === "chamfer") && this.picked.selection.edges.length ? { edges: this.picked.selection.edges } : {}),
      ...(kind === "combine" && this.picked.selection.bodies.length ? { bodies: this.picked.selection.bodies } : {}),
    });
  }

  private historyStep(direction: "undo" | "redo"): void {
    const moved = direction === "undo" ? this.session.stepBack() : this.session.stepForward();
    if (!moved) return;
    if (this.selectedFeature && !findFeature(this.doc, this.selectedFeature)) this.selectedFeature = null;
    ref<HTMLSelectElement>(this.root, "units").value = this.doc.units;
    this.sketches.sync();
    void this.recompute();
  }

  private async save(): Promise<void> {
    if (!this.session.dirty) {
      this.notify("Aucune modification à enregistrer.");
      return;
    }
    await this.session.save("Enregistrement manuel").catch(() => undefined);
  }

  private async exportGeometry(format: ExportFormat): Promise<void> {
    try {
      const names = Object.fromEntries(this.doc.features.map((f) => [f.id, f.name]));
      const blob = await this.geometry.export(format, names);
      download(blob, `${slugify(this.config.projectName)}.${format}`);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  private async importNative(file: File): Promise<void> {
    try {
      const doc = parseNative(await file.text());
      this.selectedFeature = null;
      this.viewport.clearSelection();
      this.session.apply(doc);
      ref<HTMLSelectElement>(this.root, "units").value = doc.units;
      await this.recompute(true);
      this.notify(`« ${file.name} » importé.`, "success");
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), "error");
    }
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
      save: () => void this.save(),
      undo: () => this.historyStep("undo"),
      redo: () => this.historyStep("redo"),
      "add-plate": () => this.addPlateCommand(),
      "add-hole": () => this.openTool("hole"),
      revolve: () => this.openTool("revolve"),
      fillet: () => this.openTool("fillet"),
      chamfer: () => this.openTool("chamfer"),
      combine: () => this.openTool("combine"),
      extrude: () => this.extrudeCommand(),
      "export-step": () => void this.exportGeometry("step"),
      "export-stl": () => void this.exportGeometry("stl"),
      "export-native": () => download(serializeNative(this.doc), `${slugify(this.config.projectName)}${NATIVE_EXTENSION}`),
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
      if (file) void this.importNative(file);
    });
  }

  private bindKeyboard(): void {
    bindShortcuts({
      activeTool: () => this.extrudeTool ?? this.tools.active,
      sketchKey: (event) => this.sketches.handleKey(event),
      save: () => void this.save(),
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
