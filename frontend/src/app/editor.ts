/**
 * Editor controller: wires the Django page, the document session, the
 * geometry worker, the viewport and the panels together.
 */
import { confirmDeletion, deletionOf, removeStep, removeWithShelves } from "./delete-selection";
import { normalizeDoc } from "../document/doc-normalizers";
import { askConfirm } from "../ui/confirm-dialog";
import { addExtrude, addPlate, bodyLabel, findFeature, isBodyHidden, removePieces, renameBody, setHidden, toggleHidden, updateFeature } from "../document/operations";
import { featureOfBody, type CadDocument, type DisplayUnit, type SketchFeature } from "../document/types";
import { validateDocument } from "../document/validate";
import type { GeometryClient } from "../geometry/client";
import type { RecomputeResponse } from "../geometry/protocol";
import type { FeatureStatus } from "../history/recompute";
import { trim } from "../measurements/units";
import { ref, toast } from "../ui/dom";
import { renderProperties, type FeaturePatch } from "../ui/properties";
import { renameOffsetIn } from "../sketcher/offset";
import { withPlaneOffset } from "../sketcher/frame";
import { strokesOnly } from "../sketcher/loops";
import { strokesTool } from "./gable-tool";
import { Navigator } from "./navigator";
import type { StandardView, Viewport } from "../viewport/viewport";
import type { DocumentSession, SaveState } from "./session";
import { ExtrudeTool } from "./extrude-tool";
import { ExtendFollower } from "./extend-follow";
import { FileCommands } from "./file-commands";
import { bindShortcuts } from "./keyboard";
import { ModelSelectionController } from "./model-selection";
import { extrudeTargets, ToolLauncher, toolOptions, type PanelToolKind } from "./tool-launcher";
import { SketchController } from "./sketch-controller";
import { SketchDisplay } from "./sketch-display";
import { preferredUnit, setPreferredUnit } from "../measurements/unit-preference";

export interface EditorConfig {
  projectId: string;
  projectName: string;
  apiUrl: string;
  projectsUrl: string;
  catalogUrl?: string; // the workshop's catalogue (materials, hardware rules, letterhead); missing on an older server
  foldersUrl?: string; // the folders of the projects, for the « Projets » column (app/project-organizer.ts)
  hasPreview?: boolean; // the project has its picture for the home page (app/project-preview.ts)
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
  /** Last regeneration (every body, hidden ones included). */ result: RecomputeResponse | null = null;
  private selectedFeature: string | null = null;
  readonly picked: ModelSelectionController;
  private recomputing = false;
  private recomputeAgain = false;
  readonly sketches: SketchController;
  private sketchDisplay: SketchDisplay;
  private navigator: Navigator;
  private files: FileCommands;
  private panelDeferred = false;
  private extrudeTool: ExtrudeTool | null = null;
  private tools: ToolLauncher;
  /** Provisional document shown while a tool previews its result (null: the real one); read by what acts on the 3D shown. */
  previewDoc: CadDocument | null = null;
  /** Cabinets and Répartitions kept on the face of another element by « Prolonger élément », put back after each change. */ private readonly follower = new ExtendFollower({ doc: () => this.doc, previewing: () => !!this.previewDoc, geometry: () => this.geometry, amend: (d) => { const prev = this.doc, done = this.change(d, true); this.tools.active?.adopt(prev, this.doc); return done; }, notify: (m, k) => this.notify(m, k) });

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
      sketchName: (id) => findFeature(this.doc, id)?.name ?? id,
      changed: () => {
        ref(this.root, "status-selection").textContent = this.picked.statusText();
        if (!this.picked.empty) this.openPanel("properties");
        this.render();
      },
    });
    this.sketchDisplay = new SketchDisplay(viewport, { doc: () => this.previewDoc ?? this.doc, selected: () => this.selectedFeature, select: (id) => this.selectFeature(id) });
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
      faceOutline: (bodyId, faceIndex) => this.geometry.faceOutline(bodyId, faceIndex), edgeOutline: (bodyId, edgeIndex) => this.geometry.edgeOutline(bodyId, edgeIndex), bodyOutline: (bodyId) => this.geometry.bodyOutline(bodyId), sectionOutline: (bodyId, o, u, v) => this.geometry.sectionOutline(bodyId, o, u, v),
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
        ref<HTMLSelectElement>(this.root, "units").value = this.unit;
        await this.recompute(true);
      },
    });
    this.navigator = new Navigator(root, {
      doc: () => this.doc,
      statuses: () => this.statuses,
      bodyIds: () => (this.result?.bodies ?? []).map((b) => b.bodyId),
      selectedId: () => this.selectedFeature,
      selectedBodyId: () => this.picked.bodyId ?? null,
      modelPicked: () => !this.picked.empty,
      pickedIds: () => this.picked.selection, toggleInSelection: (kind, id) => this.viewport.toggleInSelection(kind, id),
      selectFeature: (id) => this.selectFeature(id),
      selectBody: (id) => ((this.selectedFeature = id), this.viewport.selectBody(id), this.render()),
      selectBodies: (ids) => this.viewport.selectLevel({ bodies: ids }, false),
      toggleHidden: (id) => void this.change(toggleHidden(this.doc, id)),
      setHidden: (ids, hidden) => void this.change(setHidden(this.doc, ids, hidden)),
      rename: (id, name) => void this.change(updateFeature(this.doc, id, (f) => ({ ...f, name }))),
      renameBody: (id, name) => void this.change(renameBody(this.doc, id, name)),
      removeBody: (id) => this.removePicked({ bodies: [id] }),
      removeBodies: async (ids) => (await askConfirm(`Supprimer ${ids.length > 1 ? `les ${ids.length} corps` : "le corps"} ? (Ctrl+Z pour annuler)`, "Supprimer")) && this.removePicked({ bodies: ids }).then(() => true),
      changeDoc: (doc) => void this.change(doc),
      renameOffset: (sketch, id, name) => this.changeSketch(sketch, (f) => renameOffsetIn(f, id, name)),
      editOffset: (sketch, id) => this.sketches.editOffset(sketch, id),
      removeOffset: (sketch, id) => { void this.change(removeStep(this.doc, sketch, id)); this.sketches.sync(); },
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
      commit: (doc, id, after, amend) => {
        this.previewDoc = null;
        this.selectedFeature = id;
        void this.change(doc, amend).then(after);
      },
      notify: (message, kind) => this.notify(message, kind), extrude: () => this.extrudeCommand(), select: (id) => ((this.selectedFeature = id), this.render()),
      closed: () => {
        this.root.dataset.tool = "";
        this.render();
      },
      reopened: (kind) => (this.root.dataset.tool = kind),
    });
    this.bindActions();
    this.bindKeyboard();
    ref<HTMLSelectElement>(root, "units").value = this.unit;
    window.addEventListener("pagehide", () => session.flushOnExit());
    window.addEventListener("beforeunload", (event) => {
      // Without autosave, warn before losing changes (the recovery copy still exists).
      if (session.dirty && !session.autosave) event.preventDefault();
    });
    new MutationObserver(() => viewport.applyTheme()).observe(document.documentElement, { attributeFilter: ["class"] });
  }

  get doc(): CadDocument { return this.session.doc; }
  get unit(): DisplayUnit { return preferredUnit(); }

  notify(message: string, kind: "info" | "success" | "error" = "info"): void {
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
      const doc = this.previewDoc ?? this.doc, real = this.previewDoc ? null : doc;
      const result = await this.geometry.recompute(doc);
      this.show(result, real);
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

  /** Shows a regeneration: the worker's, or at opening the one kept in the browser (persistence/model-cache.ts). */
  show(result: RecomputeResponse, doc: CadDocument | null): void {
    this.result = result;
    this.statuses = new Map(result.statuses.map((s) => [s.id, s]));
    this.picked.invalidate();
    this.viewport.modelBodies = result.bodies; // bodies hidden with the eye of the browser stay in the document, not drawn
    this.viewport.setBodies(result.bodies.filter((b) => !isBodyHidden(this.previewDoc ?? this.doc, b.bodyId)));
    this.onShown(result, doc);
  }
  /** After each model shown, with the real document it was computed from (null: a tool's provisional one). */ onShown: (result: RecomputeResponse, doc: CadDocument | null) => void = () => {};

  /** Applies a new document as one undo step (workshop tools too); `amend`: in place of the last one (a tool set again). */
  change(next: CadDocument, amend = false): Promise<void> {
    // A change the project could not be reopened with is refused, said, and not recorded (audit of 11/11/2026).
    const doc = normalizeDoc(this.doc, next), problems = validateDocument(doc);
    if (problems.length) return (this.notify(`Modification refusée, le projet ne se rouvrirait plus : ${problems.slice(0, 2).join(" ; ")}`, "error"), Promise.resolve());
    this.session[amend ? "replace" : "apply"](doc);
    this.sketches.followDocument();
    this.updateHistoryButtons();
    return this.recompute().then(() => this.follower.after());
  }

  // ---- rendering ----------------------------------------------------------

  render(): void {
    this.viewport.invalidate();
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
      selection: this.picked.summary(),
      selectionActions: {
        fillet: () => this.openTool("fillet"),
        chamfer: () => this.openTool("chamfer"),
        extrude: () => this.extrudeCommand(),
        combine: () => this.openTool("combine"),
        split: () => this.openTool("split"),
        move: () => this.openTool("move"), pullFace: () => this.openTool("pullFace"), moveEdge: () => this.openTool("moveEdge"),
        sketch: () => {
          const face = this.picked.lastFace;
          if (face) void this.sketches.createOnFace(face);
        },
        clear: () => this.viewport.clearSelection(), remove: () => this.removePicked(this.picked.selection), step: (body) => this.sketches.stepOf(body),
      },
      targets: extrudeTargets(this.doc, feature?.id ?? null),
      sketch: {
        editing,
        onEdit: () => feature && this.sketches.open(feature.id),
        onDimension: (id, value) => (feature ? this.sketches.setDimensionOf(feature.id, id, value) : false),
        onRemoveConstraint: (id) => this.sketches.removeConstraint(id),
        onOffset: (value) => this.patchSelected((f) => (f.type === "sketch" ? withPlaneOffset(f, value) : f)),
      },
      onEditExtrude: () => feature?.type === "extrude" && this.extrudeCommand(feature.id),
      onEditFeature: () => feature && this.tools.edit(feature.id),
      onCommit: (patch) => this.patchSelected(patch),
    });
    this.updateHistoryButtons();
    for (const hook of [...this.renderHooks]) hook();
  }

  /** Called after every render, in the order subscribed: the panels and the body colours follow the document. */
  private renderHooks: (() => void)[] = [];
  /** Runs `hook` after every render (audit of 11/11/2026, instead of chaining a callback); returns what stops it. */
  afterRender(hook: () => void): () => void {
    this.renderHooks.push(hook);
    return () => void (this.renderHooks = this.renderHooks.filter((h) => h !== hook));
  }
  /** Shows `doc` regenerated without recording it (a variant to capture), or the document again (null). */
  showUnrecorded = async (doc: CadDocument | null): Promise<void> => { this.previewDoc = doc; await this.recompute(); while (this.recomputing) await new Promise((r) => setTimeout(r, 30)); };
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
    this.root.dispatchEvent(new CustomEvent("cad:feature-selected", { detail: id }));
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
    else if (feature?.type === "niche") void (feature.fill === "doors" || feature.fill === "back" ? this.sketches.editOffset(feature.sketch, feature.partition) : this.sketches.startEquip(feature.fill, feature.sketch, feature));
    else if (feature) this.tools.edit(id);
  }

  /** Changes a sketch from outside the sketch mode; the sketch being edited is re-read so it cannot write back old data. */
  private changeSketch(id: string, change: (sketch: SketchFeature) => SketchFeature): void {
    void this.change(updateFeature(this.doc, id, (f) => (f.type === "sketch" ? change(f) : f)));
    this.sketches.sync();
  }

  /** Deletes what is picked (Suppr): bodies (also through a face, an edge or a corner), sketches, lines and points of sketches. */
  private async removePicked(selection: Parameters<typeof deletionOf>[1]): Promise<void> {
    const plan = deletionOf(this.doc, selection, this.viewport.displayedBodies);
    if (!plan.features.length && !plan.edits.length && !plan.pieces.length) return void (plan.skipped && this.notify("Une zone ne se supprime pas : sélectionnez ses traits, ou l'esquisse entière.", "info"));
    if (await confirmDeletion(this.doc, plan)) await this.removeFeature(plan.features, plan.edits, plan.pieces);
  }

  private toggleSuppress(id: string): void {
    void this.change(updateFeature(this.doc, id, (f) => ({ ...f, suppressed: !f.suppressed })));
  }

  /** Deletes features (several at once: one undo step), after asking when other features go with them. */
  private async removeFeature(ids: string | string[], edits: SketchFeature[] = [], pieces: string[] = []): Promise<void> {
    const base = removePieces(edits.reduce((d, sketch) => updateFeature(d, sketch.id, () => sketch), this.doc), pieces);
    const list = (typeof ids === "string" ? [ids] : ids).filter((id) => findFeature(base, id));
    if (list.length === 0 && edits.length === 0 && pieces.length === 0) return;
    const { next, lost } = removeWithShelves(base, list);
    const names = (of: string[]) => of.map((d) => findFeature(this.doc, d)?.name ?? d).join(", ");
    if (lost.length > 0 && !(await askConfirm(`Supprimer « ${names(list)} » supprimera aussi : ${names(lost)}. Continuer ?`, "Supprimer"))) return;
    if (this.selectedFeature && !findFeature(next, this.selectedFeature)) this.selectedFeature = null;
    if (this.sketches.mode && !findFeature(next, this.sketches.mode.featureId)) this.sketches.finish();
    this.viewport.clearSelection();
    void this.change(next);
  }

  /**
   * Opens the interactive extrusion: on the sketch being edited or selected, otherwise waiting for a profile click in
   * the view. A sketch of lines only (no closed area) goes to Toit (one line on the top of a body) or Panneaux.
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
    const strokes = sketchId ? findFeature(this.doc, sketchId) : undefined;
    if (!featureId && strokes?.type === "sketch" && strokesOnly(strokes)) {
      const { kind, message } = strokesTool(strokes, this.viewport);
      this.selectedFeature = strokes.id;
      this.openTool(kind);
      return this.notify(message, "info");
    }
    if (this.sketches.active) this.sketches.finish();
    this.extrudeTool?.cancel();
    this.tools.active?.cancel();
    const main = this.root.querySelector("main");
    if (!main) return;
    this.extrudeTool = new ExtrudeTool(this.viewport, {
      doc: () => this.doc, change: (next, amend) => void this.change(next, amend), notify: (message, kind) => this.notify(message, kind),
      bodies: () => this.visibleBodies(), unit: () => this.unit,
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
    this.sketches.cancelJoinery();
    this.extrudeTool?.cancel();
    const selected = this.selectedFeature ? findFeature(this.doc, this.selectedFeature) : undefined;
    this.root.dataset.tool = kind;
    this.tools.open(kind, toolOptions(kind, selected, this.picked));
  }

  private historyStep(direction: "undo" | "redo"): void {
    const moved = direction === "undo" ? this.session.stepBack() : this.session.stepForward();
    if (!moved) return;
    if (this.selectedFeature && !findFeature(this.doc, this.selectedFeature)) this.selectedFeature = null;
    ref<HTMLSelectElement>(this.root, "units").value = this.unit;
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
      "add-hole": () => this.openTool("hole"), revolve: () => this.openTool("revolve"), fillet: () => this.openTool("fillet"), chamfer: () => this.openTool("chamfer"), combine: () => this.openTool("combine"), split: () => this.openTool("split"), move: () => this.openTool("move"),
      partition: () => this.sketches.startJoinery("partition", this.selectedFeature),
      shelves: () => this.sketches.startJoinery("shelves", this.selectedFeature),
      cloisons: () => this.sketches.startJoinery("cloisons", this.selectedFeature),
      penderie: () => this.sketches.startEquip("rod", this.selectedFeature),
      tiroirs: () => this.sketches.startEquip("drawers", this.selectedFeature), module: () => this.sketches.startEquip("module", this.selectedFeature), niche: () => this.sketches.startEquip("niche", this.selectedFeature), accessory: () => this.sketches.startEquip("accessory", this.selectedFeature),
      panels: () => this.openTool("panels"), paneling: () => this.openTool("paneling"), cabinet: () => this.openTool("cabinet"), "face-strip": () => this.openTool("faceStrip"), mirror: () => this.openTool("mirror"), align: () => this.openTool("align"), mate: () => this.openTool("mate"), coincide: () => this.openTool("coincide"), "face-glue": () => this.openTool("faceGlue"), "extend-element": () => this.openTool("extend"), push: () => this.openTool("push"), appliances: () => this.openTool("appliances"), trim: () => this.openTool("trim"), snack: () => this.openTool("snack"), room: () => this.openTool("room"), stretch: () => this.openTool("stretch"), array: () => this.openTool("array"), rotate: () => this.openTool("rotate"), "draw-on-face": () => this.openTool("drawOnFace"), machining: () => this.openTool("machining"), cutout: () => this.openTool("cutout"), sweep: () => this.openTool("sweep"), shell: () => this.openTool("shell"), hollow: () => this.openTool("hollow"), "split-sides": () => this.openTool("splitSides"), "copy-ops": () => this.openTool("copyOps"), loft: () => this.openTool("loft"), modifier: () => this.openTool("modifier"), fronts: () => this.openTool("fronts"), assembly: () => this.openTool("assembly"), overlap: () => this.openTool("overlap"), "layout-copy": () => this.openTool("layoutCopy"), kitchen: () => this.openTool("kitchen"), lighting: () => this.openTool("lighting"), gable: () => this.openTool("gable"), "oi-intersect": () => this.openTool("intersect"), ffd: () => this.openTool("ffd"), swap: () => this.openTool("swap"), spacing: () => this.openTool("spacing"), "extrude-path": () => this.openTool("extrudePath"), dressing: () => this.openTool("dressing"), "rect-array": () => this.openTool("rectArray"),
      extrude: () => this.extrudeCommand(),
      "export-step": () => void this.files.exportGeometry("step"),
      "export-stl": () => void this.files.exportGeometry("stl"),
      "export-native": () => this.files.exportNative(),
      "import-native": () => ref<HTMLInputElement>(this.root, "import-file").click(),
      view: (target) => (this.viewport.setView(target.dataset.view as StandardView), target.closest("details")?.removeAttribute("open")),
      fit: () => this.viewport.fit(),
      panel: (target) => this.openPanel(target.dataset.panel as "tree" | "properties"),
      "close-panels": () => this.openPanel(null),
      deselect: () => (this.viewport.clearSelection(), this.selectFeature(null)),
    };
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      const action = target?.dataset.action;
      if (target && action && actions[action]) actions[action](target);
    });
    ref<HTMLSelectElement>(this.root, "units").addEventListener("change", (event) => {
      const units = (event.target as HTMLSelectElement).value as DisplayUnit;
      setPreferredUnit(units);
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
      escape: () => (this.viewport.clearSelection(), this.selectFeature(null)),
      deleteSelected: () => (this.picked.empty ? this.selectedFeature && this.removeFeature(this.selectedFeature) : this.removePicked(this.picked.selection)),
      fit: () => this.viewport.fit(),
      hole: () => this.openTool("hole"),
      extrude: () => this.extrudeCommand(),
    });
  }
}
