/**
 * « Répartition », « Étagères » and « Cloisons » worked directly in the 3D view (as in Polyboard): the camera stays
 * free and the bodies solid. The niches that can be divided are light boxes between the panels: the pointer lights the
 * one under it, a click chooses it (green); the panels the tool would make are shown as orange slabs, at the depth of
 * the panels, before OK. A Répartition is placed by a click on its plane (or by its corner fields). The tools and
 * their panels are those of the sketch (shelves-tool.ts, partition-tool.ts); their lines go to the sketch that holds
 * the partition (a new sketch of the front plane for a new Répartition), and each OK is one undo step.
 */
import type { OffsetRecord, SketchGeometry } from "../document/sketch";
import { emptySketchGeometry } from "../document/sketch";
import { findFeature } from "../document/operations";
import { isEmptyPartition } from "../document/empty-partition";
import type { CadDocument, DisplayUnit, NicheFeature, SketchFeature } from "../document/types";
import * as THREE from "three";
import type { Vec2 } from "../sketcher/edit";
import { extrusionOption } from "../sketcher/extrusion-option";
import { frameOf, rayToSketch, toWorld, type SketchFrame } from "../sketcher/frame";
import { extractLoops, sketchFaces } from "../sketcher/loops";
import type { SketchExtrusion } from "../sketcher/mode";
import { isPartition, leafNiches } from "../sketcher/partition-history";
import { SketchPartitionTool } from "../sketcher/partition-tool";
import type { NicheBox } from "../sketcher/shelves";
import { ShelvesTool } from "../sketcher/shelves-tool";
import { JoineryView, pieceKey } from "../viewport/joinery-view";
import { ModuleTool } from "./dressing/module-tool";
import { NicheHeightTool } from "./dressing/niche-height-tool";
import { nicheUnderPointer } from "./dressing/niche-pick";
import { NicheTool, type NicheFill } from "./dressing/niche-tool";
import { joineryPlans, plansOf } from "./dressing/partition-plan";
import { isolatedSketch } from "./zone-view";
import { wallBar } from "./dressing/wall-bar";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";

export interface JoineryHost {
  doc(): CadDocument;
  unit(): DisplayUnit;
  /** Where the tool panels go (the viewport area). */
  container(): HTMLElement;
  /** An id for a new step of the history, unique in the document. */
  offsetId(): string;
  /**
   * Stores the geometry in this sketch (null: in a new sketch of the front plane), with its extrusions, as one undo
   * step; the id of the sketch, or null when it was refused.
   */
  apply(sketchId: string | null, geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion): string | null;
  /** Adds these equipments of niches (or replaces the one changed) as one undo step; false when it was refused. */
  applyFeatures(features: NicheFeature[], success: string): boolean;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Stores a document made by a tool, as one undo step. */
  applyDocument(doc: CadDocument, success: string): void;
  /** Opens a step of the history in its tool (the one open now ends). */
  openStep(sketch: string, step: string): void;
  /** The tool ended. */
  closed(): void;
}

/** The sketch that holds a répartition: the one chosen, else the last one. */
export function partitionHolder(doc: CadDocument, selected: string | null): SketchFeature | undefined {
  const holders = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && (f.offsets ?? []).some(isPartition));
  // A wall isolated comes first; a panel or an equipment selected stands for its sketch.
  const chosen = selected ? findFeature(doc, selected) : undefined;
  const sketch = isolatedSketch() ?? (chosen?.type === "extrude" || chosen?.type === "niche" ? chosen.sketch : selected);
  // By default the last one with something in view: not a Répartition whose panels are all out.
  const live = holders.filter((f) => !isEmptyPartition(doc, f));
  return holders.find((f) => f.id === sketch) ?? live[live.length - 1] ?? holders[holders.length - 1];
}

/** A new Répartition is drawn in the front plane: the cabinet stands, its niches open to the front. */
const FRONT = { plane: "XZ" as const, offset: 0 };

export class Joinery3D implements PointerHandler {
  /** The point of a niche the next tool opens on, already chosen (a tool started from the menu of a niche). */
  static pick: [number, number] | null = null;

  private readonly view: JoineryView;
  private tool: ShelvesTool | SketchPartitionTool | NicheTool | ModuleTool | NicheHeightTool | null = null;
  /** The sketch worked in (null: a Répartition not yet made). */
  private sketchId: string | null;
  private frame: SketchFrame;
  private niches: { box: NicheBox; depth?: number }[] = [];
  private hover = -1;
  private done = false;
  /** The tool as the menu of a niche names it; none while a step of the history is changed. */
  private action: string | null = null;
  /** A step of the history changed: the pieces it has, already built, are not drawn over themselves. */
  private editing = false;
  private built: Set<string> | null = null;

  private constructor(
    private readonly viewport: Viewport,
    private readonly host: JoineryHost,
    sketch: SketchFeature | null,
  ) {
    this.sketchId = sketch?.id ?? null;
    this.frame = frameOf(sketch ?? FRONT);
    this.view = new JoineryView(viewport.scene);
    viewport.setPointerHandler(this);
  }

  /** A new Répartition (in a new sketch), or one of the history changed (`editing`, in its sketch). */
  static partition(viewport: Viewport, host: JoineryHost, sketch: SketchFeature | null, editing: OffsetRecord | null = null): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new SketchPartitionTool(joinery.toolHost(), editing);
    joinery.tool = tool;
    joinery.editing = editing !== null;
    // A Répartition already made is changed in its panel while the 3D stays free: select, pull a shelf, delete a body
    // there, and the panel follows; each setting of the panel shows in the 3D at once.
    if (editing) viewport.releasePointerHandler(joinery);
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** Étagères or Cloisons in the niches of this sketch's partitions, or a division of the history changed (`editing`). */
  static division(viewport: Viewport, host: JoineryHost, sketch: SketchFeature, vertical: boolean, editing: OffsetRecord | null = null): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new ShelvesTool(joinery.toolHost(), editing, vertical);
    joinery.editing = editing !== null;
    joinery.tool = tool;
    joinery.action = editing ? null : vertical ? "cloisons" : "shelves";
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** Penderie or Tiroirs in the niches of this sketch's partitions, or an equipment of the history changed (`editing`). */
  static equip(viewport: Viewport, host: JoineryHost, sketch: SketchFeature, fill: NicheFill, editing: NicheFeature | null = null): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new NicheTool(
      {
        doc: () => host.doc(),
        sketchId: () => sketch.id,
        container: () => host.container(),
        unit: () => host.unit(),
        apply: (features, success) => {
          if (!host.applyFeatures(features, success)) return false;
          joinery.refresh();
          return true;
        },
        replace: (doc, success) => {
          host.applyDocument(doc, success);
          joinery.refresh();
        },
        changed: () => joinery.render(),
        closed: () => joinery.close(),
        notify: (message, kind) => host.notify(message, kind),
      },
      fill,
      editing,
    );
    joinery.tool = tool;
    joinery.action = editing ? null : fill;
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** A module of dressing in the niches of this sketch's partitions. */
  static module(viewport: Viewport, host: JoineryHost, sketch: SketchFeature): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new ModuleTool({
      doc: () => host.doc(),
      sketchId: () => sketch.id,
      container: () => host.container(),
      unit: () => host.unit(),
      apply: (doc, success) => {
        host.applyDocument(doc, success);
        joinery.refresh();
      },
      changed: () => joinery.render(),
      closed: () => joinery.close(),
      notify: (message, kind) => host.notify(message, kind),
    });
    joinery.tool = tool;
    joinery.action = "module";
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** « Niche »: the height of a niche of this sketch's partitions. */
  static height(viewport: Viewport, host: JoineryHost, sketch: SketchFeature): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new NicheHeightTool(joinery.toolHost());
    joinery.tool = tool;
    joinery.action = "niche";
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** The tools that work in the niches (a click chooses one), rather than placing a Répartition. */
  private picking(): ShelvesTool | NicheTool | ModuleTool | NicheHeightTool | null {
    return this.tool instanceof SketchPartitionTool ? null : this.tool;
  }

  /** What both tools see: the sketch's geometry, and the 3D view instead of the sketch. */
  private toolHost() {
    const selection = new Set<string>();
    return {
      geometry: () => this.geometry(),
      regions: () => sketchFaces(extractLoops(this.geometry())),
      selection,
      container: () => this.host.container(),
      unit: () => this.host.unit(),
      apply: (geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion) => {
        const id = this.host.apply(this.sketchId, geometry, success, extrusion);
        if (id === null) return false;
        if (this.sketchId === null) {
          this.sketchId = id;
          const sketch = findFeature(this.host.doc(), id);
          if (sketch?.type === "sketch") this.frame = frameOf(sketch);
        }
        // What is built now is what the panel has: nothing left to preview over it.
        this.built = null;
        this.refresh();
        return true;
      },
      offsetId: () => this.host.offsetId(),
      flat: () => Math.abs(this.frame.normal[2]) > 0.9,
      changed: () => this.render(),
      fit: ([x0, y0]: [number, number], [x1, y1]: [number, number]) => {
        const depth = extrusionOption.on ? extrusionOption.depth : 0;
        const n = new THREE.Vector3(...this.frame.normal).multiplyScalar(depth);
        const corners = [toWorld(this.frame, x0, y0), toWorld(this.frame, x1, y1)].map((p) => new THREE.Vector3(...p));
        this.viewport.fitBox(new THREE.Box3().setFromPoints([...corners, ...corners.map((c) => c.clone().add(n))]), 1.35);
      },
      closed: () => this.close(),
      notify: (message: string, kind?: "info" | "success" | "error") => this.host.notify(message, kind),
      // The face of a Répartition shows what equips its niches (drawers, rods, doors).
      // The walls of a dressing plan, as the runs of a kitchen: another one opened, the one changed seen alone.
      header: (redraw: () => void) =>
        this.sketchId
          ? wallBar({ doc: () => this.host.doc(), change: (doc, success) => this.host.applyDocument(doc, success), notify: (m, k) => this.host.notify(m, k), open: (sketch, step) => this.host.openStep(sketch, step), redraw }, this.sketchId)
          : null,
      equipment: () => {
        const doc = this.host.doc();
        const sketch = this.sketchId ? findFeature(doc, this.sketchId) : null;
        if (sketch?.type !== "sketch") return null;
        return { sketch, niches: doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === sketch.id) };
      },
    };
  }

  private geometry(): SketchGeometry {
    const sketch = this.sketchId ? findFeature(this.host.doc(), this.sketchId) : null;
    return sketch?.type === "sketch" ? sketch : emptySketchGeometry();
  }

  /** The document changed, in the 3D or anywhere: a Répartition being changed reads its values again. */
  follow(): void {
    if (this.tool instanceof SketchPartitionTool && this.editing) this.sync();
  }

  /** The document changed (an OK, undo, redo): the niches are found again. */
  sync(): void {
    if (this.done) return;
    const sketch = this.sketchId ? findFeature(this.host.doc(), this.sketchId) : null;
    if (this.sketchId && sketch?.type !== "sketch") return this.cancel();
    this.built = null;
    this.tool?.sync();
    this.refresh();
  }

  private refresh(): void {
    this.niches = this.picking() ? leafNiches(this.geometry()) : [];
    this.hover = -1;
    const pick = Joinery3D.pick;
    Joinery3D.pick = null;
    if (pick) this.picking()?.click(pick);
    this.render();
  }

  private depth(): number {
    return extrusionOption.on ? extrusionOption.depth : 0;
  }

  /** What OK would make, for the dimensions in the view. */
  private publishPlans(): void {
    const tool = this.tool;
    const sketch = this.sketchId ? findFeature(this.host.doc(), this.sketchId) : null;
    const plan = tool instanceof SketchPartitionTool ? tool.plan() : null;
    const plans = plan ? [plan] : plansOf(this.geometry(), tool instanceof ShelvesTool || tool instanceof ModuleTool || tool instanceof NicheHeightTool ? tool.divided() : []);
    joineryPlans.current = [{ sketch: sketch?.type === "sketch" ? sketch : null, frame: this.frame, plans }];
    joineryPlans.changed();
  }

  /** What OK would change: while a step is changed, the pieces as they were when it opened stay out of the preview. */
  private changed(pieces: Vec2[][], depth: number): Vec2[][] {
    // A new Répartition stored at its first setting: as one being changed.
    if (!this.editing && !(this.tool instanceof SketchPartitionTool && this.tool.stored())) return pieces;
    this.built ??= new Set(pieces.map((p) => pieceKey(p, depth)));
    return pieces.filter((p) => !this.built?.has(pieceKey(p, depth)));
  }

  private render(): void {
    if (this.done || !this.tool) return;
    this.publishPlans();
    if (this.tool instanceof SketchPartitionTool) return this.view.show(this.frame, this.depth() || 1, [], this.changed(this.tool.pieces(), this.depth() || 1));
    const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
    const tool = this.tool;
    const chosen = tool.chosen();
    // The niches have the depth of their panels (the pieces too, as asked in the panel).
    const depth = this.niches[0]?.depth ?? this.depth();
    this.view.show(
      this.frame,
      depth || 1,
      this.niches.map((n, i) => ({ box: n.box, state: chosen.some((c) => same(c, n.box)) ? "chosen" : i === this.hover ? "hover" : "free" })),
      tool instanceof ShelvesTool || tool instanceof ModuleTool || tool instanceof NicheHeightTool ? this.changed(tool.pieces().map((b): [number, number][] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]), depth || 1) : [],
      tool instanceof NicheTool || tool instanceof ModuleTool ? tool.solids() : [],
    );
  }

  // ---- pointer ------------------------------------------------------------------------

  /** The camera stays free: a press never starts a gesture of the tool. */
  down(): boolean {
    return false;
  }

  move(event: PointerEvent): void {
    if (!this.picking()) return;
    const hit = this.viewport.intersect(event, this.view.targets())[0];
    const index = hit ? (hit.object.userData.niche as number) : -1;
    if (index === this.hover) return;
    this.hover = index;
    this.viewport.renderer.domElement.style.cursor = index >= 0 ? "pointer" : "";
    this.render();
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick || !this.tool) return false;
    const picking = this.picking();
    if (picking) {
      const hit = this.viewport.intersect(event, this.view.targets())[0];
      const niche = hit ? this.niches[hit.object.userData.niche as number] : undefined;
      if (!niche) {
        const elsewhere = this.action ? nicheUnderPointer(this.viewport, this.host.doc(), event) : null;
        // A niche of another wall: the same tool opens there.
        const face = !elsewhere && this.action ? this.viewport.pickFace(event) : null;
        if (elsewhere && elsewhere.sketch !== this.sketchId) document.dispatchEvent(new CustomEvent("cad:niche-elsewhere", { detail: { action: this.action, niche: elsewhere } }));
        // A hollow body of one's own clicked: furnished, the tool opened in it (app/body-furnish.ts).
        else if (face && !document.dispatchEvent(new CustomEvent("cad:niche-body", { cancelable: true, detail: { action: this.action, bodyId: face.bodyId, at: face.point.toArray() } }))) return true;
        else this.host.notify("Cliquez dans une niche (les volumes bleus entre les panneaux).", "info");
        return true;
      }
      picking.click([(niche.box.x0 + niche.box.x1) / 2, (niche.box.y0 + niche.box.y1) / 2]);
      return true;
    }
    // A Répartition already made stays where it is: a click meant for another element must not carry it there.
    if (this.editing) {
      this.host.notify("Cette Répartition reste à sa place : réglez-la dans le panneau, ou terminez pour cliquer ailleurs.", "info");
      return true;
    }
    // Répartition: its lower-left corner where the click meets its plane.
    const { origin, direction } = this.viewport.rayFromEvent(event);
    const p = rayToSketch(this.frame, origin, direction);
    if (p) this.tool.click(p);
    return true;
  }

  // ---- end ----------------------------------------------------------------------------

  handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Enter") this.tool?.confirm();
    else if (event.key === "Escape") this.tool?.cancel();
    else return false;
    return true;
  }

  /** Échap, « Terminer », or another tool opened. */
  cancel(): void {
    if (this.done) return;
    if (this.tool) this.tool.cancel();
    else this.close();
  }

  private close(): void {
    if (this.done) return;
    this.done = true;
    this.tool?.dispose();
    this.tool = null;
    this.view.dispose();
    joineryPlans.current = null;
    joineryPlans.changed();
    this.viewport.renderer.domElement.style.cursor = "";
    this.viewport.releasePointerHandler(this);
    this.host.closed();
  }
}
