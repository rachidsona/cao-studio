/**
 * Pointer on the sketch plane: drawing tools (snapped to points, curves and the grid), point dragging (solved
 * as it moves), the curve tools Prolonger / Ajuster / Couper with their preview, and the click that selects
 * (lines on top of each other cycle; inside a closed shape, its sides) or feeds a waiting constraint.
 */
import { classify, COMMANDS } from "../constraints/catalog";
import { solveSketch } from "../constraints/solver";
import { ORIGIN, type SketchGeometry } from "../document/sketch";
import { closeCalculator } from "../ui/calculator";
import { applyBreak, findBreak } from "./break";
import { findCurve, type Vec2 } from "./edit";
import { applyExtension, findExtension } from "./extend";
import { gridPoint, hitTest, snap, snapToGrid, toggleTarget } from "./hit";
import type { SketchMode } from "./mode";
import type { SnapMark } from "./overlay";
import { boundaryCurves, regionAt } from "./region-pick";
import type { Region } from "./loops";
import type { Preview } from "./tools";
import { applyTrim, findTrim } from "./trim";

/** Hover preview and click result of Prolonger, Ajuster and Couper on the curve under the pointer. */
function curveEdit(mode: SketchMode, kind: "extend" | "trim" | "break", p: Vec2) {
  const g = mode.geometry;
  if (kind === "extend") {
    const curve = hitTest(g, p, mode.tolerance()).find((h) => h.kind === "line" || h.kind === "arc");
    const ext = curve ? findExtension(g, curve.id, p) : null;
    return { curve: curve?.id ?? null, found: ext, marks: [], apply: () => (ext && typeof ext === "object" ? mode.apply(applyExtension(g, ext), "Prolongée jusqu'à la courbe suivante.") : false) };
  }
  // A line, arc or circle of the sketch (not an axis, not construction).
  const curve = hitTest(g, p, mode.tolerance()).find((h) => findCurve(g, h.id) && !findCurve(g, h.id)?.construction)?.id ?? null;
  if (kind === "trim") {
    const trim = curve ? findTrim(g, curve, p) : null;
    return { curve, found: trim, marks: [], apply: () => (trim && typeof trim === "object" ? mode.apply(applyTrim(g, trim), trim.whole ? "Courbe supprimée." : "Partie coupée.") : false) };
  }
  const cut = curve ? findBreak(g, curve, p) : null;
  const pieces = cut && typeof cut === "object" ? cut.marks.length + (findCurve(g, cut.curveId)?.kind === "circle" ? 0 : 1) : 0;
  return { curve, found: cut, marks: cut && typeof cut === "object" ? cut.marks : [], apply: () => (cut && typeof cut === "object" ? mode.apply(applyBreak(g, cut), `Courbe coupée en ${pieces} morceaux.`) : false) };
}

export class SketchPointer {
  hover: string | null = null;
  /** The area under the pointer when no line is: drawn stronger. */
  hoverRegion: Region | null = null;
  /** Where the drawing tool's pointer snaps (the cursor becomes a square there), or null. */
  snapMark: SnapMark | null = null;
  /** Where "Couper" would cut the curve under the pointer (red crosses). */
  cutMarks: Vec2[] = [];
  /** The last click that chose a line, to pick the next one when the same spot is clicked again (lines on top of each other). */
  private lastPick: { x: number; y: number; index: number } | null = null;
  private drag: { point: string; moved: boolean; base: SketchGeometry } | null = null;

  constructor(private readonly mode: SketchMode) {}

  /** A tool was chosen: the marks of the previous one go. */
  reset(): void {
    this.snapMark = null;
    this.cutMarks = [];
  }

  private get canvas(): HTMLCanvasElement {
    return this.mode.viewport.renderer.domElement;
  }

  /** Where a pointer position lands: on an existing point or curve, else on the nearest grid point. */
  private snapAt(p: Vec2) {
    const s = snap(this.mode.geometry, p, this.mode.tolerance());
    return this.mode.gridSnap ? snapToGrid(s, this.mode.viewport.gridStep) : s;
  }

  /** Takes the pointer exclusively only to drag a point; clicks are handled in `up`. */
  down(event: PointerEvent): boolean {
    const { mode } = this;
    if (mode.tool || mode.kind === "extend" || mode.kind === "trim" || mode.kind === "break") return false;
    // "Décalage": the arrow takes the pointer to be dragged; elsewhere clicks pick curves.
    if (mode.offset) return mode.offset.dragStart(event);
    if (mode.moveTool) return mode.moveTool.down(event);
    if (mode.arrayTool) return false;
    const p = mode.toSketch(event);
    if (!p) return false;
    const [hit] = hitTest(mode.geometry, p, mode.tolerance());
    // A fixed point (projected body geometry) cannot be dragged: the gesture orbits the view instead.
    if (hit?.kind === "point" && hit.id !== ORIGIN && !mode.geometry.points.find((q) => q.id === hit.id)?.fixed) {
      this.drag = { point: hit.id, moved: false, base: mode.geometry };
      return true;
    }
    return false;
  }

  move(event: PointerEvent): void {
    const { mode } = this;
    if (mode.offset?.dragMove(event)) return;
    if (mode.moveTool?.move(event)) return mode.render();
    const p = mode.toSketch(event);
    if (!p) return;
    if (this.drag) {
      this.drag.moved = true;
      try {
        const target = mode.gridSnap ? gridPoint(p, mode.viewport.gridStep) : p;
        const result = solveSketch(this.drag.base, { drag: { point: this.drag.point, x: target[0], y: target[1] }, diagnose: false });
        if (result.state !== "conflicting" && result.state !== "failed") mode.geometry = result.geometry;
      } catch {
        // Keep the last valid drag position.
      }
      return mode.render();
    }
    if (mode.tool) {
      const s = this.snapAt(p);
      this.hover = s.pointId ?? s.curveId ?? null;
      mode.preview = mode.tool.move(mode.geometry, s);
      // Snapped to the grid, a point or a curve: the cross becomes a square on the snap point (the pointer is hidden).
      this.snapMark = s.pointId ? { pos: s.pos, kind: "point" } : s.curveId ? { pos: s.pos, kind: "curve" } : mode.gridSnap ? { pos: s.pos, kind: "grid" } : null;
      this.canvas.style.cursor = this.snapMark ? "none" : "crosshair";
    } else if (mode.offset) {
      this.hover = hitTest(mode.geometry, p, mode.tolerance()).find((h) => findCurve(mode.geometry, h.id))?.id ?? null;
      this.canvas.style.cursor = mode.offset.overArrow(event) ? "grab" : "";
    } else {
      this.hover = hitTest(mode.geometry, p, mode.tolerance())[0]?.id ?? null;
      this.hoverRegion = this.hover || mode.pendingCommand || mode.kind === "dimension" ? null : regionAt(mode.faces, p);
      if (mode.kind === "extend" || mode.kind === "trim" || mode.kind === "break") {
        // What the click would do (extension, part removed, pieces and cut points) is shown before it.
        const edit = curveEdit(mode, mode.kind, p);
        this.hover = edit.curve;
        mode.preview = edit.found && typeof edit.found === "object" ? (edit.found as { preview: Preview }).preview : null;
        this.cutMarks = edit.marks;
      }
    }
    mode.render();
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    const { mode } = this;
    if (mode.offset?.dragEnd()) return true;
    if (mode.moveTool?.up()) return true;
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved) {
      // One undo step for the whole drag; the full solve also refreshes diagnostics.
      const dragged = mode.geometry;
      mode.geometry = drag.base;
      mode.apply(dragged);
      return true;
    }
    if (!isClick) return false;
    const p = mode.toSketch(event);
    if (!p) return true;
    if (mode.tool) {
      try {
        const result = mode.tool.click(mode.geometry, this.snapAt(p));
        if (result.kind === "commit") {
          // A finished shape (rectangle, circle, arc, closed polyline) hands back to the selection tool.
          if (mode.apply(result.geometry)) {
            if (result.done) mode.setTool("select");
            else mode.preview = null;
          }
        } else mode.preview = result.preview;
      } catch (error) {
        mode.host.notify(error instanceof Error ? error.message : String(error), "error");
        mode.tool.reset();
      }
      mode.render();
      mode.host.changed();
      return true;
    }
    if (mode.offset) {
      // "Décalage": a click on a curve adds (or removes) it, with its chain; elsewhere nothing happens.
      const curve = hitTest(mode.geometry, p, mode.tolerance()).find((h) => findCurve(mode.geometry, h.id));
      if (curve) mode.offset.toggle(curve.id);
      return true;
    }
    if (mode.moveTool) {
      mode.moveTool.click(p);
      return true;
    }
    if (mode.arrayTool) {
      mode.arrayTool.click(p);
      return true;
    }
    if (mode.kind === "extend" || mode.kind === "trim" || mode.kind === "break") {
      const edit = curveEdit(mode, mode.kind, p);
      mode.preview = null;
      this.cutMarks = [];
      if (typeof edit.found === "string") mode.host.notify(edit.found, "info");
      else edit.apply();
      mode.render();
      return true;
    }
    this.select(event, p);
    return true;
  }

  /** A click with the selection tool, the "Cote" tool, or a constraint waiting for its elements. */
  private select(event: PointerEvent, p: Vec2): void {
    const { mode } = this;
    const dimensionTool = mode.kind === "dimension";
    // Clicking again near a selected element deselects it, even if a close neighbour
    // (e.g. a parallel line 2 mm away) is nearer to the pointer.
    const waiting = mode.pendingCommand ? COMMANDS.find((c) => c.id === mode.pendingCommand) : undefined;
    // A waiting constraint only picks the kinds of elements it takes (a line for "Horizontale"…).
    const hits = hitTest(mode.geometry, p, mode.tolerance()).filter((h) => !waiting || waiting.accepts.includes(h.kind));
    let hit = toggleTarget(hits, mode.selection);
    // Lines on top of each other (a shared side): clicking the same spot again picks the next one.
    const last = this.lastPick;
    if (!waiting && !dimensionTool && last && hits.length > 1 && Math.hypot(event.clientX - last.x, event.clientY - last.y) <= 4) {
      const previous = hits[last.index];
      const next = hits[(last.index + 1) % hits.length];
      if (previous && next && previous.id !== next.id) {
        mode.selection.delete(previous.id);
        hit = next;
      }
    }
    this.lastPick = hit && hits.length > 1 ? { x: event.clientX, y: event.clientY, index: hits.findIndex((h) => h.id === hit?.id) } : null;
    // A click on the lines of a placed dimension selects the dimension (Suppr deletes it).
    const dimension = mode.values.pickDimension(p);
    if (dimension && (!hit || dimension.distance < hit.distance)) {
      if (mode.selection.has(dimension.id)) mode.selection.delete(dimension.id);
      else mode.selection.add(dimension.id);
      closeCalculator();
      mode.render();
      mode.host.changed();
      return;
    }
    // "Cote" tool: the second click on a measured element places the dimension.
    if (dimensionTool && hit && mode.selection.has(hit.id)) return mode.values.placeMeasurement();
    if (!hit) {
      if (!waiting) {
        // Inside a closed shape: its sides are chosen (the smallest area under the pointer); clicked again, they are released.
        const face = dimensionTool ? null : regionAt(mode.faces, p);
        const sides = face ? boundaryCurves(mode.geometry, face) : [];
        const chosen = sides.length > 0 && sides.every((id) => mode.selection.has(id));
        mode.selection.clear();
        if (!chosen) for (const id of sides) mode.selection.add(id);
      }
    } else if (mode.selection.has(hit.id)) mode.selection.delete(hit.id);
    else {
      // The dimension tool measures one or two elements: a third click starts a new measurement.
      if (dimensionTool && mode.selection.size >= 2) mode.selection.clear();
      mode.selection.add(hit.id);
    }
    if (waiting && waiting.applies(classify(mode.geometry, [...mode.selection]))) {
      // Everything it needs is picked: applied at once; the command keeps waiting for the next ones.
      mode.runCommand(waiting.id);
      mode.pendingCommand = waiting.id;
      mode.host.changed();
      return;
    }
    // Clicking geometry only selects it; values are changed by clicking their dimension.
    closeCalculator();
    mode.render();
    mode.host.changed();
  }
}
