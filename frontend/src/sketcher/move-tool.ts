/**
 * "Déplacer" tool of the sketch: the user picks points, lines, circles or arcs
 * (several if needed, or whole contours), then drags them with the mouse or
 * types the displacement (relative, distance and angle, or the absolute
 * position of the base point). The result is solved with the constraints of
 * the sketch and shown dashed before it is confirmed; nothing is stored until
 * OK, and confirming is one undo step.
 *
 * State and sequencing only: the maths are in move.ts, the dialog in
 * ui/move-panel.ts, the document is reached through the host.
 */
import { AXIS_X, AXIS_Y, ORIGIN, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { el } from "../ui/dom";
import { renderMovePanel, type MoveMode } from "../ui/move-panel";
import type { Vec2 } from "./edit";
import { hitTest, toggleTarget } from "./hit";
import { basePoint, immovable, movablePoints, moveGeometry, movePreview, withContours, type MoveOutcome } from "./move";
import type { Preview } from "./tools";

export interface MoveHost {
  geometry(): SketchGeometry;
  /** Elements highlighted in the sketch; shared with the sketch mode (read the current set each time). */
  selection: Set<string>;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Pointer → position in the sketch plane. */
  toSketch(event: PointerEvent): Vec2 | null;
  /** Snap of a position on the points and curves not in `exclude`, else on the grid. */
  snap(p: Vec2, exclude: ReadonlySet<string>): Vec2;
  /** Pick distance in sketch units (mm). */
  tolerance(): number;
  /** Stores the new geometry as one undo step; false when it was refused. */
  apply(geometry: SketchGeometry, success: string): boolean;
  /** The preview or the selection changed (redraw). */
  changed(): void;
  /** The tool ended (confirmed or cancelled). */
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Way of giving the displacement, kept for the next move of the session. */
let lastMode: MoveMode = "relative";

const RESERVED = new Set([ORIGIN, AXIS_X, AXIS_Y]);

export class SketchMoveTool {
  preview: Preview | null = null;
  private mode: MoveMode = lastMode;
  private delta: Vec2 = [0, 0];
  private outcome: MoveOutcome | null = null;
  private drag: { start: Vec2; moved: boolean } | null = null;
  private done = false;
  private redrawPending = false;
  private readonly panel: HTMLElement;

  constructor(private readonly host: MoveHost) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 w-72 max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto",
      role: "dialog",
      "aria-label": "Déplacer",
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.container().append(this.panel);
  }

  /** Starts with the elements already selected in the sketch (if any). */
  start(): void {
    this.dropReserved();
    this.recompute();
  }

  /** Re-reads the sketch (after an undo/redo). */
  sync(): void {
    const g = this.host.geometry();
    const known = new Set([...g.points.map((p) => p.id), ...g.curves.map((c) => c.id)]);
    for (const id of [...this.host.selection]) if (!known.has(id)) this.host.selection.delete(id);
    this.recompute();
  }

  /** The origin and the axes cannot be moved: they are never part of the selection. */
  private dropReserved(): void {
    for (const id of RESERVED) this.host.selection.delete(id);
  }

  private pointIds(): string[] {
    return movablePoints(this.host.geometry(), this.host.selection);
  }

  get ready(): boolean {
    return !!this.outcome && this.outcome.ok && !this.outcome.unchanged;
  }

  // ---- computation ------------------------------------------------------------------

  private recompute(): void {
    const g = this.host.geometry();
    const ids = this.pointIds();
    this.outcome = ids.length === 0 ? null : moveGeometry(g, ids, this.delta);
    this.preview = this.outcome?.ok && !this.outcome.unchanged ? movePreview(g, this.outcome.geometry) : null;
    this.draw();
    this.host.changed();
  }

  private setDelta(delta: Vec2): void {
    this.delta = delta;
    this.recompute();
  }

  // ---- panel ------------------------------------------------------------------------

  private draw(): void {
    if (this.done) return;
    // A recompute while a field is being edited must not replace it: redraw once it loses focus.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "text" && this.panel.contains(active)) {
      if (!this.redrawPending) {
        this.redrawPending = true;
        this.panel.addEventListener(
          "focusout",
          () => {
            this.redrawPending = false;
            this.draw();
          },
          { once: true },
        );
      }
      return;
    }
    const g = this.host.geometry();
    const ids = this.pointIds();
    const failure = this.outcome && !this.outcome.ok ? this.outcome.reason : null;
    // Selecting only fixed things explains itself before any displacement is given.
    const problem = failure ?? (ids.length ? immovable(g, ids) : null);
    renderMovePanel(
      this.panel,
      {
        mode: this.mode,
        unit: this.host.unit(),
        delta: this.delta,
        base: basePoint(g, this.host.selection, ids),
        selected: [...this.host.selection].length,
        points: ids.length,
        problem,
        dof: this.outcome?.ok ? this.outcome.dof : null,
        ready: this.ready,
      },
      {
        container: this.host.container(),
        setMode: (mode) => {
          this.mode = lastMode = mode;
          this.draw();
        },
        setDelta: (delta) => this.setDelta(delta),
        selectContours: () => {
          for (const id of withContours(this.host.geometry(), this.host.selection)) this.host.selection.add(id);
          this.recompute();
        },
        clearSelection: () => {
          this.host.selection.clear();
          this.delta = [0, 0];
          this.recompute();
        },
        confirm: () => this.confirm(),
        cancel: () => this.cancel(),
      },
    );
  }

  // ---- pointer ----------------------------------------------------------------------

  /** A click: adds or removes the element under the pointer (a point, else a curve). */
  click(p: Vec2): void {
    const hits = hitTest(this.host.geometry(), p, this.host.tolerance()).filter((h) => !RESERVED.has(h.id));
    const target = toggleTarget(hits, this.host.selection);
    if (!target) return;
    if (this.host.selection.has(target.id)) this.host.selection.delete(target.id);
    else this.host.selection.add(target.id);
    this.recompute();
  }

  /** Takes the pointer to drag the selection when it starts on a selected element (or on any element when nothing is selected yet). */
  down(event: PointerEvent): boolean {
    const p = this.host.toSketch(event);
    if (!p) return false;
    const hit = hitTest(this.host.geometry(), p, this.host.tolerance()).find((h) => !RESERVED.has(h.id));
    if (!hit) return false;
    if (this.host.selection.size === 0) {
      this.host.selection.add(hit.id);
      this.recompute();
    }
    if (!this.host.selection.has(hit.id) && !this.pointIds().includes(hit.id)) return false;
    // A drag measures from where the pointer went down, on a point when it is on one, else on the grid:
    // the displacement then is a round one, like the position it lands on.
    this.drag = { start: hit.kind === "point" ? hit.foot : this.host.snap(p, new Set()), moved: false };
    return true;
  }

  /** Drags the selection: true while a drag is in progress. */
  move(event: PointerEvent): boolean {
    if (!this.drag) return false;
    const p = this.host.toSketch(event);
    if (!p) return true;
    // The elements being moved are not snap targets for themselves.
    const exclude = new Set([...this.host.selection, ...this.pointIds()]);
    const target = this.host.snap(p, exclude);
    const delta: Vec2 = [target[0] - this.drag.start[0], target[1] - this.drag.start[1]];
    if (Math.hypot(...delta) > this.host.tolerance() / 4) this.drag.moved = true;
    if (this.drag.moved) this.setDelta(delta);
    return true;
  }

  /** Ends a drag (the preview stays until OK); true when there was one. */
  up(): boolean {
    const was = this.drag !== null;
    this.drag = null;
    return was;
  }

  // ---- end --------------------------------------------------------------------------

  confirm(): void {
    if (this.done) return;
    if (!this.outcome || !this.outcome.ok || this.outcome.unchanged) {
      this.host.notify(this.outcome && !this.outcome.ok ? this.outcome.reason : "Tirez la sélection ou saisissez un déplacement.", "error");
      return;
    }
    const count = this.pointIds().length;
    if (!this.host.apply(this.outcome.geometry, `Déplacement appliqué (${count} point${count > 1 ? "s" : ""}).`)) return;
    this.finish();
  }

  cancel(): void {
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    this.done = true;
    this.preview = null;
    this.drag = null;
    this.panel.remove();
  }
}
