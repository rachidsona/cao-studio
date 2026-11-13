/**
 * Sketch mode controller: pointer interaction on the sketch plane (drawing
 * tools, selection, point dragging), constraint commands, and the commit
 * rule: every change is solved first and rejected if it over-constrains the
 * sketch, so the document only ever holds solvable sketches.
 *
 * The pointer lives in sketch-pointer, the dimension values in sketch-values, the panel tools' hosts in
 * tool-hosts and the remembered choices in sketch-prefs; their shared state is public here.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import * as THREE from "three";
import { classify, COMMANDS, describeConstraints } from "../constraints/catalog";
import { solveSketch, SketchError, type SolveResult } from "../constraints/solver";
import { ORIGIN, type OffsetRecord, type SketchConstraint, type SketchGeometry } from "../document/sketch";
import type { DisplayUnit, NicheFeature, SketchFeature } from "../document/types";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import type { EdgeOutline, FaceOutline } from "../geometry/protocol";
import { closeCalculator } from "../ui/calculator";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { dimensionAnnotations, measureAnnotations, pairAnnotation, previewAnnotations, type Annotation } from "./annotations";
import { SketchArrayTool } from "./array-tool";
import { ShelvesTool } from "./shelves-tool";
import { SketchPartitionTool } from "./partition-tool";
import { pruneBodyPoints, withBodyPoints } from "./body-points";
import { addConstraint, findCurve, removeEntities, setDimensionValue, toggleConstruction, type Vec2 } from "./edit";
import { frameOf, rayToSketch, toWorld, type SketchFrame, type Vec3 } from "./frame";
import { extractLoops, regions as regionsOf, sketchFaces, type Region } from "./loops";
import { SketchMoveTool } from "./move-tool";
import { OffsetTool } from "./offset-tool";
import { EdgeOffsetTool } from "./edge-offset-tool";
import { clickedPiece, deleteWithPieces } from "./segment-delete";
import { SketchOverlay } from "./overlay";
import { sketchPrefs, toggleSnap } from "./sketch-prefs";
import { SketchPointer } from "./sketch-pointer";
import { SketchValues } from "./sketch-values";
import { closeTextDialog } from "./text-dialog";
import { onTextFont, textOutlines } from "./text-outline";
import { arrayHost, edgeOffsetHost, moveHost, offsetHost, partitionHost, shelvesHost } from "./tool-hosts";
import { DrawingTool, type Preview, type ToolName } from "./tools";

/** Pick tolerance in screen pixels (larger on touch screens). */
const PICK_PX = matchMedia("(pointer: coarse)").matches ? 16 : 8;

export type SketchToolName = ToolName | "dimension" | "offset" | "move" | "extend" | "trim" | "break" | "fillet" | "chamfer" | "project" | "intersect" | "text" | "array" | "offsetEdge" | "shelves" | "cloisons" | "partition";

/**
 * What a click does when no drawing or panel tool is open: select ("select"), measure ("dimension" — the
 * selection shows its measurements, clickable to become dimensions), "extend" (Prolonger), "trim" (Ajuster:
 * the part between two crossings goes) or "break" (Couper: the curve is cut at the crossings, nothing goes).
 */
export type ClickKind = "select" | "dimension" | "extend" | "trim" | "break" | "fillet" | "chamfer" | "project" | "intersect" | "text";

/** One element to extrude: the area it is (a point inside it), and what it is called. */
export interface ExtrudedElement {
  probe: [number, number];
  /** « Côté », « Dessous », « Étagère »… */
  name: string;
  /** Numbered after the ones of the same name already in the document (« Côté 3 »). */
  numbered?: boolean;
}

/**
 * Extrusions made in the same step as the sketch: each element is extruded on its own — a body of its own, named
 * after what it is — this far (mm). A group belongs to a step of the history (`record`), which remembers its bodies;
 * the bodies it made before (`remove`) are deleted first, when the step is made again.
 */
export interface ExtrusionGroup {
  record?: string;
  distance: number;
  elements: ExtrudedElement[];
  remove?: string[];
}

export interface SketchExtrusion {
  groups: ExtrusionGroup[];
  /** Niches divided again from above: what equips them follows to its new path. */
  repath?: { partition: string; path: (path: number[]) => number[] }[];
  /** Drawers and rods changed in the same step (moved, copied: a copy's id starts with « face-new- » until stored). */
  niches?: NicheFeature[];
  /** Drawers and rods taken away in the same step. */
  removeNiches?: string[];
}

export interface SketchModeHost {
  /** Stores a solved geometry in the document (one undo step), with an extrusion of some of its areas when asked. */
  commit(featureId: string, geometry: SketchGeometry, extrusion?: SketchExtrusion): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Called whenever selection, tool or solve state changes. */
  changed(): void;
  focusDimension(id: string): void;
  unit(): DisplayUnit;
  /** Element the value keypad is placed in (the viewport area). */
  calculatorContainer(): HTMLElement;
  /** Planar offset computed by the geometry kernel. */
  offset(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
  /** An id for a new offset record, unique in the document. */
  offsetId(): string;
  /** One body edge, exactly, to project it into the sketch. */
  edgeOutline(bodyId: string, edgeIndex: number): Promise<EdgeOutline>;
  /** The edges of a body face (« Décaler l'arête » on a clicked face). */
  faceOutline(bodyId: string, faceIndex: number): Promise<FaceOutline>;
  /** Every edge of a body (« Projeter » with Maj). */
  bodyOutline(bodyId: string): Promise<EdgeOutline[]>;
  /** Where the sketch plane cuts a body (« Intersection »). */
  sectionOutline(bodyId: string, origin: Vec3, u: Vec3, v: Vec3): Promise<EdgeOutline[]>;
}

const HINTS: Record<Exclude<ClickKind, "select">, string> = {
  dimension: "Cote : cliquez un élément (ou deux) pour voir la mesure, recliquez pour la poser — cliquez une valeur pour la modifier",
  extend: "Prolonger : survolez le bout d'une ligne ou d'un arc, cliquez pour le prolonger jusqu'à la courbe suivante — Échap revient à la sélection",
  trim: "Ajuster : survolez la partie d'une ligne, d'un arc ou d'un cercle entre deux croisements (elle s'affiche), cliquez pour la supprimer — Échap revient à la sélection",
  break: "Couper : survolez une ligne, un arc ou un cercle (les croix rouges montrent où il sera coupé), cliquez pour le couper en morceaux — Échap revient à la sélection",
  fillet: "Congé : cliquez un coin où deux lignes se rejoignent, puis tapez le rayon — Échap revient à la sélection",
  chamfer: "Chanfrein : cliquez un coin où deux lignes se rejoignent, puis tapez la distance — Échap revient à la sélection",
  text: "Texte : cliquez où commence la ligne de base du texte (ou un texte pour le modifier) — pour graver, extrudez en « Couper » — Échap revient à la sélection",
  project: "Projeter (comme Fusion) : cliquez une arête, ou une face pour tout son contour, ou Maj + clic pour tout le corps ; en violet, repères fixes où s'accrocher — Échap revient à la sélection",
  intersect: "Intersection (comme Fusion) : cliquez un corps ; là où le plan de l'esquisse le coupe s'ajoute en violet, repère fixe — Échap revient à la sélection",
};

export class SketchMode implements PointerHandler {
  readonly frame: SketchFrame;
  readonly featureId: string;
  geometry: SketchGeometry;
  selection = new Set<string>();
  /** Where each line was clicked when selected: Suppr removes only that piece of a crossed line. */
  readonly clickedAt = new Map<string, Vec2>();
  tool: DrawingTool | null = null;
  construction = false;
  lastSolve: SolveResult;
  kind: ClickKind = "select";
  preview: Preview | null = null;
  /** Every closed area of the sketch (a profile, at any depth): what a click inside a shape chooses. */
  faces: Region[] = [];
  /** Annotations of the last render (to pick dimension lines). */
  annotations: Annotation[] = [];
  /** A constraint chosen with nothing (or the wrong things) selected: it waits for the clicks, as in Fusion. */
  pendingCommand: string | null = null;
  /** Panel tools, while they are open. */
  offset: OffsetTool | null = null;
  /** « Décaler l'arête »: no dialog, an arrow on the copy; it stays until Échap. */
  edgeOffset: EdgeOffsetTool | null = null;
  moveTool: SketchMoveTool | null = null;
  arrayTool: SketchArrayTool | null = null;
  /** « Étagères »: divides the niche clicked; stays until Échap. */
  shelves: ShelvesTool | null = null;
  /** « Répartition »: draws a rectangle divided into cases; ends at OK. */
  partition: SketchPartitionTool | null = null;
  readonly values: SketchValues;
  private readonly pointer: SketchPointer;
  private overlay: SketchOverlay;
  private lastBounds: THREE.Box3 | null = null;

  constructor(
    feature: SketchFeature,
    readonly viewport: Viewport,
    readonly host: SketchModeHost,
  ) {
    this.featureId = feature.id;
    this.frame = frameOf(feature);
    this.geometry = this.withBodies(feature);
    this.lastSolve = solveSketch(this.geometry);
    this.values = new SketchValues(this);
    this.pointer = new SketchPointer(this);
    this.overlay = new SketchOverlay(viewport.scene, this.frame, () => viewport.worldPerPixel());
    this.overlay.onAnnotationPointerDown = (annotation, event) => this.values.pointerDown(annotation, event);
    this.overlay.onGlyphClick = (id) => this.toggleSelected(id);
    viewport.enterSketch(this.frame, this);
    onTextFont(() => this.render());
    this.render();
    // An existing sketch may be larger than the part: show all of it.
    if (feature.points.length || feature.curves.length) this.ensureVisible(true);
  }

  /** The stored geometry plus the corners of the displayed bodies, offered as fixed points to snap on. */
  private withBodies(feature: SketchFeature): SketchGeometry {
    const stored = { points: feature.points, curves: feature.curves, constraints: feature.constraints, ...(feature.offsets ? { offsets: feature.offsets } : {}), ...(feature.texts ? { texts: feature.texts } : {}), ...(feature.underlay ? { underlay: feature.underlay } : {}) };
    return withBodyPoints(stored, this.frame, this.viewport.bodyVertices());
  }

  /** World bounding box of the sketch (points, circles and arcs), with room around it for the dimension lines. */
  private bounds(): THREE.Box3 {
    const box = new THREE.Box3().expandByPoint(new THREE.Vector3(...toWorld(this.frame, 0, 0)));
    const add = (x: number, y: number) => box.expandByPoint(new THREE.Vector3(...toWorld(this.frame, x, y)));
    // The body corners offered but unused do not widen the view; the reference image does.
    for (const p of pruneBodyPoints(this.geometry).points) add(p.x, p.y);
    const u = this.geometry.underlay;
    if (u) add(u.x, u.y), add(u.x + u.width, u.y + u.height);
    for (const c of this.geometry.curves) {
      if (c.kind === "line") continue;
      const center = c.center === ORIGIN ? { x: 0, y: 0 } : this.geometry.points.find((p) => p.id === c.center);
      if (!center) continue;
      add(center.x - c.radius, center.y - c.radius);
      add(center.x + c.radius, center.y + c.radius);
    }
    return box;
  }

  /**
   * Frames the whole sketch and its dimensions. Automatically (not `force`), only when the sketch has just
   * grown beyond the screen: a view zoomed in on a detail on purpose is left alone.
   */
  ensureVisible(force = false): void {
    const box = this.bounds();
    const grew = !this.lastBounds || !this.lastBounds.containsBox(box);
    this.lastBounds = box;
    if (box.isEmpty()) return;
    if (force || (grew && !this.viewport.boxVisible(box, 0.8))) this.viewport.fitBox(box, 1.35);
  }

  /** Reloads the geometry after an external change (undo/redo, properties panel). */
  sync(feature: SketchFeature): void {
    this.geometry = this.withBodies(feature);
    const known = new Set([ORIGIN, ...this.geometry.points.map((p) => p.id), ...this.geometry.curves.map((c) => c.id)]);
    this.selection = new Set([...this.selection].filter((id) => known.has(id)));
    this.lastSolve = solveSketch(this.geometry);
    this.offset?.sync();
    this.edgeOffset?.sync();
    this.moveTool?.sync();
    this.arrayTool?.sync();
    this.shelves?.sync();
    this.partition?.sync();
    this.render();
    this.ensureVisible();
  }

  exit(): void {
    closeCalculator();
    closeTextDialog();
    this.offset?.dispose();
    this.edgeOffset?.dispose();
    this.moveTool?.dispose();
    this.arrayTool?.dispose();
    this.shelves?.dispose();
    this.partition?.dispose();
    this.overlay.dispose();
    this.viewport.exitSketch();
  }

  /** A tool with its own dialog (Décalage, Déplacer) is open: Enter confirms it, Échap cancels it. */
  get panelToolActive(): boolean {
    return this.offset !== null || this.edgeOffset !== null || this.moveTool !== null || this.arrayTool !== null || this.shelves !== null || this.partition !== null;
  }

  /** A tool other than the selection is active (Échap returns to the selection before leaving the sketch). */
  get toolActive(): boolean {
    return this.tool !== null || this.kind !== "select" || this.pendingCommand !== null;
  }

  /** The constraint waiting for its elements, if any (its button shows pressed). */
  get waitingCommand(): string | null {
    return this.pendingCommand;
  }

  get toolName(): SketchToolName {
    if (this.kind !== "select" && this.kind !== "dimension") return this.kind;
    if (this.offset) return "offset";
    if (this.edgeOffset) return "offsetEdge";
    if (this.moveTool) return "move";
    if (this.arrayTool) return "array";
    if (this.shelves) return this.shelves.kind;
    if (this.partition) return "partition";
    if (this.kind === "dimension") return "dimension";
    return this.tool?.name ?? "select";
  }

  get hint(): string {
    if (this.edgeOffset) return "Décaler l'arête : cliquez un trait, une arête ou une face d'un corps, puis tirez la flèche (ou tapez la distance) ; cliquez-en un autre pour continuer — Échap termine";
    if (this.offset) return "Décalage : cliquez les éléments à décaler, réglez la distance : enregistré dès qu'il est prêt — ✕ ou Échap ferme";
    const waiting = this.pendingCommand ? COMMANDS.find((c) => c.id === this.pendingCommand) : undefined;
    if (waiting) return `${waiting.label} : ${waiting.pick} — Échap pour arrêter`;
    if (this.kind !== "select" && this.kind !== "dimension") return HINTS[this.kind];
    if (this.moveTool) return "Déplacer : cliquez les éléments, tirez-les ou saisissez le déplacement : appliqué aussitôt — ✕ ou Échap ferme";
    if (this.partition) return "Répartition : réglez la hauteur, la longueur et les cases ; cliquez dans la vue pour poser le coin bas-gauche : chaque réglage est enregistré — ✕ ou Échap ferme";
    if (this.shelves?.kind === "cloisons") return "Cloisons : cliquez une niche, réglez les cloisons, puis OK (Entrée) ; cliquez une niche obtenue pour la diviser à son tour — Terminer ou Échap ferme";
    if (this.shelves) return "Étagères : cliquez une niche, réglez les étagères, puis OK (Entrée) ; cliquez une niche obtenue pour la diviser à son tour — Terminer ou Échap ferme";
    if (this.arrayTool) return "Réseau rectangulaire : cliquez les éléments à copier, réglez les deux directions : enregistré dès qu'il est prêt — ✕ ou Échap ferme";
    if (this.kind === "dimension") return HINTS.dimension;
    return this.tool ? this.tool.step : "Sélectionnez des éléments, puis appliquez une contrainte — un trait de cote ou un symbole de contrainte sélectionné se supprime avec Suppr";
  }

  /** Drawing snaps to the grid lines shown (on by default); the choice is remembered. */
  get gridSnap(): boolean {
    return sketchPrefs.gridSnap;
  }

  toggleGridSnap(): void {
    sketchPrefs.gridSnap = !sketchPrefs.gridSnap;
    this.host.changed();
    this.host.notify(this.gridSnap ? "Accrochage à la grille activé." : "Accrochage à la grille désactivé.", "info");
  }

  /** Snapping on the points and lines of the sketch, and in line with its points (as in Aspire); both remembered. */
  get geometrySnap(): boolean {
    return sketchPrefs.geometrySnap;
  }

  get smartSnap(): boolean {
    return sketchPrefs.smartSnap;
  }

  toggleSnap(which: "geometrySnap" | "smartSnap"): void {
    const message = toggleSnap(which);
    this.host.changed();
    this.host.notify(message, "info");
  }

  /** Constraint symbols (H, V, ∥…) are shown on demand; the choice is remembered. */
  get showGlyphs(): boolean {
    return sketchPrefs.glyphs;
  }

  /** The free points are drawn only on request; the choice is remembered. */
  get showPoints(): boolean {
    return sketchPrefs.points;
  }

  togglePoints(): void {
    sketchPrefs.points = !sketchPrefs.points;
    this.render();
    this.host.changed();
  }

  toggleGlyphs(): void {
    sketchPrefs.glyphs = !sketchPrefs.glyphs;
    this.render();
    this.host.changed();
  }

  /** Reopens a "Décalage" of the timeline: its source curves selected, its settings restored. */
  editOffset(id: string): void {
    const record = this.geometry.offsets?.find((o) => o.id === id);
    if (!record) return;
    // A « Répartition » or a division by shelves: its own tool, opened on its values.
    if (record.step) {
      this.selection.clear();
      return this.setTool(record.step.kind, record);
    }
    const known = new Set(this.geometry.curves.map((c) => c.id));
    this.selection = new Set(record.source.filter((s) => known.has(s)));
    this.setTool("offset", record);
  }

  /** Selects or deselects one entity or constraint (the symbol of a constraint was clicked). */
  private toggleSelected(id: string): void {
    if (!this.selection.delete(id)) this.selection.add(id);
    closeCalculator();
    this.render();
    this.host.changed();
  }

  setTool(name: SketchToolName, editing?: OffsetRecord): void {
    closeCalculator();
    this.offset?.dispose();
    this.offset = null;
    this.edgeOffset?.dispose();
    this.edgeOffset = null;
    this.moveTool?.dispose();
    this.moveTool = null;
    this.arrayTool?.dispose();
    this.arrayTool = null;
    this.shelves?.dispose();
    this.shelves = null;
    this.partition?.dispose();
    this.partition = null;
    this.pointer.reset();
    this.viewport.renderer.domElement.style.cursor = "";
    this.kind = name === "dimension" || name === "extend" || name === "trim" || name === "break" || name === "fillet" || name === "chamfer" || name === "project" || name === "intersect" || name === "text" ? name : "select";
    this.pendingCommand = null;
    if (this.kind === "dimension") this.selection.clear();
    if (name === "offsetEdge") {
      this.selection.clear();
      this.edgeOffset = new EdgeOffsetTool(edgeOffsetHost(this));
    }
    if (name === "offset") {
      // Curves already selected are offset right away; anything else is dropped from the selection.
      this.selection = new Set([...this.selection].filter((id) => findCurve(this.geometry, id)));
      this.offset = new OffsetTool(offsetHost(this), editing ?? null);
      this.offset.start();
    }
    if (name === "move") {
      this.moveTool = new SketchMoveTool(moveHost(this));
      this.moveTool.start();
    }
    if (name === "array") {
      this.arrayTool = new SketchArrayTool(arrayHost(this));
      this.arrayTool.start();
    }
    if (name === "shelves" || name === "cloisons") {
      this.selection.clear();
      this.shelves = new ShelvesTool(shelvesHost(this), editing?.step?.kind === "shelves" ? editing : null, name === "cloisons");
      this.shelves.start();
    }
    if (name === "partition") {
      this.selection.clear();
      this.partition = new SketchPartitionTool(partitionHost(this), editing?.step?.kind === "partition" ? editing : null);
      this.partition.start();
    }
    const drawing = name !== "select" && name !== "offset" && name !== "offsetEdge" && name !== "move" && name !== "array" && name !== "shelves" && name !== "cloisons" && name !== "partition" && this.kind === "select";
    this.tool = drawing ? new DrawingTool(name as Exclude<ToolName, "select">, this.construction) : null;
    // A drawing tool (line, rectangle, circle, arc) has the cross cursor.
    if (this.tool) this.viewport.renderer.domElement.style.cursor = THIN_CROSSHAIR;
    this.preview = null;
    this.render();
    this.host.changed();
  }

  /** Toggles construction for the selected curves, or for the next curves drawn. */
  toggleConstruction(): void {
    const curves = [...this.selection].filter((id) => this.geometry.curves.some((c) => c.id === id));
    if (curves.length) {
      this.apply(toggleConstruction(this.geometry, curves));
      return;
    }
    this.construction = !this.construction;
    if (this.tool) this.tool.construction = this.construction;
    this.host.changed();
  }

  /** Confirms the offset or the move being previewed (Enter). */
  confirmPanelTool(): void {
    void this.offset?.confirm();
    this.edgeOffset?.cancel(); // its copies are already made: Entrée ends it as Échap does
    this.moveTool?.confirm();
    this.arrayTool?.confirm();
    this.shelves?.confirm();
    this.partition?.confirm();
  }

  cancel(): void {
    const panel = this.offset ?? this.edgeOffset ?? this.moveTool ?? this.arrayTool ?? this.shelves ?? this.partition;
    if (panel) return panel.cancel();
    // The elements picked so far for a waiting constraint are dropped with it.
    if (this.pendingCommand) this.selection.clear();
    // Échap ends a tool (an open polyline stays as drawn) and goes back to the selection; the "Cote" tool first drops its measurement.
    if (this.pendingCommand || this.tool || (this.kind !== "select" && !(this.kind === "dimension" && this.selection.size > 0))) return this.setTool("select");
    this.selection.clear();
    this.clickedAt.clear();
    this.render();
    this.host.changed();
  }

  // ---- commit pipeline ------------------------------------------------------

  /** Solves `geometry`; commits it if solvable, otherwise explains and keeps the previous state. */
  apply(geometry: SketchGeometry, success?: string, extrusion?: SketchExtrusion): boolean {
    let result: SolveResult;
    try {
      result = solveSketch(geometry);
    } catch (error) {
      this.host.notify(error instanceof SketchError ? error.message : String(error), "error");
      return false;
    }
    if (result.state === "conflicting" || result.state === "failed") {
      this.host.notify(result.state === "conflicting" ? `Modification refusée : contraintes en conflit (${describeConstraints(geometry, result.conflicting)}).` : "Modification refusée : aucune forme ne respecte toutes les contraintes et cotes.", "error");
      this.render();
      return false;
    }
    this.geometry = result.geometry;
    this.lastSolve = result;
    this.host.commit(this.featureId, pruneBodyPoints(result.geometry), extrusion);
    this.ensureVisible();
    if (result.state === "redundant") this.host.notify(`Contrainte redondante, déjà impliquée par les autres : ${describeConstraints(geometry, result.redundant)}.`, "info");
    else if (success) this.host.notify(success, "success");
    this.render();
    this.host.changed();
    return true;
  }

  applicableCommands(): string[] {
    const sel = classify(this.geometry, [...this.selection]);
    return COMMANDS.filter((c) => c.applies(sel)).map((c) => c.id);
  }

  /**
   * Runs a constraint command on the selection; when the selection does not fit, the command waits for the
   * elements to be clicked (Fusion's way), and is applied as soon as they are.
   */
  runCommand(id: string): string[] {
    const command = COMMANDS.find((c) => c.id === id);
    const sel = classify(this.geometry, [...this.selection]);
    if (!command) return [];
    if (!command.applies(sel)) {
      this.setTool("select");
      this.selection.clear();
      this.pendingCommand = id;
      this.render();
      this.host.changed();
      return [];
    }
    let geometry = this.geometry;
    const created: string[] = [];
    try {
      for (const constraint of command.build(sel, geometry)) {
        const added = addConstraint(geometry, constraint as Omit<SketchConstraint, "id">);
        geometry = added.geometry;
        created.push(added.id);
      }
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
      return [];
    }
    if (!this.apply(geometry, `${command.label} ajoutée.`)) return [];
    this.selection.clear();
    this.render();
    this.host.changed();
    return created;
  }

  setDimension(id: string, value: number): boolean {
    return this.apply(setDimensionValue(this.geometry, id, value));
  }

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    closeCalculator();
    const ids = [...this.selection].filter((id) => id !== ORIGIN);
    this.selection.clear();
    const { geometry, pieces } = deleteWithPieces(this.geometry, ids, this.clickedAt);
    this.clickedAt.clear();
    this.apply(geometry, pieces ? `${pieces} morceau(x) supprimé(s), entre les croisements.` : undefined);
  }

  removeConstraint(id: string): void {
    this.apply(removeEntities(this.geometry, [id]));
  }

  // ---- pointer (see sketch-pointer) ------------------------------------------------

  /** A key while a shape is drawn: a dimension typed, as in Fusion (typed-dims.ts). False: not for it. */
  typeDimension(event: KeyboardEvent): boolean {
    return this.pointer.entry.key(event);
  }

  toSketch(event: PointerEvent): Vec2 | null {
    const { origin, direction } = this.viewport.rayFromEvent(event);
    return rayToSketch(this.frame, origin, direction);
  }

  tolerance(): number {
    return PICK_PX * this.viewport.worldPerPixel();
  }

  down(event: PointerEvent): boolean {
    return this.pointer.down(event);
  }

  move(event: PointerEvent): void {
    this.pointer.move(event);
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    return this.pointer.up(event, isClick);
  }

  render(): void {
    const flagged = new Set([...this.lastSolve.conflicting, ...this.lastSolve.redundant]);
    const unit = this.host.unit();
    // Measurements of the selection only with the "Cote" tool; placed dimensions are always shown.
    const selected = [...this.selection];
    const measures =
      this.kind !== "dimension"
        ? []
        : selected.length === 1
          ? measureAnnotations(this.geometry, selected.filter((id) => findCurve(this.geometry, id)), unit)
          : [pairAnnotation(this.geometry, selected, unit)].filter((a): a is NonNullable<typeof a> => a !== null);
    let regions: Region[] = [];
    this.faces = [];
    try {
      const loops = extractLoops(this.geometry);
      regions = regionsOf(loops);
      this.faces = sketchFaces(loops);
    } catch {
      // Open or branched profile: nothing to tint.
    }
    this.annotations = [...dimensionAnnotations(this.geometry, unit), ...measures];
    const curveTool = this.kind === "extend" || this.kind === "trim" || this.kind === "break";
    this.overlay.render({
      geometry: this.geometry,
      selection: this.selection,
      hover: this.pointer.hover,
      // A single line clicked where others cross it: the piece Suppr removes is shown.
      preview: this.preview ?? (this.kind === "select" && !this.tool && !this.panelToolActive ? (clickedPiece(this.geometry, this.selection, this.clickedAt)?.preview ?? null) : null),
      unit,
      flagged,
      annotations: [
        ...this.annotations,
        ...(this.panelToolActive || curveTool ? [] : this.pointer.entry.fields(previewAnnotations(this.preview, unit))),
        ...(this.arrayTool?.annotations ?? []),
      ],
      showGlyphs: this.showGlyphs,
      showPoints: this.showPoints,
      regions,
      snapMark: this.tool ? this.pointer.snapMark : null,
      guides: this.tool ? this.pointer.guides : [],
      cutMarks: this.kind === "break" ? this.pointer.cutMarks : [],
      resolution: [this.viewport.renderer.domElement.clientWidth, this.viewport.renderer.domElement.clientHeight],
      hoverRegion: this.pointer.hoverRegion,
      texts: (this.geometry.texts ?? []).map((t) => ({ outlines: textOutlines(t), hovered: this.pointer.hover === `text:${t.id}` })),
    });
  }
}
