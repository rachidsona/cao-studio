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
import type { CadDocument, DisplayUnit, NicheFeature, SketchFeature } from "../document/types";
import * as THREE from "three";
import { extrusionOption } from "../sketcher/extrusion-option";
import { frameOf, rayToSketch, toWorld, type SketchFrame } from "../sketcher/frame";
import { extractLoops, sketchFaces } from "../sketcher/loops";
import type { SketchExtrusion } from "../sketcher/mode";
import { leafNiches } from "../sketcher/partition-history";
import { SketchPartitionTool } from "../sketcher/partition-tool";
import type { NicheBox } from "../sketcher/shelves";
import { ShelvesTool } from "../sketcher/shelves-tool";
import { JoineryView } from "../viewport/joinery-view";
import { NicheTool, type NicheFill } from "./niche-tool";
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
  /** The tool ended. */
  closed(): void;
}

/** A new Répartition is drawn in the front plane: the cabinet stands, its niches open to the front. */
const FRONT = { plane: "XZ" as const, offset: 0 };

export class Joinery3D implements PointerHandler {
  private readonly view: JoineryView;
  private tool: ShelvesTool | SketchPartitionTool | NicheTool | null = null;
  /** The sketch worked in (null: a Répartition not yet made). */
  private sketchId: string | null;
  private frame: SketchFrame;
  private niches: { box: NicheBox; depth?: number }[] = [];
  private hover = -1;
  private done = false;

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
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** Étagères or Cloisons in the niches of this sketch's partitions, or a division of the history changed (`editing`). */
  static division(viewport: Viewport, host: JoineryHost, sketch: SketchFeature, vertical: boolean, editing: OffsetRecord | null = null): Joinery3D {
    const joinery = new Joinery3D(viewport, host, sketch);
    const tool = new ShelvesTool(joinery.toolHost(), editing, vertical);
    joinery.tool = tool;
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
        changed: () => joinery.render(),
        closed: () => joinery.close(),
        notify: (message, kind) => host.notify(message, kind),
      },
      fill,
      editing,
    );
    joinery.tool = tool;
    tool.start();
    joinery.refresh();
    return joinery;
  }

  /** The tools that work in the niches (a click chooses one), rather than placing a Répartition. */
  private picking(): ShelvesTool | NicheTool | null {
    return this.tool instanceof ShelvesTool || this.tool instanceof NicheTool ? this.tool : null;
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
    };
  }

  private geometry(): SketchGeometry {
    const sketch = this.sketchId ? findFeature(this.host.doc(), this.sketchId) : null;
    return sketch?.type === "sketch" ? sketch : emptySketchGeometry();
  }

  /** The document changed (an OK, undo, redo): the niches are found again. */
  sync(): void {
    if (this.done) return;
    const sketch = this.sketchId ? findFeature(this.host.doc(), this.sketchId) : null;
    if (this.sketchId && sketch?.type !== "sketch") return this.cancel();
    this.tool?.sync();
    this.refresh();
  }

  private refresh(): void {
    this.niches = this.picking() ? leafNiches(this.geometry()) : [];
    this.hover = -1;
    this.render();
  }

  private depth(): number {
    return extrusionOption.on ? extrusionOption.depth : 0;
  }

  private render(): void {
    if (this.done || !this.tool) return;
    if (this.tool instanceof SketchPartitionTool) return this.view.show(this.frame, this.depth() || 1, [], this.tool.pieces());
    const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
    const tool = this.tool;
    const chosen = tool.chosen();
    // The niches have the depth of their panels (the pieces too, as asked in the panel).
    const depth = this.niches[0]?.depth ?? this.depth();
    this.view.show(
      this.frame,
      depth || 1,
      this.niches.map((n, i) => ({ box: n.box, state: chosen.some((c) => same(c, n.box)) ? "chosen" : i === this.hover ? "hover" : "free" })),
      tool instanceof ShelvesTool ? tool.pieces().map((b): [number, number][] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) : [],
      tool instanceof NicheTool ? tool.solids() : [],
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
        this.host.notify("Cliquez dans une niche (les volumes bleus entre les panneaux).", "info");
        return true;
      }
      picking.click([(niche.box.x0 + niche.box.x1) / 2, (niche.box.y0 + niche.box.y1) / 2]);
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
    this.viewport.renderer.domElement.style.cursor = "";
    this.viewport.setPointerHandler(null);
    this.host.closed();
  }
}
