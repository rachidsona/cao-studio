/**
 * Keeps the sketches of the document drawn in the 3D view: every sketch stays
 * visible unless hidden with the eye icon of the tree. The sketch being edited
 * is drawn by the sketch mode itself, so it is left out here.
 */
import type { CadDocument, SketchFeature } from "../document/types";
import { sketchFrame } from "../sketcher/frame";
import { sketchPolylines } from "../sketcher/polylines";
import type { Viewport } from "../viewport/viewport";

export class SketchDisplay {
  private shown: SketchFeature[] = [];

  constructor(private readonly viewport: Viewport) {}

  /** Redraws only when the set of visible sketches (or one of them) changed. */
  sync(doc: CadDocument, editingId: string | null): void {
    const visible = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && !f.hidden && f.id !== editingId);
    if (visible.length === this.shown.length && visible.every((f, i) => f === this.shown[i])) return;
    this.shown = visible;
    this.viewport.setSketchLines(visible.map((f) => ({ frame: sketchFrame(f.plane, f.offset), polylines: sketchPolylines(f) })));
  }
}
