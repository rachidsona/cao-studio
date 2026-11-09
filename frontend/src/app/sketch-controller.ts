/**
 * Editor side of sketch mode: creating and opening sketches, the sketch
 * toolbar, keyboard shortcuts, and synchronisation with the document
 * (undo/redo, properties panel).
 */
import { importDxf } from "./sketch-import";
import { openUnderlay } from "./sketch-underlay";
import { autoDimensions } from "../sketcher/auto-dimensions";
import { openSketchTransform } from "./sketch-transform-dialog";
import type { SketchGeometry } from "../document/sketch";
import { emptySketchGeometry } from "../document/sketch";
import { stepOfBody, withSketchExtrusion } from "../document/sketch-extrusion";
import { solveSketch } from "../constraints/solver";
import { findCurve, setDimensionValue } from "../sketcher/edit";
import { findFeature, uniqueId, uniqueOffsetId } from "../document/operations";
import type { CadDocument, DisplayUnit, NicheFeature, PlaneName, SketchFeature } from "../document/types";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import type { EdgeOutline, FaceOutline } from "../geometry/protocol";
import { frameOf, nearestPlane, planeFrame, type Placement, type Vec3 } from "../sketcher/frame";
import { openConstructionPlane } from "./construction-plane";
import { SketchMode, type SketchExtrusion, type SketchToolName } from "../sketcher/mode";
import { extrusionOption } from "../sketcher/extrusion-option";
import { isPartition } from "../sketcher/partition-history";
import { Joinery3D, partitionHolder, type JoineryHost } from "./joinery-3d";
import type { NicheFill } from "./dressing/niche-tool";
import { withEquipment } from "../document/equipment";
import { planeForFace, projectOutline } from "../sketcher/projection";
import type { FacePick } from "../viewport/viewport";
import type { ToolName } from "../sketcher/tools";
import { typedDigit } from "../sketcher/edge-offset-tool";
import { ref } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";

/** Direction of the longest straight edge of a face (the x axis of a sketch drawn on it). */
function longestEdge(outline: FaceOutline): Vec3 | undefined {
  let best: { dir: Vec3; length: number } | undefined;
  for (const e of outline.edges) {
    if (e.kind !== "line") continue;
    const dir: Vec3 = [e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]];
    const length = Math.hypot(...dir);
    if (!best || length > best.length) best = { dir, length };
  }
  return best?.dir;
}

/** The number after the highest « name n » of the features (« Côté 4 » when there are « Côté 1 » to « Côté 3 »). */
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
  edgeOutline(bodyId: string, edgeIndex: number): Promise<EdgeOutline>;
  bodyOutline(bodyId: string): Promise<EdgeOutline[]>;
  sectionOutline(bodyId: string, origin: Vec3, u: Vec3, v: Vec3): Promise<EdgeOutline[]>;
  offset(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
}

const TOOL_KEYS: Record<string, ToolName> = { s: "select", l: "line", r: "rectangle", c: "circle", a: "arc" };

export class SketchController {
  mode: SketchMode | null = null;
  /** Répartition, Étagères or Cloisons being worked in the 3D view. */
  private joinery: Joinery3D | null = null;

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
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-sketch-tool],[data-sketch-command],[data-new-sketch],[data-construction-plane]");
      if (!target) return;
      if (target.dataset.newSketch) {
        (target.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        this.create(target.dataset.newSketch as PlaneName);
      } else if (target.dataset.constructionPlane !== undefined) {
        (target.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        this.openConstructionPlane();
      } else if (target.dataset.sketchTool) this.mode?.setTool(target.dataset.sketchTool as SketchToolName);
      else if (target.dataset.sketchCommand) this.command(target.dataset.sketchCommand);
    });
  }

  get active(): boolean {
    return this.mode !== null;
  }

  create(plane: PlaneName): void {
    this.createOn({ plane, offset: 0 });
  }

  /** New empty sketch on a main plane or a construction plane. */
  createOn(placement: Placement): void {
    const doc = this.host.doc();
    const id = uniqueId(doc, "sk");
    const count = doc.features.filter((f) => f.type === "sketch").length + 1;
    const { plane, offset, frame } = placement;
    const feature: SketchFeature = { id, type: "sketch", name: `Esquisse ${count}`, plane, offset, ...(frame ? { frame } : {}), ...emptySketchGeometry() };
    this.host.change({ ...doc, features: [...doc.features, feature] });
    this.open(id);
  }

  /** The construction plane panel (offset and angled plane, or through three corners). */
  private openConstructionPlane(): void {
    const container = this.viewport.renderer.domElement.parentElement as HTMLElement;
    openConstructionPlane(container, this.viewport, {
      unit: () => this.host.unit(),
      modelSize: () => {
        const corners = this.viewport.bodyVertices();
        if (!corners.length) return 100;
        const span = [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!)) - Math.min(...corners.map((c) => c[i]!)));
        return Math.max(...span);
      },
      create: (placement) => this.createOn(placement),
      notify: (message, kind) => this.host.notify(message, kind),
    });
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
    if (outline.surface !== "PLANE") {
      this.host.notify("Une esquisse se pose sur une face plane (pas sur une face courbe).", "error");
      return;
    }
    // A face parallel to a main plane keeps that plane; a slanted face gets a construction plane along its longest edge.
    const main = planeForFace(outline.normal, outline.center);
    const placement: Placement = main ?? { plane: nearestPlane(outline.normal), offset: 0, frame: planeFrame(outline.center, outline.normal, longestEdge(outline)) };
    const doc = this.host.doc();
    const id = uniqueId(doc, "sk");
    const count = doc.features.filter((f) => f.type === "sketch").length + 1;
    const geometry = projectOutline(outline, frameOf(placement));
    const feature: SketchFeature = {
      id,
      type: "sketch",
      name: `Esquisse ${count}`,
      plane: placement.plane,
      offset: Number(placement.offset.toFixed(6)),
      ...(placement.frame ? { frame: placement.frame } : {}),
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
    this.joinery?.cancel();
    this.mode?.exit();
    this.mode = new SketchMode(feature, this.viewport, {
      commit: (id, geometry, extrusion) => this.commit(id, geometry, extrusion),
      notify: (message, kind) => this.host.notify(message, kind),
      changed: () => this.refresh(),
      focusDimension: (id) => this.focusDimension(id),
      unit: () => this.host.unit(),
      calculatorContainer: () => this.root.querySelector("main") ?? this.root,
      offset: (paths, distance, join) => this.host.offset(paths, distance, join),
      offsetId: () => uniqueOffsetId(this.host.doc()),
      edgeOutline: (bodyId, edgeIndex) => this.host.edgeOutline(bodyId, edgeIndex),
      faceOutline: (bodyId, faceIndex) => this.host.faceOutline(bodyId, faceIndex),
      bodyOutline: (bodyId) => this.host.bodyOutline(bodyId),
      sectionOutline: (bodyId, origin, u, v) => this.host.sectionOutline(bodyId, origin, u, v),
    });
    this.host.select(featureId);
    this.root.dataset.mode = "sketch";
    this.refresh();
  }

  /**
   * « Répartition », « Étagères » and « Cloisons » from the 3D toolbar, worked in the 3D view (joinery-3d.ts). A new
   * Répartition goes to a new sketch of the front plane, its panels extruded; Étagères and Cloisons divide the niches
   * of the sketch that holds a répartition (the one chosen, else the last one), at the depth of its panels.
   */
  startJoinery(tool: "partition" | "shelves" | "cloisons", selected: string | null): void {
    this.finish();
    this.joinery?.cancel();
    if (tool === "partition") {
      extrusionOption.on = true;
      this.joinery = Joinery3D.partition(this.viewport, this.joineryHost(), null);
      return;
    }
    const sketch = partitionHolder(this.host.doc(), selected);
    if (!sketch) {
      this.host.notify(`${tool === "cloisons" ? "Cloisons" : "Étagères"} divise les niches d'une répartition : faites d'abord une Répartition.`, "error");
      return;
    }
    // The shelves (or cloisons) are bodies too, as deep as the panels of the répartition.
    const depth = (sketch.offsets ?? []).filter(isPartition).map((r) => r.step.depth).find((d) => d !== undefined);
    extrusionOption.on = true;
    if (depth !== undefined) extrusionOption.depth = depth;
    this.joinery = Joinery3D.division(this.viewport, this.joineryHost(), sketch, tool === "cloisons");
  }

  /**
   * « Penderie », « Tiroirs », « Module » and « Niche » from the 3D toolbar: work in the niches of the sketch that holds a répartition
   * (the one chosen, else the last one); or change an equipment of the history (`editing`).
   */
  startEquip(fill: NicheFill | "module" | "niche", selected: string | null, editing: NicheFeature | null = null): void {
    this.finish();
    this.joinery?.cancel();
    const sketch = partitionHolder(this.host.doc(), editing?.sketch ?? selected);
    if (!sketch) {
      this.host.notify(`${fill === "niche" ? "Niche règle" : fill === "module" ? "Module équipe" : fill === "rod" ? "Penderie équipe" : fill === "door" ? "Porte sur niches occupe" : "Tiroirs équipe"} les niches d'une répartition : faites d'abord une Répartition.`, "error");
      return;
    }
    this.joinery = fill === "niche" ? Joinery3D.height(this.viewport, this.joineryHost(), sketch) : fill === "module" ? Joinery3D.module(this.viewport, this.joineryHost(), sketch) : Joinery3D.equip(this.viewport, this.joineryHost(), sketch, fill, editing);
  }

  /** An OK of Penderie or Tiroirs: the features added (or the one changed), as one undo step. */
  private applyEquipment(features: NicheFeature[], success: string): boolean {
    this.host.change(withEquipment(this.host.doc(), features));
    this.host.notify(success, "success");
    return true;
  }

  /** Another tool takes the view: the joinery tool in progress ends. */
  cancelJoinery(): void {
    this.joinery?.cancel();
  }

  private joineryHost(): JoineryHost {
    return {
      doc: () => this.host.doc(),
      unit: () => this.host.unit(),
      container: () => this.root.querySelector("main") ?? this.root,
      offsetId: () => uniqueOffsetId(this.host.doc()),
      apply: (sketchId, geometry, success, extrusion) => this.applyJoinery(sketchId, geometry, success, extrusion),
      applyFeatures: (features, success) => this.applyEquipment(features, success),
      applyDocument: (doc, success) => (this.host.change(doc), this.host.notify(success, "success")),
      notify: (message, kind) => this.host.notify(message, kind),
      closed: () => {
        this.joinery = null;
        this.host.render();
      },
    };
  }

  /** A joinery OK: the geometry solved and stored (in a new sketch of the front plane when there is none yet). */
  private applyJoinery(sketchId: string | null, geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion): string | null {
    const result = solveSketch(geometry);
    if (result.state === "conflicting" || result.state === "failed") {
      this.host.notify("Modification refusée : l'esquisse de la répartition ne peut pas être résolue.", "error");
      return null;
    }
    let doc = this.host.doc();
    let id = sketchId;
    if (!id) {
      id = uniqueId(doc, "sk");
      const count = doc.features.filter((f) => f.type === "sketch").length + 1;
      doc = { ...doc, features: [...doc.features, { id, type: "sketch", name: `Esquisse ${count}`, plane: "XZ", offset: 0, ...emptySketchGeometry() }] };
    }
    this.commit(id, result.geometry, extrusion, doc);
    this.host.notify(success, "success");
    return id;
  }

  /** Changes a step of the timeline: a Décalage in its sketch, a Répartition, Étagères or Cloisons in the 3D view. */
  editOffset(sketchId: string, offsetId: string): void {
    const sketch = findFeature(this.host.doc(), sketchId);
    const record = sketch?.type === "sketch" ? sketch.offsets?.find((o) => o.id === offsetId) : undefined;
    if (sketch?.type === "sketch" && record?.step) {
      this.finish();
      this.joinery?.cancel();
      this.joinery =
        record.step.kind === "partition"
          ? Joinery3D.partition(this.viewport, this.joineryHost(), sketch, record)
          : Joinery3D.division(this.viewport, this.joineryHost(), sketch, record.step.input.vertical === true, record);
      return;
    }
    this.open(sketchId);
    this.mode?.editOffset(offsetId);
  }

  /** The step that made this body, and how to change it from the piece. */
  stepOf(body: string): { name: string; kind: "partition" | "shelves"; run(): void } | null {
    const step = stepOfBody(this.host.doc(), body);
    return step && { name: step.name, kind: step.kind, run: () => this.editOffset(step.sketch, step.offset) };
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

  private commit(featureId: string, geometry: SketchGeometry, extrusion?: SketchExtrusion, base = this.host.doc()): void {
    this.host.change(withSketchExtrusion(base, featureId, geometry, extrusion));
  }

  /** After undo/redo or a document reload: follow the document, or leave if the sketch is gone. */
  sync(): void {
    this.joinery?.sync();
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
    if (id === "importdxf") return importDxf(mode, (m, k) => this.host.notify(m, k));
    if (id === "underlay") return openUnderlay(mode, (m, k) => this.host.notify(m, k));
    if (id === "autodim") {
      const { geometry, count } = autoDimensions(mode.geometry, mode.selection);
      if (!count) return this.host.notify("Rien à coter : sélectionnez des traits, ou dessinez d'abord.", "info");
      mode.apply(geometry, `Cotation automatique : ${count} cote${count > 1 ? "s" : ""} de référence.`);
      return;
    }
    if (id === "skmirror" || id === "skrotate" || id === "skscale" || id === "skpolar") return openSketchTransform(id === "skmirror" ? "mirror" : id === "skrotate" ? "rotate" : id === "skscale" ? "scale" : "polar", mode, (m, k) => this.host.notify(m, k));
    if (id === "glyphs") return mode.toggleGlyphs();
    if (id === "points") return mode.togglePoints();
    if (id === "gridsnap") return mode.toggleGridSnap();
    if (id === "geomsnap" || id === "smartsnap") return mode.toggleSnap(id === "geomsnap" ? "geometrySnap" : "smartSnap");
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
      if (id === "gridsnap" || id === "geomsnap" || id === "smartsnap") {
        button.setAttribute("aria-pressed", String(!!mode?.[id === "gridsnap" ? "gridSnap" : id === "geomsnap" ? "geometrySnap" : "smartSnap"]));
      } else if (id === "glyphs") {
        button.setAttribute("aria-pressed", String(!!mode?.showGlyphs));
      } else if (id === "points") {
        button.setAttribute("aria-pressed", String(!!mode?.showPoints));
      } else if (id === "construction") {
        const selectedCurves = mode ? [...mode.selection].filter((s) => findCurve(mode.geometry, s)).length : 0;
        button.setAttribute("aria-pressed", String(!!mode?.construction && selectedCurves === 0));
      } else if (id === "delete") button.disabled = !mode || mode.selection.size === 0;
      else if (id !== "finish" && id !== "extrude" && id !== "fit" && id !== "glyphs" && id !== "points") {
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
      dof.textContent = state === "redundant" ? "Redondante" : n === 0 ? "Entièrement contrainte" : `${n} à fixer`;
      dof.dataset.state = state === "redundant" ? "warn" : n === 0 ? "full" : "free";
    }
    this.host.render();
  }

  /** Keyboard shortcuts in sketch mode; returns true when handled. */
  handleKey(event: KeyboardEvent): boolean {
    if (this.joinery && !event.metaKey && !event.ctrlKey && !event.altKey) return this.joinery.handleKey(event);
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
    // « Décaler l'arête »: a digit or a minus sign types the distance of the copy shown.
    const typed = typedDigit(event) ?? (/^[.,\-(]$/.test(event.key) ? event.key : null);
    if (mode.edgeOffset && typed !== null && mode.edgeOffset.typeValue(typed)) return true;
    // Polygon tool: a digit sets its number of sides.
    if (mode.tool?.name === "polygon" && /^[3-9]$/.test(key)) {
      mode.tool.sides = Number(key);
      this.refresh();
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
