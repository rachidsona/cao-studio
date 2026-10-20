/**
 * Sketch mode controller: pointer interaction on the sketch plane (drawing
 * tools, selection, point dragging), constraint commands, and the commit
 * rule: every change is solved first and rejected if it over-constrains the
 * sketch, so the document only ever holds solvable sketches.
 */
import { classify, COMMANDS } from "../constraints/catalog";
import { solveSketch, SketchError, type SolveResult } from "../constraints/solver";
import { ORIGIN, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit, SketchFeature } from "../document/types";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { closeCalculator, openCalculator } from "../ui/calculator";
import {
  dimensionAnnotations,
  existingDimension,
  measureAnnotations,
  pairAnnotation,
  placementOffset,
  previewAnnotations,
  type Annotation,
  type DimensionSpec,
} from "./annotations";
import { extractLoops, regions as regionsOf, type Region } from "./loops";

const GLYPHS_KEY = "cao-studio:sketch-glyphs";
import { addConstraint, findCurve, removeEntities, setDimensionValue, toggleConstruction, type Vec2 } from "./edit";
import * as THREE from "three";
import { rayToSketch, sketchFrame, toWorld, type SketchFrame } from "./frame";
import { hitTest, snap } from "./hit";
import { SketchOverlay } from "./overlay";
import { DrawingTool, type Preview, type ToolName } from "./tools";

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
  /** "Cote" tool: the selection shows its measurements, clickable to become dimensions. */
  private dimensionMode = false;

  constructor(
    feature: SketchFeature,
    private readonly viewport: Viewport,
    private readonly host: SketchModeHost,
  ) {
    this.featureId = feature.id;
    this.frame = sketchFrame(feature.plane, feature.offset);
    this.geometry = { points: feature.points, curves: feature.curves, constraints: feature.constraints };
    this.lastSolve = solveSketch(this.geometry);
    this.overlay = new SketchOverlay(viewport.scene, this.frame, () => viewport.worldPerPixel());
    this.overlay.onAnnotationPointerDown = (annotation, event) => this.dimensionPointerDown(annotation, event);
    viewport.enterSketch(this.frame, this);
    this.render();
    // An existing sketch may be larger than the part: show all of it.
    if (this.geometry.points.length || this.geometry.curves.length) this.ensureVisible(true);
  }

  /**
   * World bounding box of the sketch (points, circles and arcs), with room
   * around it for the dimension lines.
   */
  private bounds(): THREE.Box3 {
    const box = new THREE.Box3().expandByPoint(new THREE.Vector3(...toWorld(this.frame, 0, 0)));
    const add = (x: number, y: number) => box.expandByPoint(new THREE.Vector3(...toWorld(this.frame, x, y)));
    for (const p of this.geometry.points) add(p.x, p.y);
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
    this.geometry = { points: feature.points, curves: feature.curves, constraints: feature.constraints };
    const known = new Set([ORIGIN, ...this.geometry.points.map((p) => p.id), ...this.geometry.curves.map((c) => c.id)]);
    this.selection = new Set([...this.selection].filter((id) => known.has(id)));
    this.lastSolve = solveSketch(this.geometry);
    this.render();
    this.ensureVisible();
  }

  exit(): void {
    closeCalculator();
    this.overlay.dispose();
    this.viewport.exitSketch();
  }

  get toolName(): ToolName | "dimension" {
    if (this.dimensionMode) return "dimension";
    return this.tool?.name ?? "select";
  }

  get hint(): string {
    if (this.dimensionMode) return "Cote : cliquez une ligne, un cercle ou deux éléments, puis cliquez la valeur affichée";
    return this.tool ? this.tool.step : "Sélectionnez des éléments, puis appliquez une contrainte";
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

  setTool(name: ToolName | "dimension"): void {
    closeCalculator();
    this.dimensionMode = name === "dimension";
    if (this.dimensionMode) this.selection.clear();
    this.tool = name === "select" || name === "dimension" ? null : new DrawingTool(name, this.construction);
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

  cancel(): void {
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
      this.host.notify(`Modification refusée : contraintes en conflit (${result.conflicting.join(", ")}).`, "error");
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
    this.host.commit(this.featureId, result.geometry);
    this.ensureVisible();
    if (result.state === "redundant") this.host.notify(`Contraintes redondantes : ${result.redundant.join(", ")}.`, "info");
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
    const p = this.toSketch(event);
    if (!p) return false;
    const [hit] = hitTest(this.geometry, p, this.tolerance());
    if (hit?.kind === "point" && hit.id !== ORIGIN) {
      this.drag = { point: hit.id, moved: false, base: this.geometry };
      return true;
    }
    return false;
  }

  move(event: PointerEvent): void {
    const p = this.toSketch(event);
    if (!p) return;
    if (this.drag) {
      this.drag.moved = true;
      try {
        const result = solveSketch(this.drag.base, { drag: { point: this.drag.point, x: p[0], y: p[1] }, diagnose: false });
        if (result.state !== "conflicting" && result.state !== "failed") this.geometry = result.geometry;
      } catch {
        // Keep the last valid drag position.
      }
      this.render();
      return;
    }
    if (this.tool) {
      const s = snap(this.geometry, p, this.tolerance());
      this.hover = s.pointId ?? s.curveId ?? null;
      this.preview = this.tool.move(this.geometry, s);
    } else {
      this.hover = hitTest(this.geometry, p, this.tolerance())[0]?.id ?? null;
    }
    this.render();
  }

  up(event: PointerEvent, isClick: boolean): boolean {
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
        const result = this.tool.click(this.geometry, snap(this.geometry, p, this.tolerance()));
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
    const [hit] = hitTest(this.geometry, p, this.tolerance());
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
        ...previewAnnotations(this.preview, unit),
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
        if (id && this.geometry !== base) this.host.commit(this.featureId, this.geometry);
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
