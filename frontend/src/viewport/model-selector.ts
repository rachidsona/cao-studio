/**
 * The selection of the 3D view: what a click, a window, the browser or Sélection++ adds or removes, on top of the
 * picked items drawn by the selection layer. A sketch clicked alone becomes the sketch selected in the browser;
 * Ctrl, Cmd or Maj add whole bodies and sketches (several at once), as in Fusion.
 */
import type * as THREE from "three";
import type { BodyObject } from "./body-layer";
import type { Candidate } from "./click-candidates";
import { SelectionLayer, type EdgePick, type FacePick, type ModelSelection, type SelectionFilter, type SketchPick } from "./selection-layer";
import type { SketchLayer } from "./sketch-layer";
import type { Point3 } from "./body-points";

export interface SelectorHost {
  bodies(): ReadonlyMap<string, BodyObject>;
  changed(selection: ModelSelection): void;
  /** A sketch picked alone (its id), or none. */
  sketchPicked(sketchId: string | null): void;
}

export class ModelSelector {
  private readonly layer: SelectionLayer;
  /** Last click, to cycle through what lies under the same spot. */
  private lastClick: { x: number; y: number; index: number } | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly sketches: SketchLayer,
    private readonly host: SelectorHost,
  ) {
    this.layer = new SelectionLayer(scene);
  }

  private get bodies() {
    return this.host.bodies() as Map<string, BodyObject>;
  }

  get empty(): boolean {
    return this.layer.empty;
  }

  /** Whole sketches of the multiple selection. */
  get pickedSketches(): string[] {
    return this.layer.sketches;
  }

  private emit(): void {
    this.layer.render(this.bodies);
    this.sketches.paint(this.layer.sketches);
    this.host.changed(this.layer.snapshot());
  }

  /** The sketch selected alone in the browser joins a multiple selection being made (Ctrl/Maj + clic, window). */
  private carryAloneSketch(): void {
    const alone = this.sketches.aloneSketch();
    if (alone) this.layer.add([], [alone]);
  }

  setCornerHints(corners: Point3[], shown: boolean): void {
    this.layer.setCornerHints(corners, shown);
  }

  /** The sketches drawn changed: picked sketches no longer drawn (hidden, deleted, being edited) are dropped. */
  sketchesDrawn(ids: Set<string>): void {
    if (this.layer.pruneSketch(ids)) this.emit();
    else this.sketches.paint(this.layer.sketches);
  }

  /** The bodies were regenerated: the selected faces and edges that still exist are kept. */
  bodiesChanged(): void {
    const before = this.layer.count;
    this.layer.prune(this.bodies);
    this.layer.render(this.bodies);
    if (this.layer.count !== before) this.host.changed(this.layer.snapshot());
  }

  /** Adds or removes a whole body or sketch (Ctrl/Maj + clic in the browser). */
  toggle(kind: "body" | "sketch", id: string): void {
    this.carryAloneSketch();
    if (kind === "sketch") this.layer.toggleSketch(id);
    else if (this.bodies.has(id)) this.layer.toggleBody(id);
    this.emit();
    this.host.sketchPicked(null);
  }

  /** A click on what lies under the pointer (`list`, by priority); again at the same spot, the next one. */
  click(list: Candidate[], at: { x: number; y: number }, filter: SelectionFilter, adding: boolean): void {
    const again = this.lastClick && Math.hypot(at.x - this.lastClick.x, at.y - this.lastClick.y) <= 4 && list.length > 1;
    const index = again && this.lastClick ? (this.lastClick.index + 1) % list.length : 0;
    this.lastClick = { x: at.x, y: at.y, index };
    const chosen = list[index];
    // Cycling replaces what the previous click at this spot selected.
    if (again) this.layer.clear();
    const multi = adding || filter === "body" || this.layer.bodies.length > 0 || this.layer.sketches.length > 0;
    if (chosen?.kind === "sketch" && !multi) {
      // A sketch clicked alone becomes the sketch selected in the browser.
      this.layer.clear();
      this.emit();
      this.host.sketchPicked(chosen.id);
      return;
    }
    if (adding || chosen?.kind === "sketch") this.carryAloneSketch();
    if (chosen?.kind === "sketch") this.layer.toggleSketch(chosen.id);
    else if (chosen?.kind === "vertex") this.layer.toggleVertex(chosen.pick);
    else if (chosen?.kind === "edge") this.layer.toggleEdge(chosen.pick);
    else if (chosen?.kind === "item") this.layer.toggleSketchItem(chosen.pick);
    else if (chosen?.kind === "face" && (filter === "body" || (adding && filter === "auto"))) this.layer.toggleBody(chosen.pick.bodyId);
    else if (chosen?.kind === "face") this.layer.toggleFace(chosen.pick);
    else if (!adding) this.layer.clear();
    this.emit();
    this.host.sketchPicked(null);
  }

  /** What a selection window holds is added. */
  addWindow(bodies: string[], sketches: string[]): void {
    this.carryAloneSketch();
    this.layer.add(bodies, sketches);
    this.emit();
    this.host.sketchPicked(null);
  }

  /** Everything shown, instead of the selection. */
  all(bodies: string[], sketches: string[]): void {
    this.layer.clear();
    this.layer.add(bodies, sketches);
    this.emit();
    this.host.sketchPicked(null);
  }

  /**
   * Sélection++: selects what a level holds (whole bodies, or one face), instead of the selection (or in
   * addition to it with `adding`); a level already wholly selected is removed when adding.
   */
  level(target: { bodies: string[] } | { face: FacePick } | { sketches: string[] } | { item: SketchPick }, adding: boolean): void {
    if (!adding) this.layer.clear();
    if ("face" in target) this.layer.toggleFace(target.face);
    else if ("item" in target) this.layer.toggleSketchItem(target.item);
    else if ("sketches" in target) for (const id of target.sketches) this.layer.toggleSketch(id);
    else if (adding && target.bodies.every((id) => this.layer.bodies.includes(id))) for (const id of target.bodies) this.layer.toggleBody(id);
    else this.layer.add(target.bodies, []);
    this.emit();
    this.host.sketchPicked(null);
  }

  /** One whole body (from the browser), replacing the current selection. */
  selectBody(bodyId: string): void {
    this.layer.clear();
    if (this.bodies.has(bodyId)) this.layer.toggleBody(bodyId);
    this.emit();
  }

  clear(): void {
    if (this.layer.empty) return;
    this.layer.clear();
    this.emit();
  }

  /** The arrows at the ends of the selected edges keep their size on the screen (called every frame). */
  fitArrows(camera: THREE.PerspectiveCamera, viewHeight: number): void {
    this.layer.fitArrows(camera, viewHeight);
  }

  /** The distance shown between two selected parallel edges (null: none). */
  setEdgeGap(gap: Parameters<SelectionLayer["setGap"]>[0]): void {
    this.layer.setGap(gap);
    this.layer.render(this.bodies);
  }

  /** Dimension text displayed next to a selected edge. */
  setEdgeLabel(pick: EdgePick, text: string): void {
    this.layer.setEdgeLabel(pick, text);
    this.layer.render(this.bodies);
  }
}
