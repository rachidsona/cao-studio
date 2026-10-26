/**
 * Editor side of sketch mode: creating and opening sketches, the sketch
 * toolbar, keyboard shortcuts, and synchronisation with the document
 * (undo/redo, properties panel).
 */
import type { SketchGeometry } from "../document/sketch";
import { emptySketchGeometry } from "../document/sketch";
import { solveSketch } from "../constraints/solver";
import { findCurve, setDimensionValue } from "../sketcher/edit";
import { findFeature, uniqueId, uniqueOffsetId, updateFeature } from "../document/operations";
import type { CadDocument, DisplayUnit, PlaneName, SketchFeature } from "../document/types";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import type { FaceOutline } from "../geometry/protocol";
import { sketchFrame } from "../sketcher/frame";
import { SketchMode } from "../sketcher/mode";
import { planeForFace, projectOutline } from "../sketcher/projection";
import type { FacePick } from "../viewport/viewport";
import type { ToolName } from "../sketcher/tools";
import { ref } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";

export interface SketchControllerHost {
  doc(): CadDocument;
  /** Applies a new document as one undo step and regenerates the model. */
  change(next: CadDocument): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  select(featureId: string | null): void;
  render(): void;
  openPanel(panel: "tree" | "properties" | null): void;
  unit(): DisplayUnit;
  /** Leaves the sketch and starts the interactive extrusion on it. */
  extrude(): void;
  /** Planar face picked in the 3D model, if any (a new sketch is then drawn on it). */
  selectedFace(): FacePick | undefined;
  faceOutline(bodyId: string, faceIndex: number): Promise<FaceOutline>;
  offset(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
}

const TOOL_KEYS: Record<string, ToolName> = { s: "select", l: "line", r: "rectangle", c: "circle", a: "arc" };

export class SketchController {
  mode: SketchMode | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly viewport: Viewport,
    private readonly host: SketchControllerHost,
  ) {
    root.addEventListener("click", (event) => {
      // "Esquisse" with a face selected: sketch directly on that face, no plane menu.
      const entry = (event.target as HTMLElement).closest("[data-sketch-entry]");
      const face = entry ? this.host.selectedFace() : undefined;
      if (face) {
        event.preventDefault();
        void this.createOnFace(face);
        return;
      }
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-sketch-tool],[data-sketch-command],[data-new-sketch]");
      if (!target) return;
      if (target.dataset.newSketch) {
        (target.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        this.create(target.dataset.newSketch as PlaneName);
      } else if (target.dataset.sketchTool) this.mode?.setTool(target.dataset.sketchTool as ToolName | "dimension" | "offset" | "move" | "extend" | "trim" | "array");
      else if (target.dataset.sketchCommand) this.command(target.dataset.sketchCommand);
    });
  }

  get active(): boolean {
    return this.mode !== null;
  }

  create(plane: PlaneName): void {
    const doc = this.host.doc();
    const id = uniqueId(doc, "sk");
    const count = doc.features.filter((f) => f.type === "sketch").length + 1;
    const feature: SketchFeature = { id, type: "sketch", name: `Esquisse ${count}`, plane, offset: 0, ...emptySketchGeometry() };
    this.host.change({ ...doc, features: [...doc.features, feature] });
    this.open(id);
  }

  /**
   * New sketch on a planar body face: plane from the face, face boundary
   * projected as fixed reference geometry to snap on.
   */
  async createOnFace(face: FacePick): Promise<void> {
    let outline: FaceOutline;
    try {
      outline = await this.host.faceOutline(face.bodyId, face.faceIndex);
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
      return;
    }
    const placement = outline.surface === "PLANE" ? planeForFace(outline.normal, outline.center) : null;
    if (!placement) {
      this.host.notify("Esquisse possible seulement sur une face plane parallèle aux plans XY, XZ ou YZ.", "error");
      return;
    }
    const doc = this.host.doc();
    const id = uniqueId(doc, "sk");
    const count = doc.features.filter((f) => f.type === "sketch").length + 1;
    const geometry = projectOutline(outline, sketchFrame(placement.plane, placement.offset));
    const feature: SketchFeature = {
      id,
      type: "sketch",
      name: `Esquisse ${count}`,
      plane: placement.plane,
      offset: Number(placement.offset.toFixed(6)),
      ...geometry,
      support: face.bodyId,
    };
    this.host.change({ ...doc, features: [...doc.features, feature] });
    this.open(id);
    this.host.notify("Esquisse sur la face : les arêtes du corps (en violet) servent d'accroche.", "info");
  }

  open(featureId: string): void {
    const feature = findFeature(this.host.doc(), featureId);
    if (feature?.type !== "sketch") return;
    this.mode?.exit();
    this.mode = new SketchMode(feature, this.viewport, {
      commit: (id, geometry) => this.commit(id, geometry),
      notify: (message, kind) => this.host.notify(message, kind),
      changed: () => this.refresh(),
      focusDimension: (id) => this.focusDimension(id),
      unit: () => this.host.unit(),
      calculatorContainer: () => this.root.querySelector("main") ?? this.root,
      offset: (paths, distance, join) => this.host.offset(paths, distance, join),
      offsetId: () => uniqueOffsetId(this.host.doc()),
    });
    this.host.select(featureId);
    this.root.dataset.mode = "sketch";
    this.refresh();
  }

  /** Opens the sketch and redoes one of its offsets (from the timeline). */
  editOffset(sketchId: string, offsetId: string): void {
    this.open(sketchId);
    this.mode?.editOffset(offsetId);
  }

  finish(): void {
    if (!this.mode) return;
    const id = this.mode.featureId;
    this.mode.exit();
    this.mode = null;
    this.root.dataset.mode = "model";
    this.host.select(id);
    this.refresh();
  }

  private commit(featureId: string, geometry: SketchGeometry): void {
    const doc = this.host.doc();
    this.host.change(updateFeature(doc, featureId, (f) => (f.type === "sketch" ? { ...f, ...geometry } : f)));
  }

  /** After undo/redo or a document reload: follow the document, or leave if the sketch is gone. */
  sync(): void {
    if (!this.mode) return;
    const feature = findFeature(this.host.doc(), this.mode.featureId);
    if (feature?.type === "sketch") this.mode.sync(feature);
    else this.finish();
    this.refresh();
  }

  /**
   * Dimension edited in the properties panel, in the sketch being edited or in another one:
   * solved first, refused (false) if the sketch cannot satisfy it.
   */
  setDimensionOf(featureId: string, dimensionId: string, value: number): boolean {
    if (this.mode?.featureId === featureId) return this.mode.setDimension(dimensionId, value);
    const feature = findFeature(this.host.doc(), featureId);
    if (feature?.type !== "sketch") return false;
    try {
      const result = solveSketch(setDimensionValue(feature, dimensionId, value));
      if (result.state === "conflicting" || result.state === "failed") {
        this.host.notify("Cote refusée : l'esquisse ne peut pas la respecter.", "error");
        return false;
      }
      this.commit(featureId, result.geometry);
      return true;
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
      return false;
    }
  }

  removeConstraint(id: string): void {
    this.mode?.removeConstraint(id);
  }

  private command(id: string): void {
    const mode = this.mode;
    if (!mode) return;
    if (id === "finish") return this.finish();
    if (id === "extrude") return this.host.extrude();
    if (id === "fit") return mode.ensureVisible(true);
    if (id === "glyphs") return mode.toggleGlyphs();
    if (id === "gridsnap") return mode.toggleGridSnap();
    if (id === "construction") return mode.toggleConstruction();
    if (id === "delete") return mode.deleteSelection();
    const created = mode.runCommand(id);
    const dimension = created.find((c) => mode.geometry.constraints.some((k) => k.id === c && "value" in k));
    if (dimension) this.focusDimension(dimension);
  }

  focusDimension(id: string): void {
    this.host.openPanel("properties");
    this.host.render();
    const input = this.root.querySelector<HTMLInputElement>(`[data-dimension="${CSS.escape(id)}"]`);
    input?.focus();
    input?.select();
  }

  /** Updates the sketch toolbar (active tool, applicable commands, construction) and the hint. */
  refresh(): void {
    const mode = this.mode;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sketch-tool]")) {
      button.setAttribute("aria-pressed", String(mode?.toolName === button.dataset.sketchTool));
    }
    const applicable = new Set(mode?.applicableCommands() ?? []);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-sketch-command]")) {
      const id = button.dataset.sketchCommand as string;
      if (id === "gridsnap") {
        button.setAttribute("aria-pressed", String(!!mode?.gridSnap));
      } else if (id === "glyphs") {
        button.setAttribute("aria-pressed", String(!!mode?.showGlyphs));
      } else if (id === "construction") {
        const selectedCurves = mode ? [...mode.selection].filter((s) => findCurve(mode.geometry, s)).length : 0;
        button.setAttribute("aria-pressed", String(!!mode?.construction && selectedCurves === 0));
      } else if (id === "delete") button.disabled = !mode || mode.selection.size === 0;
      else if (id !== "finish" && id !== "extrude" && id !== "fit" && id !== "glyphs") {
        // Constraints are always available (as in Fusion): with the right selection they apply at once,
        // otherwise they wait for the clicks (the waiting one shows pressed).
        button.disabled = !mode;
        button.setAttribute("aria-pressed", String(mode?.waitingCommand === id));
      }
    }
    const hint = ref(this.root, "status-hint");
    hint.textContent = mode ? mode.hint : "";
    const dof = ref(this.root, "sketch-dof");
    if (mode) {
      const { state, dof: n } = mode.lastSolve;
      dof.textContent = state === "redundant" ? "Redondante" : n === 0 ? "Entièrement contrainte" : `${n} DDL`;
      dof.dataset.state = state === "redundant" ? "warn" : n === 0 ? "full" : "free";
    }
    this.host.render();
  }

  /** Keyboard shortcuts in sketch mode; returns true when handled. */
  handleKey(event: KeyboardEvent): boolean {
    const mode = this.mode;
    if (!mode || event.metaKey || event.ctrlKey || event.altKey) return false;
    const key = event.key.toLowerCase();
    if (mode.panelToolActive && (event.key === "Escape" || event.key === "Enter")) {
      if (event.key === "Enter") mode.confirmPanelTool();
      else mode.cancel();
      return true;
    }
    if (event.key === "Escape") {
      // Échap first leaves the tool (drawing, Prolonger, a waiting constraint, Cote), then the selection, then the sketch.
      if (mode.toolActive || mode.selection.size) mode.cancel();
      else this.finish();
      return true;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      mode.deleteSelection();
      return true;
    }
    if (key === "enter") {
      this.finish();
      return true;
    }
    const tool = TOOL_KEYS[key];
    if (tool) {
      mode.setTool(tool);
      return true;
    }
    if (key === "x") {
      mode.toggleConstruction();
      return true;
    }
    if (key === "e") {
      this.host.extrude();
      return true;
    }
    if (key === "f") {
      mode.ensureVisible(true);
      return true;
    }
    if (key === "d") {
      mode.setTool("dimension");
      return true;
    }
    if (key === "g") {
      mode.toggleGridSnap();
      return true;
    }
    if (key === "o") {
      mode.setTool("offset");
      return true;
    }
    if (key === "m") {
      mode.setTool("move");
      return true;
    }
    return false;
  }
}
