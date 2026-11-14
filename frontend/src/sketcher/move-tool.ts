/**
 * "Déplacer" tool of the sketch: the user picks points, lines, circles or arcs
 * (several if needed, or whole contours), then drags them with the mouse or
 * types the displacement (relative, distance and angle, or the absolute
 * position of the base point). The result is solved with the constraints of
 * the sketch and shown dashed; each displacement is applied a moment after it is given (one undo step), or at
 * once with « OK » (Entrée). The tool stays for the next one; « Terminer » (the cross, Échap) closes it.
 *
 * Besides dragging the elements themselves, the selection has the arrow manipulator of the 3D Move tool (Shapr3D
 * style): an arrow along each axis of the sketch and a ball to move freely in its plane.
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
import { basePoint, copyOffsets, immovable, movablePoints, moveGeometry, movePreview, parseCopies, stretchGeometry, withContours, type MoveOutcome } from "./move";
import { copyAtOffsets } from "./sketch-array";
import type { Preview } from "./tools";
import { placePanel } from "../ui/dock";
import { dragStep, roundTo } from "../viewport/axis-drag";
import { MoveGizmo } from "../viewport/move-gizmo";
import type { Viewport } from "../viewport/viewport";
import type { SketchFrame, Vec3 } from "./frame";

export interface MoveHost {
  geometry(): SketchGeometry;
  /** Elements highlighted in the sketch; shared with the sketch mode (read the current set each time). */
  selection: Set<string>;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** The 3D view and the sketch plane's frame, for the arrow manipulator. */
  viewport: Viewport;
  frame(): SketchFrame;
  /** A position of the sketch plane → its place in the 3D view. */
  world(p: Vec2): Vec3;
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
  /** « Copies » typed (« x5 », « /5 »): the selection copied along the displacement instead of moved. */
  private copies = "";
  /** « Étirer »: the frame being drawn from an empty spot, to take the points inside it. */
  private box: { start: Vec2; end: Vec2 } | null = null;
  /** The arrow manipulator, and the displacement when it was taken. */
  private readonly gizmo: MoveGizmo;
  private gizmoFrom: Vec2 = [0, 0];
  private done = false;
  /** A displacement given is applied a moment later (no « OK »); the tool stays for the next one. */
  private storeTimer: number | undefined;
  private redrawPending = false;
  private readonly panel: HTMLElement;

  constructor(
    private readonly host: MoveHost,
    /** « Étirer »: the points framed move, the others stay, the dimensions across take their new measure (move.ts). */
    readonly stretch = false,
  ) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 w-72 max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto",
      role: "dialog",
      "aria-label": stretch ? "Étirer" : "Déplacer",
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
    this.gizmo = new MoveGizmo(host.viewport, { planar: true });
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
    const copies = this.stretch ? { count: 0, spread: false } : parseCopies(this.copies);
    if (copies && copies.count > 0 && ids.length && Math.hypot(...this.delta) > 1e-9) {
      // Copied, not moved: the selection stays, its copies go along the displacement.
      const made = copyAtOffsets(g, this.host.selection, copyOffsets(this.delta, copies.count, copies.spread));
      this.outcome = made.ok ? { ok: true, geometry: made.geometry, unchanged: false, dof: 0 } : { ok: false, reason: made.reason };
      this.preview = made.ok ? made.preview : null;
    } else {
      this.outcome = ids.length === 0 ? null : copies === null ? { ok: false, reason: "Copies : tapez un nombre (5 ou x5 : à la suite ; /5 : réparties sur le déplacement)." } : (this.stretch ? stretchGeometry : moveGeometry)(g, ids, this.delta);
      this.preview = this.outcome?.ok && !this.outcome.unchanged ? movePreview(g, this.outcome.geometry) : null;
    }
    this.placeGizmo();
    this.draw();
    this.host.changed();
    window.clearTimeout(this.storeTimer);
    this.storeTimer = this.outcome?.ok && !this.outcome.unchanged && !this.drag ? window.setTimeout(() => ((this.storeTimer = undefined), this.store()), 400) : undefined;
  }

  /** The manipulator sits on the base point, where the selection will land (nothing selected: hidden). */
  private placeGizmo(): void {
    const base = basePoint(this.host.geometry(), this.host.selection, this.pointIds());
    if (!base || this.done) return this.gizmo.hide();
    const { u, v, normal } = this.host.frame();
    this.gizmo.place(this.host.world([base.pos[0] + this.delta[0], base.pos[1] + this.delta[1]]), { x: u, y: v, z: normal });
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
        stretch: this.stretch,
        copies: this.copies,
      },
      {
        container: this.host.container(),
        setMode: (mode) => {
          this.mode = lastMode = mode;
          this.draw();
        },
        setDelta: (delta) => this.setDelta(delta),
        setCopies: (text) => {
          this.copies = text;
          this.recompute();
        },
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
    if (this.gizmo.dragStart(event)) {
      this.gizmoFrom = [...this.delta];
      return true;
    }
    const p = this.host.toSketch(event);
    if (!p) return false;
    const hit = hitTest(this.host.geometry(), p, this.host.tolerance()).find((h) => !RESERVED.has(h.id));
    // « Étirer »: from an empty spot, a frame takes the points inside it.
    if (!hit && this.stretch) return (this.box = { start: p, end: p }), true;
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
    const pull = this.gizmo.dragMove(event);
    if (pull) {
      // The displacement of the manipulator, in the sketch's axes, rounded to the zoom.
      const { u, v } = this.host.frame();
      const step = dragStep(this.host.viewport.worldPerPixel());
      const along = (axis: Vec3) => axis[0] * pull[0] + axis[1] * pull[1] + axis[2] * pull[2];
      this.setDelta([roundTo(this.gizmoFrom[0] + along(u), step), roundTo(this.gizmoFrom[1] + along(v), step)]);
      return true;
    }
    if (this.box) {
      const p = this.host.toSketch(event);
      if (p) this.box.end = p;
      const [a, b] = [this.box.start, this.box.end];
      const corners: Vec2[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
      this.preview = { lines: corners.map((c, i) => [c, corners[(i + 1) % 4]!] as [Vec2, Vec2]), circles: [], arcs: [] };
      this.host.changed();
      return true;
    }
    if (!this.drag) {
      // Over the manipulator: a hand, and the handle lights up.
      const over = this.gizmo.hovered(event) !== null;
      this.host.viewport.renderer.domElement.style.cursor = over ? "grab" : "";
      return false;
    }
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
    // Let go: the displacement is applied a moment later.
    if (this.gizmo.dragEnd()) return (this.recompute(), true);
    if (this.box) {
      const [a, b] = [this.box.start, this.box.end];
      this.box = null;
      const inside = (x: number, y: number) => x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1]);
      // A frame drawn again replaces the points taken; a click on an empty spot keeps them.
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > this.host.tolerance()) {
        this.host.selection.clear();
        for (const q of this.host.geometry().points) if (!q.fixed && inside(q.x, q.y)) this.host.selection.add(q.id);
        this.delta = [0, 0];
      }
      this.recompute();
      return true;
    }
    const was = this.drag !== null;
    this.drag = null;
    if (was) this.recompute();
    return was;
  }

  // ---- end --------------------------------------------------------------------------

  /** « OK » or Entrée: applied now; the tool stays, the selection ready to be moved again (« Terminer » closes it). */
  confirm(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    if (this.outcome?.ok && this.outcome.unchanged) return;
    this.store(true);
  }

  /** The displacement applied (one undo step); the selection stays, ready to be moved again from where it is. */
  private store(loud = false): boolean {
    if (this.done) return false;
    if (!this.outcome || !this.outcome.ok || this.outcome.unchanged) {
      if (loud) this.host.notify(this.outcome && !this.outcome.ok ? this.outcome.reason : this.stretch ? "Encadrez des points, puis tirez-les ou saisissez le déplacement." : "Tirez la sélection ou saisissez un déplacement.", "error");
      return false;
    }
    const count = this.pointIds().length;
    const copies = this.stretch ? null : parseCopies(this.copies);
    const done = copies?.count ? `${copies.count} copie${copies.count > 1 ? "s" : ""} posée${copies.count > 1 ? "s" : ""}${copies.spread ? ", réparties sur le déplacement" : ""}.` : `${this.stretch ? "Étirement" : "Déplacement"} appliqué (${count} point${count > 1 ? "s" : ""}).`;
    if (!this.host.apply(this.outcome.geometry, done)) return false;
    this.delta = [0, 0];
    this.recompute();
    return true;
  }

  /** The cross, or Échap: closes; a displacement still waiting is applied first. */
  cancel(): void {
    if (this.storeTimer !== undefined) {
      window.clearTimeout(this.storeTimer);
      this.storeTimer = undefined;
      this.store();
    }
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    window.clearTimeout(this.storeTimer);
    this.done = true;
    this.gizmo.dispose();
    this.preview = null;
    this.drag = null;
    this.box = null;
    this.panel.remove();
  }
}
