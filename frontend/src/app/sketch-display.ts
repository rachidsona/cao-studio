/**
 * Keeps the sketches of the document drawn in the 3D view: every sketch stays
 * visible unless hidden with the eye icon of the browser. The sketch being
 * edited is drawn by the sketch mode itself, so it is left out here. The
 * selected sketch is highlighted, and a click on a sketch in the view (its
 * curves or the inside of its areas) selects it.
 */
import type { CadDocument, SketchFeature } from "../document/types";
import { frameOf } from "../sketcher/frame";
import { sketchCurves, sketchPoints, sketchRegions } from "../sketcher/polylines";
import { onTextFont, textOutlines } from "../sketcher/text-outline";
import type { Viewport } from "../viewport/viewport";

export interface SketchDisplayHost {
  doc(): CadDocument;
  /** Feature selected in the browser (a sketch or not). */
  selected(): string | null;
  select(id: string | null): void;
}

export class SketchDisplay {
  private shown: SketchFeature[] = [];
  private highlighted: string | null = null;
  private editing: string | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly host: SketchDisplayHost,
  ) {
    // The letters of the texts are drawn once their font is loaded.
    onTextFont(() => {
      this.shown = [];
      this.sync(this.editing);
    });
    // Clicking empty space only clears the selection when it is a sketch: other features stay selected.
    viewport.onSketchPick = (id) => {
      const current = this.host.selected();
      if (id || (current && this.host.doc().features.find((f) => f.id === current)?.type === "sketch")) this.host.select(id);
    };
  }

  /** Redraws only when the set of visible sketches, or the highlighted one, changed. */
  sync(editingId: string | null): void {
    this.editing = editingId;
    const doc = this.host.doc();
    const visible = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && !f.hidden && f.id !== editingId);
    const selected = visible.find((f) => f.id === this.host.selected())?.id ?? null;
    if (selected === this.highlighted && visible.length === this.shown.length && visible.every((f, i) => f === this.shown[i])) return;
    this.shown = visible;
    this.highlighted = selected;
    this.viewport.setSketchLines(
      visible.map((f) => ({
        id: f.id,
        frame: frameOf(f),
        curves: [...sketchCurves(f), ...(f.texts ?? []).flatMap((t) => textOutlines(t).map((points, k) => ({ id: `text:${t.id}:${k}`, points })))],
        points: sketchPoints(f),
        regions: sketchRegions(f),
        selected: f.id === selected,
      })),
    );
  }
}
