/**
 * Keeps the sketches of the document drawn in the 3D view: every sketch stays
 * visible unless hidden with the eye icon of the browser. The sketch being
 * edited is drawn by the sketch mode itself, so it is left out here. The
 * selected sketch is highlighted, and a click on a sketch in the view (its
 * curves or the inside of its areas) selects it. « Ajuster » frames these
 * sketches with the bodies, as large as the view allows, and the grid covers
 * them.
 */
import * as THREE from "three";
import type { CadDocument, SketchFeature } from "../document/types";
import { frameOf, toWorld } from "../sketcher/frame";
import { sketchCurves, sketchPoints, sketchRegions } from "../sketcher/polylines";
import { linesBetweenWalls, wallLines } from "../sketcher/niche-outline";
import { latestBody } from "../document/operations";
import { onTextFont, textOutlines } from "../sketcher/text-outline";
import type { Viewport } from "../viewport/viewport";

export interface SketchDisplayHost {
  doc(): CadDocument;
  /** Feature selected in the browser (a sketch or not). */
  selected(): string | null;
  select(id: string | null): void;
}

/** The box of what these sketches draw in the model (empty: nothing drawn). */
export function sketchBox(sketches: readonly SketchFeature[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const sketch of sketches) {
    const frame = frameOf(sketch);
    for (const { points } of sketchCurves(sketch)) for (const [x, y] of points) box.expandByPoint(new THREE.Vector3(...toWorld(frame, x, y)));
  }
  return box;
}

/** From the tightest: leaves the box just inside the view. */
const MARGINS = [0.55, 0.65, 0.75, 0.85, 1];

export class SketchDisplay {
  private shown: SketchFeature[] = [];
  private highlighted: string | null = null;
  /** The meshes of the walls the lines of bodies furnished were drawn against. */
  private wallsKey = "";
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
    const bodies = viewport.fit.bind(viewport);
    viewport.fit = () => {
      bodies();
      const sketches = sketchBox(this.shown);
      const box = viewport.displayedBodies.length ? viewport.bodiesBox().union(sketches) : sketches;
      if (box.isEmpty()) return;
      for (const margin of MARGINS) {
        viewport.fitBox(box, margin);
        if (viewport.boxVisible(box, 0.94)) return;
      }
    };
    // A plan alone has no body to frame: a standard view frames it.
    const standard = viewport.setView.bind(viewport);
    viewport.setView = (view, distance) => {
      standard(view, distance);
      if (!viewport.displayedBodies.length && distance === undefined) viewport.fit();
    };
  }

  /** Redraws only when the set of visible sketches, or the highlighted one, changed. */
  sync(editingId: string | null): void {
    this.editing = editingId;
    const doc = this.host.doc();
    const visible = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && !f.hidden && f.id !== editingId);
    const box = sketchBox(visible);
    if (this.viewport.displayedBodies.length) box.union(this.viewport.bodiesBox());
    this.viewport.gridArea = box.isEmpty() ? null : [box.min.x, box.min.y, box.max.x, box.max.y];
    const selected = visible.find((f) => f.id === this.host.selected())?.id ?? null;
    // A body furnished: its lines follow its walls, drawn again when their meshes come or change.
    const walls = (f: SketchFeature) => (f.host?.bodies ?? []).flatMap((id) => this.viewport.bodyMesh(latestBody(doc, id)) ?? this.viewport.bodyMesh(id) ?? []);
    const wallsKey = visible.map((f) => walls(f).map((m) => `${m.bodyId}:${m.meshId ?? ""}`).join(",")).join(";");
    if (selected === this.highlighted && wallsKey === this.wallsKey && visible.length === this.shown.length && visible.every((f, i) => f === this.shown[i])) return;
    this.shown = visible;
    this.highlighted = selected;
    this.wallsKey = wallsKey;
    this.viewport.setSketchLines(
      visible.map((f) => ({
        id: f.id,
        frame: frameOf(f),
        curves: [...(f.host ? linesBetweenWalls(sketchCurves(f), f.host.box, wallLines(frameOf(f), walls(f))) : sketchCurves(f)), ...(f.texts ?? []).flatMap((t) => textOutlines(t).map((points, k) => ({ id: `text:${t.id}:${k}`, points })))],
        points: sketchPoints(f),
        regions: sketchRegions(f),
        selected: f.id === selected,
      })),
    );
  }
}
