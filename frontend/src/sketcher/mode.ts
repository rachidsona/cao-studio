/**
 * Sketch mode controller: pointer interaction on the sketch plane (drawing
 * tools, selection, point dragging), constraint commands, and the commit
 * rule: every change is solved first and rejected if it over-constrains the
 * sketch, so the document only ever holds solvable sketches.
 */
import { classify, COMMANDS, describeConstraints } from "../constraints/catalog";
import { solveSketch, SketchError, type SolveResult } from "../constraints/solver";
import { ORIGIN, type DimensionConstraint, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit, SketchFeature } from "../document/types";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { closeCalculator, openCalculator } from "../ui/calculator";
import {
  dimensionAnnotations,
  dimensionLineDistance,
  existingDimension,
  measureAnnotations,
  matchingDimension,
  pairAnnotation,
  placementOffset,
  selectionSpec,
  previewAnnotations,
  type Annotation,
  type DimensionSpec,
} from "./annotations";
import { extractLoops, regions as regionsOf, type Region } from "./loops";
import { pruneBodyPoints, withBodyPoints } from "./body-points";

const GLYPHS_KEY = "cao-studio:sketch-glyphs";
const GRID_SNAP_KEY = "cao-studio:sketch-grid-snap";
import { addConstraint, findCurve, measure, removeEntities, setDimensionValue, toggleConstruction, type Vec2 } from "./edit";
import * as THREE from "three";
import { rayToSketch, sketchFrame, toWorld, type SketchFrame } from "./frame";
import { gridPoint, hitTest, snap, snapToGrid, toggleTarget } from "./hit";
import { SketchOverlay } from "./overlay";
import { OffsetTool } from "./offset-tool";
import { SketchMoveTool } from "./move-tool";
import { DrawingTool, type Preview, type ToolName } from "./tools";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import type { OffsetRecord } from "../document/sketch";

/** Pick tolerance in screen pixels (larger on touch screens). */
const PICK_PX = matchMedia("(pointer: coarse)").matches ? 16 : 8;

export interface SketchModeHost {
  /** Stores a solved geometry in the document (one undo step). */
  commit(featureId: string, geometry: SketchGeometry): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Called whenever selection, tool or solve state changes. */
  changed(): void;
  focusDimension(id: string): void;
  unit(): DisplayUnit;
  /** Element the value keypad is placed in (the viewport area). */
  calculatorContainer(): HTMLElement;
  /** Planar offset computed by the geometry kernel. */
  offset(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
  /** An id for a new offset record, unique in the document. */
  offsetId(): string;
}

/** What a value typed in the keypad applies to: an existing dimension, or a new one. */
interface ValueTarget {
  dimensionId?: string;
  spec?: DimensionSpec;
  value: number;
  angle: boolean;
  signed: boolean;
  title: string;
}

export class SketchMode implements PointerHandler {
  readonly frame: SketchFrame;
  readonly featureId: string;
  geometry: SketchGeometry;
  selection = new Set<string>();
  tool: DrawingTool | null = null;
  construction = false;
  lastSolve: SolveResult;
  private overlay: SketchOverlay;
  private hover: string | null = null;
  private preview: Preview | null = null;
  private drag: { point: string; moved: boolean; base: SketchGeometry } | null = null;
  private lastBounds: THREE.Box3 | null = null;
  /** Annotations of the last render (to pick dimension lines). */
  private annotations: Annotation[] = [];
  /** "Cote" tool: the selection shows its measurements, clickable to become dimensions. */
  private dimensionMode = false;
  /** "Décalage" tool, while it is open. */
  private offset: OffsetTool | null = null;
  /** "Déplacer" tool, while it is open. */
  private moveTool: SketchMoveTool | null = null;

  constructor(
    feature: SketchFeature,
    private readonly viewport: Viewport,
    private readonly host: SketchModeHost,
  ) {
    this.featureId = feature.id;
    this.frame = sketchFrame(feature.plane, feature.offset);
    this.geometry = this.withBodies(feature);
    this.lastSolve = solveSketch(this.geometry);
    this.overlay = new SketchOverlay(viewport.scene, this.frame, () => viewport.worldPerPixel());
    this.overlay.onAnnotationPointerDown = (annotation, event) => this.dimensionPointerDown(annotation, event);
    this.overlay.onGlyphClick = (id) => this.toggleSelected(id);
    viewport.enterSketch(this.frame, this);
    this.render();
    // An existing sketch may be larger than the part: show all of it.
    if (feature.points.length || feature.curves.length) this.ensureVisible(true);
  }

  /** The stored geometry plus the corners of the displayed bodies, offered as fixed points to snap on. */
  private withBodies(feature: SketchFeature): SketchGeometry {
    const stored = { points: feature.points, curves: feature.curves, constraints: feature.constraints, ...(feature.offsets ? { offsets: feature.offsets } : {}) };
    return withBodyPoints(stored, this.frame, this.viewport.bodyVertices());
  }

  /**
   * World bounding box of the sketch (points, circles and arcs), with room
   * around it for the dimension lines.
   */
  private bounds(): THREE.Box3 {
    const box = new THREE.Box3().expandByPoint(new THREE.Vector3(...toWorld(this.frame, 0, 0)));
    const add = (x: number, y: number) => box.expandByPoint(new THREE.Vector3(...toWorld(this.frame, x, y)));
    // The body corners offered but unused do not widen the view.
    for (const p of pruneBodyPoints(this.geometry).points) add(p.x, p.y);
    for (const c of this.geometry.curves) {
      if (c.kind === "line") continue;
      const center = c.center === ORIGIN ? { x: 0, y: 0 } : this.geometry.points.find((p) => p.id === c.center);
      if (!center) continue;
      add(center.x - c.radius, center.y - c.radius);
      add(center.x + c.radius, center.y + c.radius);
    }
    return box;
  }

  /**
   * Frames the whole sketch and its dimensions. Automatically (not `force`),
   * only when the sketch has just grown beyond the screen: a view zoomed in on
   * a detail on purpose is left alone.
   */
  ensureVisible(force = false): void {
    const box = this.bounds();
    const grew = !this.lastBounds || !this.lastBounds.containsBox(box);
    this.lastBounds = box;
    if (box.isEmpty()) return;
    if (force || (grew && !this.viewport.boxVisible(box, 0.8))) this.viewport.fitBox(box, 1.35);
  }

  /** Reloads the geometry after an external change (undo/redo, properties panel). */
  sync(feature: SketchFeature): void {
    this.geometry = this.withBodies(feature);
    const known =new Set([ORIGIN, ...this.geometry.points.map((p) => p.id), ...this.geometry.curves.map((c) => c.id)]);
    this.selection = new Set([...this.selection].filter((id) => known.has(id)));
    this.lastSolve = solveSketch(this.geometry);
    this.offset?.sync();
    this.moveTool?.sync();
    this.render();
    this.ensureVisible();
  }

  exit(): void {
    closeCalculator();
    this.offset?.dispose();
    this.moveTool?.dispose();
    this.overlay.dispose();
    this.viewport.exitSketch();
  }

  /** A tool with its own dialog (Décalage, Déplacer) is open: Enter confirms it, Échap cancels it. */
  get panelToolActive(): boolean {
    return this.offset !== null || this.moveTool !== null;
  }

  get toolName(): ToolName | "dimension" | "offset" | "move" {
    if (this.offset) return "offset";
    if (this.moveTool) return "move";
    if (this.dimensionMode) return "dimension";
    return this.tool?.name ?? "select";
  }

  get hint(): string {
    if (this.offset) return "Décalage : cliquez les éléments à décaler, réglez la distance, puis OK (Entrée) — Échap annule";
    if (this.moveTool) return "Déplacer : cliquez les éléments, tirez-les ou saisissez le déplacement, puis OK (Entrée) — Échap annule";
    if (this.dimensionMode) return "Cote : cliquez un élément (ou deux) pour voir la mesure, recliquez pour la poser — cliquez une valeur pour la modifier";
    return this.tool ? this.tool.step : "Sélectionnez des éléments, puis appliquez une contrainte — un trait de cote ou un symbole de contrainte sélectionné se supprime avec Suppr";
  }

  /** Drawing snaps to the grid lines shown (on by default); the choice is remembered. */
  get gridSnap(): boolean {
    try {
      return localStorage.getItem(GRID_SNAP_KEY) !== "0";
    } catch {
      return true;
    }
  }

  toggleGridSnap(): void {
    try {
      localStorage.setItem(GRID_SNAP_KEY, this.gridSnap ? "0" : "1");
    } catch {
      // Private mode: the toggle simply does not persist.
    }
    this.host.changed();
    this.host.notify(this.gridSnap ? "Accrochage à la grille activé." : "Accrochage à la grille désactivé.", "info");
  }

  /** Where a pointer position lands: on an existing point or curve, else on the nearest grid point. */
  private snapAt(p: Vec2) {
    const s = snap(this.geometry, p, this.tolerance());
    return this.gridSnap ? snapToGrid(s, this.viewport.gridStep) : s;
  }

  /** Constraint symbols (H, V, ∥…) are shown on demand; the choice is remembered. */
  get showGlyphs(): boolean {
    try {
      return localStorage.getItem(GLYPHS_KEY) === "1";
    } catch {
      return false;
    }
  }

  toggleGlyphs(): void {
    try {
      localStorage.setItem(GLYPHS_KEY, this.showGlyphs ? "0" : "1");
    } catch {
      // Private mode: the toggle simply does not persist.
    }
    this.render();
    this.host.changed();
  }

  /** Reopens a "Décalage" of the timeline: its source curves selected, its settings restored. */
  editOffset(id: string): void {
    const record = this.geometry.offsets?.find((o) => o.id === id);
    if (!record) return;
    const known = new Set(this.geometry.curves.map((c) => c.id));
    this.selection = new Set(record.source.filter((s) => known.has(s)));
    this.setTool("offset", record);
  }

  /** Selects or deselects one entity or constraint (the symbol of a constraint was clicked). */
  private toggleSelected(id: string): void {
    if (!this.selection.delete(id)) this.selection.add(id);
    closeCalculator();
    this.render();
    this.host.changed();
  }

  setTool(name: ToolName | "dimension" | "offset" | "move", editing?: OffsetRecord): void {
    closeCalculator();
    this.offset?.dispose();
    this.offset = null;
    this.moveTool?.dispose();
    this.moveTool = null;
    this.viewport.renderer.domElement.style.cursor = "";
    this.dimensionMode = name === "dimension";
    if (this.dimensionMode) this.selection.clear();
    if (name === "offset") {
      // Curves already selected are offset right away; anything else is dropped from the selection.
      this.selection = new Set([...this.selection].filter((id) => findCurve(this.geometry, id)));
      this.offset = new OffsetTool(this.offsetHost(), editing ?? null);
      this.offset.start();
    }
    if (name === "move") {
      this.moveTool = new SketchMoveTool(this.moveHost());
      this.moveTool.start();
    }
    this.tool = name === "select" || name === "dimension" || name === "offset" || name === "move" ? null : new DrawingTool(name, this.construction);
    this.preview = null;
    this.render();
    this.host.changed();
  }

  /** Toggles construction for the selected curves, or for the next curves drawn. */
  toggleConstruction(): void {
    const curves = [...this.selection].filter((id) => this.geometry.curves.some((c) => c.id === id));
    if (curves.length) {
      this.apply(toggleConstruction(this.geometry, curves));
      return;
    }
    this.construction = !this.construction;
    if (this.tool) this.tool.construction = this.construction;
    this.host.changed();
  }

  /** Confirms the offset or the move being previewed (Enter). */
  confirmPanelTool(): void {
    void this.offset?.confirm();
    this.moveTool?.confirm();
  }

  private moveHost(): ConstructorParameters<typeof SketchMoveTool>[0] {
    const mode = this;
    return {
      geometry: () => this.geometry,
      get selection() {
        return mode.selection;
      },
      container: () => this.host.calculatorContainer(),
      unit: () => this.host.unit(),
      toSketch: (event) => this.toSketch(event),
      snap: (p, exclude) => {
        const s = this.gridSnap ? snapToGrid(snap(this.geometry, p, this.tolerance(), exclude), this.viewport.gridStep) : snap(this.geometry, p, this.tolerance(), exclude);
        return s.pos;
      },
      tolerance: () => this.tolerance(),
      apply: (geometry, success) => this.apply(geometry, success),
      changed: () => {
        this.preview = this.moveTool?.preview ?? null;
        this.render();
        this.host.changed();
      },
      closed: () => {
        this.moveTool = null;
        this.preview = null;
        this.render();
        this.host.changed();
      },
      notify: (message, kind) => this.host.notify(message, kind),
    };
  }

  private offsetHost(): ConstructorParameters<typeof OffsetTool>[0] {
    const mode = this;
    return {
      geometry: () => this.geometry,
      // The sketch replaces its selection set on undo/redo: always read the current one.
      get selection() {
        return mode.selection;
      },
      container: () => this.host.calculatorContainer(),
      viewport: this.viewport,
      world: ([x, y]) => toWorld(this.frame, x, y),
      direction: ([x, y]) => {
        const { u, v } = this.frame;
        return [u[0] * x + v[0] * y, u[1] * x + v[1] * y, u[2] * x + v[2] * y];
      },
      unit: () => this.host.unit(),
      compute: (paths, distance, join) => this.host.offset(paths, distance, join),
      newOffsetId: () => this.host.offsetId(),
      apply: (geometry, success) => this.apply(geometry, success),
      changed: () => {
        this.preview = this.offset?.preview ?? null;
        this.render();
        this.host.changed();
      },
      closed: (created) => {
        this.viewport.renderer.domElement.style.cursor = "";
        this.offset = null;
        this.preview = null;
        this.selection.clear();
        for (const id of created) this.selection.add(id);
        this.render();
        this.host.changed();
      },
      notify: (message, kind) => this.host.notify(message, kind),
    };
  }

  cancel(): void {
    if (this.offset) {
      this.offset.cancel();
      return;
    }
    if (this.moveTool) {
      this.moveTool.cancel();
      return;
    }
    if (this.tool) {
      this.tool.reset();
      this.preview = null;
    } else this.selection.clear();
    this.render();
    this.host.changed();
  }

  // ---- commit pipeline ------------------------------------------------------

  /** Solves `geometry`; commits it if solvable, otherwise explains and keeps the previous state. */
  apply(geometry: SketchGeometry, success?: string): boolean {
    let result: SolveResult;
    try {
      result = solveSketch(geometry);
    } catch (error) {
      this.host.notify(error instanceof SketchError ? error.message : String(error), "error");
      return false;
    }
    if (result.state === "conflicting") {
      this.host.notify(`Modification refusée : contraintes en conflit (${describeConstraints(geometry, result.conflicting)}).`, "error");
      this.render();
      return false;
    }
    if (result.state === "failed") {
      this.host.notify("Modification refusée : le solveur ne trouve pas de solution.", "error");
      this.render();
      return false;
    }
    this.geometry = result.geometry;
    this.lastSolve = result;
    this.host.commit(this.featureId, pruneBodyPoints(result.geometry));
    this.ensureVisible();
    if (result.state === "redundant") this.host.notify(`Contrainte redondante, déjà impliquée par les autres : ${describeConstraints(geometry, result.redundant)}.`, "info");
    else if (success) this.host.notify(success, "success");
    this.render();
    this.host.changed();
    return true;
  }

  applicableCommands(): string[] {
    const sel = classify(this.geometry, [...this.selection]);
    return COMMANDS.filter((c) => c.applies(sel)).map((c) => c.id);
  }

  runCommand(id: string): string[] {
    const command = COMMANDS.find((c) => c.id === id);
    const sel = classify(this.geometry, [...this.selection]);
    if (!command || !command.applies(sel)) return [];
    let geometry = this.geometry;
    const created: string[] = [];
    try {
      for (const constraint of command.build(sel, geometry)) {
        const added = addConstraint(geometry, constraint as Omit<SketchConstraint, "id">);
        geometry = added.geometry;
        created.push(added.id);
      }
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
      return [];
    }
    if (!this.apply(geometry, `${command.label} ajoutée.`)) return [];
    this.selection.clear();
    this.render();
    this.host.changed();
    return created;
  }

  setDimension(id: string, value: number): boolean {
    return this.apply(setDimensionValue(this.geometry, id, value));
  }

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    closeCalculator();
    const ids = [...this.selection].filter((id) => id !== ORIGIN);
    this.selection.clear();
    this.apply(removeEntities(this.geometry, ids));
  }

  removeConstraint(id: string): void {
    this.apply(removeEntities(this.geometry, [id]));
  }

  // ---- pointer --------------------------------------------------------------

  private toSketch(event: PointerEvent): Vec2 | null {
    const { origin, direction } = this.viewport.rayFromEvent(event);
    return rayToSketch(this.frame, origin, direction);
  }

  private tolerance(): number {
    return PICK_PX * this.viewport.worldPerPixel();
  }

  /** Takes the pointer exclusively only to drag a point; clicks are handled in `up`. */
  down(event: PointerEvent): boolean {
    if (this.tool) return false;
    // "Décalage": the arrow takes the pointer to be dragged; elsewhere clicks pick curves.
    if (this.offset) return this.offset.dragStart(event);
    if (this.moveTool) return this.moveTool.down(event);
    const p = this.toSketch(event);
    if (!p) return false;
    const [hit] = hitTest(this.geometry, p, this.tolerance());
    // A fixed point (projected body geometry) cannot be dragged: the gesture orbits the view instead.
    if (hit?.kind === "point" && hit.id !== ORIGIN && !this.geometry.points.find((q) => q.id === hit.id)?.fixed) {
      this.drag = { point: hit.id, moved: false, base: this.geometry };
      return true;
    }
    return false;
  }

  move(event: PointerEvent): void {
    if (this.offset?.dragMove(event)) return;
    if (this.moveTool?.move(event)) {
      this.render();
      return;
    }
    const p = this.toSketch(event);
    if (!p) return;
    if (this.drag) {
      this.drag.moved = true;
      try {
        const target = this.gridSnap ? gridPoint(p, this.viewport.gridStep) : p;
        const result = solveSketch(this.drag.base, { drag: { point: this.drag.point, x: target[0], y: target[1] }, diagnose: false });
        if (result.state !== "conflicting" && result.state !== "failed") this.geometry = result.geometry;
      } catch {
        // Keep the last valid drag position.
      }
      this.render();
      return;
    }
    if (this.tool) {
      const s = this.snapAt(p);
      this.hover = s.pointId ?? s.curveId ?? null;
      this.preview = this.tool.move(this.geometry, s);
    } else if (this.offset) {
      this.hover = hitTest(this.geometry, p, this.tolerance()).find((h) => findCurve(this.geometry, h.id))?.id ?? null;
      this.viewport.renderer.domElement.style.cursor = this.offset.overArrow(event) ? "grab" : "";
    } else {
      this.hover = hitTest(this.geometry, p, this.tolerance())[0]?.id ?? null;
    }
    this.render();
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (this.offset?.dragEnd()) return true;
    if (this.moveTool?.up()) return true;
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved) {
      // One undo step for the whole drag; the full solve also refreshes diagnostics.
      const dragged = this.geometry;
      this.geometry = drag.base;
      this.apply(dragged);
      return true;
    }
    if (!isClick) return false;
    const p = this.toSketch(event);
    if (!p) return true;
    if (this.tool) {
      try {
        const result = this.tool.click(this.geometry, this.snapAt(p));
        if (result.kind === "commit") {
          if (this.apply(result.geometry) && !result.done) this.preview = null;
        } else this.preview = result.preview;
      } catch (error) {
        this.host.notify(error instanceof Error ? error.message : String(error), "error");
        this.tool.reset();
      }
      this.render();
      this.host.changed();
      return true;
    }
    if (this.offset) {
      // "Décalage": a click on a curve adds (or removes) it, with its chain; elsewhere nothing happens.
      const curve = hitTest(this.geometry, p, this.tolerance()).find((h) => findCurve(this.geometry, h.id));
      if (curve) this.offset.toggle(curve.id);
      return true;
    }
    if (this.moveTool) {
      this.moveTool.click(p);
      return true;
    }
    // Clicking again near a selected element deselects it, even if a close neighbour
    // (e.g. a parallel line 2 mm away) is nearer to the pointer.
    const hits = hitTest(this.geometry, p, this.tolerance());
    const hit = toggleTarget(hits, this.selection);
    // A click on the lines of a placed dimension selects the dimension (Suppr deletes it).
    const dimension = this.pickDimension(p);
    if (dimension && (!hit || dimension.distance < hit.distance)) {
      if (this.selection.has(dimension.id)) this.selection.delete(dimension.id);
      else this.selection.add(dimension.id);
      closeCalculator();
      this.render();
      this.host.changed();
      return true;
    }
    if (this.dimensionMode && hit && this.selection.has(hit.id)) {
      // "Cote" tool: the second click on a measured element places the dimension.
      this.placeMeasurement();
      return true;
    }
    if (!hit) this.selection.clear();
    else if (this.selection.has(hit.id)) this.selection.delete(hit.id);
    else {
      // The dimension tool measures one or two elements: a third click starts a new measurement.
      if (this.dimensionMode && this.selection.size >= 2) this.selection.clear();
      this.selection.add(hit.id);
    }
    // Clicking geometry only selects it; values are changed by clicking their dimension.
    closeCalculator();
    this.render();
    this.host.changed();
    return true;
  }

  // ---- values (keypad) ------------------------------------------------------

  /** Placed dimension whose drawn lines are under the pointer, if any. */
  private pickDimension(p: Vec2): { id: string; distance: number } | null {
    const px = this.viewport.worldPerPixel();
    let best: { id: string; distance: number } | null = null;
    for (const a of this.annotations) {
      if (!a.dimensionId) continue;
      const distance = dimensionLineDistance(a, p, px);
      if (distance <= this.tolerance() && (!best || distance < best.distance)) best = { id: a.dimensionId, distance };
    }
    return best;
  }

  /**
   * Turns the measurement of the selection into a dimension that stays on
   * screen. Its value is changed by clicking it (keypad), not here.
   */
  private placeMeasurement(): void {
    const spec = selectionSpec(this.geometry, [...this.selection]);
    if (!spec) return;
    if (matchingDimension(this.geometry, spec)) {
      this.host.notify("Cette cote est déjà posée : cliquez sa valeur pour la modifier.", "info");
      this.selection.clear();
      this.render();
      this.host.changed();
      return;
    }
    const value = Number(measure(this.geometry, { ...spec, id: "", value: 0 } as DimensionConstraint).toFixed(6));
    const added = addConstraint(this.geometry, { ...spec, value } as unknown as Omit<SketchConstraint, "id">);
    // A dimension the sketch already determines would over-constrain it: place it as a
    // reference dimension instead (shown between parentheses, never imposed).
    let overConstrained = false;
    try {
      const check = solveSketch(added.geometry);
      overConstrained = check.state !== "ok";
    } catch {
      overConstrained = true;
    }
    if (overConstrained) {
      const reference = addConstraint(this.geometry, { ...spec, value, driving: false } as unknown as Omit<SketchConstraint, "id">);
      if (this.apply(reference.geometry)) {
        this.host.notify("Cette valeur est déjà imposée par l'esquisse : cote de référence ajoutée (entre parenthèses).", "info");
      }
      this.selection.clear();
      this.render();
      this.host.changed();
      return;
    }
    if (!this.apply(added.geometry)) return;
    this.selection.clear();
    this.render();
    this.host.changed();
  }

  private editValue(target: ValueTarget, anchor: { x: number; y: number }): void {
    openCalculator({
      container: this.host.calculatorContainer(),
      anchor,
      value: target.value,
      unit: target.angle ? "deg" : this.host.unit(),
      title: target.title,
      locked: true,
      allowNegative: target.signed,
      onSubmit: (value, locked) => this.applyValue(target, value, locked),
    });
  }

  /**
   * Applies a typed value. Locked: the value becomes (or updates) a driving
   * dimension. Unlocked: the shape is resized once and the dimension dropped.
   */
  private applyValue(target: ValueTarget, value: number, locked: boolean): boolean {
    let geometry: SketchGeometry;
    let id: string;
    if (target.dimensionId) {
      geometry = setDimensionValue(this.geometry, target.dimensionId, value);
      id = target.dimensionId;
    } else if (target.spec) {
      const added = addConstraint(this.geometry, { ...target.spec, value } as unknown as Omit<SketchConstraint, "id">);
      geometry = added.geometry;
      id = added.id;
    } else return false;
    if (!locked) {
      try {
        const solved = solveSketch(geometry);
        if (solved.state === "conflicting" || solved.state === "failed") return false;
        geometry = removeEntities(solved.geometry, [id]);
      } catch {
        return false;
      }
    }
    const ok = this.apply(geometry);
    if (ok && this.dimensionMode && target.spec) {
      this.selection.clear();
      this.render();
    }
    return ok;
  }

  render(): void {
    const flagged = new Set([...this.lastSolve.conflicting, ...this.lastSolve.redundant]);
    const unit = this.host.unit();
    // Measurements of the selection only with the "Cote" tool; placed dimensions are always shown.
    const selected = [...this.selection];
    const measures = !this.dimensionMode
      ? []
      : selected.length === 1
        ? measureAnnotations(this.geometry, selected.filter((id) => findCurve(this.geometry, id)), unit)
        : [pairAnnotation(this.geometry, selected, unit)].filter((a): a is NonNullable<typeof a> => a !== null);
    let regions: Region[] = [];
    try {
      regions = regionsOf(extractLoops(this.geometry));
    } catch {
      // Open or branched profile: nothing to tint.
    }
    this.annotations = [...dimensionAnnotations(this.geometry, unit), ...measures];
    this.overlay.render({
      geometry: this.geometry,
      selection: this.selection,
      hover: this.hover,
      preview: this.preview,
      unit,
      flagged,
      annotations: [
        ...dimensionAnnotations(this.geometry, unit),
        ...measures,
        ...(this.offset || this.moveTool ? [] : previewAnnotations(this.preview, unit)),
      ],
      showGlyphs: this.showGlyphs,
      regions,
    });
  }

  // ---- dimension text: click = keypad, drag = move the dimension -----------------

  private dimensionPointerDown(annotation: Annotation, down: PointerEvent): void {
    const start = { x: down.clientX, y: down.clientY };
    const id = annotation.role === "driving" ? annotation.dimensionId : undefined;
    const base = this.geometry;
    let moved = false;
    const onMove = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
      moved = true;
      if (!id) return;
      const p = this.toSketch(event);
      const offset = p ? placementOffset(annotation, p) : null;
      if (offset === null) return;
      this.geometry = {
        ...base,
        constraints: base.constraints.map((c) => (c.id === id && "value" in c ? { ...c, offset } : c)),
      };
      this.render();
    };
    const onUp = (event: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) {
        // Presentation only: stored in the document without solving again.
        if (id && this.geometry !== base) this.host.commit(this.featureId, pruneBodyPoints(this.geometry));
        return;
      }
      const anchor = { x: event.clientX, y: event.clientY };
      const common = { value: annotation.value, angle: annotation.angle, signed: annotation.angle };
      if (id) this.editValue({ ...common, dimensionId: id, title: "Cote" }, anchor);
      else if (annotation.spec) this.editValue({ ...common, spec: annotation.spec, title: "Nouvelle cote" }, anchor);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}
