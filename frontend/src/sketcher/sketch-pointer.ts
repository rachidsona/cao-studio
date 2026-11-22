/**
 * Pointer on the sketch plane: drawing tools (snapped to points, curves and the grid), point dragging (solved
 * as it moves), the curve tools Prolonger / Ajuster / Couper with their preview, and the click that selects
 * (lines on top of each other cycle; inside a closed shape, its sides) or feeds a waiting constraint.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import { classify, COMMANDS } from "../constraints/catalog";
import { solveSketch } from "../constraints/solver";
import { ORIGIN, type SketchGeometry, type SketchText } from "../document/sketch";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { chamferCorner, cornerAt, filletCorner, suggestedCornerValue } from "./corner";
import { applyBreak, findBreak } from "./break";
import { findCurve, type Vec2 } from "./edit";
import { applyExtension, findExtension } from "./extend";
import { gridPoint, hitTest, toggleTarget } from "./hit";
import { pointerSnap, type PointerSnap } from "./smart-snap";
import type { SketchMode } from "./mode";
import type { SnapMark } from "./overlay";
import { boundaryCurves, regionAt } from "./region-pick";
import type { Region } from "./loops";
import type { Preview } from "./tools";
import { applyTrim, findTrim } from "./trim";
import { projectEdge } from "./projection";
import type { EdgeOutline } from "../geometry/protocol";
import { projectEdgeOnce, projectFace } from "./offset-edge";
import { openTextDialog } from "./text-dialog";
import { textBox } from "./text-outline";
import { ShapeEntry } from "./shape-entry";

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
  /** Dashed guides of the smart snapping, and the points the tool has just clicked (aligned with too). */
  guides: [Vec2, Vec2][] = [];
  private anchors: Vec2[] = [];
  /** Where "Couper" would cut the curve under the pointer (red crosses). */
  cutMarks: Vec2[] = [];
  /** The last click that chose a line, to pick the next one when the same spot is clicked again (lines on top of each other). */
  private lastPick: { x: number; y: number; index: number } | null = null;
  private drag: { point: string; moved: boolean; base: SketchGeometry } | null = null;
  /** The shape being drawn, its points laid and its dimensions typed (as Fusion's). */
  readonly entry: ShapeEntry;

  constructor(private readonly mode: SketchMode) {
    // A point clicked but not drawn yet (the start of a line…) is aligned with too, until the shape is drawn.
    this.entry = new ShapeEntry(mode, (p) => this.snapAt(p), (at) => (this.anchors = at ? [...this.anchors, at] : []));
  }

  /** A tool was chosen: the marks of the previous one go. */
  reset(): void {
    this.snapMark = null;
    this.guides = [];
    this.anchors = [];
    this.cutMarks = [];
    this.entry.typed.reset();
  }

  private get canvas(): HTMLCanvasElement {
    return this.mode.viewport.renderer.domElement;
  }

  /** Where a pointer position lands: on a point or a curve, in line with a point, or on the grid (each one if on). */
  private snapAt(p: Vec2): PointerSnap {
    const { mode } = this;
    return pointerSnap(mode.geometry, p, { tolerance: mode.tolerance(), geometry: mode.geometrySnap, smart: mode.smartSnap, grid: mode.gridSnap ? mode.viewport.gridStep : null, anchors: this.anchors });
  }

  /** Takes the pointer exclusively only to drag a point; clicks are handled in `up`. */
  down(event: PointerEvent): boolean {
    const { mode } = this;
    if (mode.tool || (mode.kind !== "select" && mode.kind !== "dimension")) return false;
    // "Décalage": the arrow takes the pointer to be dragged; elsewhere clicks pick curves.
    if (mode.offset) return mode.offset.dragStart(event);
    if (mode.edgeOffset) return mode.edgeOffset.dragStart(event);
    if (mode.moveTool) return mode.moveTool.down(event);
    if (mode.arrayTool || mode.shelves || mode.partition) return false;
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
    if (mode.edgeOffset?.dragMove(event)) return;
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
      const s = this.entry.landing(p);
      this.hover = s.pointId ?? s.curveId ?? null;
      mode.preview = mode.tool.move(mode.geometry, s);
      // Snapped to the grid, a point or a curve: the cross becomes a square on the snap point (the pointer is hidden).
      this.guides = s.guides;
      this.snapMark = s.pointId ? { pos: s.pos, kind: "point" } : s.middle ? { pos: s.pos, kind: "middle" } : s.curveId ? { pos: s.pos, kind: "curve" } : s.guides.length ? { pos: s.pos, kind: "smart" } : mode.gridSnap ? { pos: s.pos, kind: "grid" } : null;
      this.canvas.style.cursor = this.snapMark ? "none" : THIN_CROSSHAIR;
    } else if (mode.offset || mode.edgeOffset) {
      this.hover = hitTest(mode.geometry, p, mode.tolerance()).find((h) => findCurve(mode.geometry, h.id))?.id ?? null;
      this.canvas.style.cursor = (mode.offset ?? mode.edgeOffset)!.overArrow(event) ? "grab" : "";
    } else {
      this.hover = hitTest(mode.geometry, p, mode.tolerance())[0]?.id ?? null;
      this.hoverRegion = this.hover || mode.pendingCommand || mode.kind === "dimension" ? null : regionAt(mode.faces, p);
      if (mode.kind === "text") {
        const text = this.textUnder(p);
        this.hover = text ? `text:${text.id}` : null;
        this.hoverRegion = null;
      }
      if (mode.kind === "fillet" || mode.kind === "chamfer") {
        // Only a corner (two lines meeting) can be rounded or cut.
        this.hover = this.cornerUnder(p);
        this.hoverRegion = null;
      }
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
    if (mode.edgeOffset?.dragEnd()) return true;
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
      // Maj + clic: the line goes on from there (a polyline).
      this.entry.lay(this.entry.landing(p), event.shiftKey);
      return true;
    }
    if (mode.offset) {
      // "Décalage": a click on a curve adds (or removes) it, with its chain; elsewhere nothing happens.
      const curve = hitTest(mode.geometry, p, mode.tolerance()).find((h) => findCurve(mode.geometry, h.id));
      if (curve) mode.offset.toggle(curve.id);
      return true;
    }
    if (mode.edgeOffset) {
      // « Décaler l'arête »: a sketch curve is copied at once, else the body edge or face clicked.
      const curve = hitTest(mode.geometry, p, mode.tolerance()).find((h) => findCurve(mode.geometry, h.id));
      if (curve) mode.edgeOffset.pickCurve(curve.id);
      else void this.offsetBodyClick(event);
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
    if (mode.shelves) {
      mode.shelves.click(p);
      return true;
    }
    if (mode.partition) {
      mode.partition.click(p);
      return true;
    }
    if (mode.kind === "fillet" || mode.kind === "chamfer") {
      this.cornerClick(mode.kind, p, { x: event.clientX, y: event.clientY });
      return true;
    }
    if (mode.kind === "project") {
      void this.projectClick(event);
      return true;
    }
    if (mode.kind === "intersect") {
      void this.intersectClick(event);
      return true;
    }
    if (mode.kind === "text") {
      this.textClick(p, { x: event.clientX, y: event.clientY });
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

  /** The corner point under the pointer (two lines meeting there), or null. */
  private cornerUnder(p: Vec2): string | null {
    const hit = hitTest(this.mode.geometry, p, this.mode.tolerance()).find((h) => h.kind === "point" && cornerAt(this.mode.geometry, h.id));
    return hit?.id ?? null;
  }

  /** Congé or chanfrein on the corner clicked: the keypad asks for the radius or the distance. */
  private cornerClick(kind: "fillet" | "chamfer", p: Vec2, anchor: { x: number; y: number }): void {
    const { mode } = this;
    const corner = this.cornerUnder(p);
    if (!corner) return mode.host.notify("Cliquez un coin où deux lignes se rejoignent.", "info");
    openCalculator({
      container: mode.host.calculatorContainer(),
      anchor,
      value: suggestedCornerValue(mode.geometry, corner),
      unit: mode.host.unit(),
      title: kind === "fillet" ? "Rayon du congé" : "Distance du chanfrein",
      locked: true,
      allowNegative: false,
      onSubmit: (value) => {
        const result = kind === "fillet" ? filletCorner(mode.geometry, corner, value) : chamferCorner(mode.geometry, corner, value);
        if (typeof result === "string") {
          mode.host.notify(result, "error");
          return false;
        }
        return mode.apply(result, kind === "fillet" ? "Congé ajouté." : "Chanfrein ajouté.");
      },
    });
  }

  /** The text whose letters' box holds the point, if any. */
  private textUnder(p: Vec2): SketchText | undefined {
    const margin = this.mode.tolerance();
    return (this.mode.geometry.texts ?? []).find((t) => {
      const [lo, hi] = textBox(t);
      return p[0] >= lo[0] - margin && p[0] <= hi[0] + margin && p[1] >= lo[1] - margin && p[1] <= hi[1] + margin;
    });
  }

  /** Text tool: a click on a text edits it, elsewhere a new text starts there. */
  private textClick(p: Vec2, anchor: { x: number; y: number }): void {
    const { mode } = this;
    const found = this.textUnder(p);
    const texts = mode.geometry.texts ?? [];
    let n = 1;
    while (texts.some((t) => t.id === `t${n}`)) n++;
    const text: SketchText = found ?? { id: `t${n}`, text: "Texte", x: Number(p[0].toFixed(6)), y: Number(p[1].toFixed(6)), height: 10 };
    const save = (next: SketchText[], message: string) => mode.apply({ ...mode.geometry, texts: next }, message);
    openTextDialog({
      container: mode.host.calculatorContainer(),
      anchor,
      unit: mode.host.unit(),
      text,
      existing: !!found,
      onSubmit: (t) => save(found ? texts.map((x) => (x.id === t.id ? t : x)) : [...texts, t], found ? "Texte modifié." : "Texte ajouté."),
      onDelete: () => save(texts.filter((x) => x.id !== text.id), "Texte supprimé."),
    });
  }

  /**
   * "Projeter" (as Fusion's Project): the body edge clicked, else the whole outline of the face clicked, else (Maj)
   * every edge of the body, is added to the sketch as fixed reference geometry.
   */
  private async projectClick(event: PointerEvent): Promise<void> {
    const { mode } = this;
    const edge = event.shiftKey ? null : mode.viewport.pickEdge(event);
    const face = edge ? null : mode.viewport.pickFace(event);
    if (!edge && !face) return mode.host.notify("Cliquez une arête, une face, ou Maj + clic sur un corps.", "info");
    try {
      if (edge) {
        const projected = projectEdge(mode.geometry, await mode.host.edgeOutline(edge.bodyId, edge.edgeIndex), mode.frame);
        if (typeof projected === "string") mode.host.notify(projected, "info");
        else mode.apply(projected, "Arête projetée.");
        return;
      }
      if (event.shiftKey) return this.projectAll(await mode.host.bodyOutline(face!.bodyId), "Corps projeté", "Ce corps ne se projette pas sur le plan de l'esquisse.");
      const picked = projectFace(mode.geometry, await mode.host.faceOutline(face!.bodyId, face!.faceIndex), mode.frame);
      if (typeof picked === "string") mode.host.notify(picked, "info");
      else mode.apply(picked.geometry, "Face projetée : tout son contour.");
    } catch (error) {
      mode.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  /** "Intersection" (as Fusion's Intersect): where the sketch plane cuts the body clicked, as fixed reference geometry. */
  private async intersectClick(event: PointerEvent): Promise<void> {
    const { mode } = this;
    const face = mode.viewport.pickFace(event);
    if (!face) return mode.host.notify("Cliquez un corps que le plan de l'esquisse traverse.", "info");
    try {
      const { origin, u, v } = mode.frame;
      await this.projectAll(await mode.host.sectionOutline(face.bodyId, origin, u, v), "Intersection ajoutée", "Le plan de l'esquisse ne traverse pas ce corps.");
    } catch (error) {
      mode.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  /** These edges projected into the sketch together (one undo step); those seen end-on add nothing. */
  private async projectAll(outlines: EdgeOutline[], done: string, none: string): Promise<void> {
    const { mode } = this;
    let geometry = mode.geometry;
    let count = 0;
    for (const outline of outlines) {
      const next = projectEdge(geometry, outline, mode.frame);
      if (typeof next === "string") continue;
      geometry = next;
      count++;
    }
    if (!count) return mode.host.notify(none, "info");
    mode.apply(geometry, `${done} : ${count} arête(s).`);
  }

  /** « Décaler l'arête »: the body edge clicked, or every edge of the face clicked, projected and offset. */
  private async offsetBodyClick(event: PointerEvent): Promise<void> {
    const { mode } = this;
    const edge = mode.viewport.pickEdge(event);
    const face = edge ? null : mode.viewport.pickFace(event);
    if (!edge && !face) return mode.host.notify("Cliquez une arête ou une face d'un corps, ou un trait de l'esquisse.", "info");
    try {
      const picked = edge
        ? projectEdgeOnce(mode.geometry, await mode.host.edgeOutline(edge.bodyId, edge.edgeIndex), mode.frame)
        : projectFace(mode.geometry, await mode.host.faceOutline(face!.bodyId, face!.faceIndex), mode.frame);
      if (typeof picked === "string") return mode.host.notify(picked, "info");
      // The edges stay in the sketch as fixed references (violet), like « Projeter ».
      if (picked.geometry !== mode.geometry && !mode.apply(picked.geometry)) return;
      mode.edgeOffset?.pickProjected(picked.ids, picked.rings);
    } catch (error) {
      mode.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
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
      if (!waiting || waiting.regions) {
        // Inside a closed shape: its sides are chosen (the smallest area under the pointer); clicked again, they are released.
        // With Maj (or Ctrl, ⌘), or while a command takes several drawings (Centrer), added to what is chosen.
        const face = dimensionTool ? null : regionAt(mode.faces, p);
        const sides = face ? boundaryCurves(mode.geometry, face) : [];
        const chosen = sides.length > 0 && sides.every((id) => mode.selection.has(id));
        const adding = !!waiting || event.shiftKey || event.ctrlKey || event.metaKey;
        if (!adding) mode.selection.clear();
        mode.clickedAt.clear(); // sides of a shape go whole
        if (chosen && adding) for (const id of sides) mode.selection.delete(id);
        if (!chosen) for (const id of sides) mode.selection.add(id);
      }
    } else if (mode.selection.has(hit.id)) {
      mode.selection.delete(hit.id);
      mode.clickedAt.delete(hit.id);
    } else {
      // The dimension tool measures one or two elements: a third click starts a new measurement.
      if (dimensionTool && mode.selection.size >= 2) mode.selection.clear();
      mode.selection.add(hit.id);
      mode.clickedAt.set(hit.id, p);
    }
    if (waiting && waiting.applies(classify(mode.geometry, [...mode.selection]), mode.geometry)) {
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
