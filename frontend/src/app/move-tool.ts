/**
 * "Déplacer" in the 3D model: moves a body (a new "move" operation, the real
 * solid translated by the kernel) or a whole sketch (its plane offset and
 * points). The displacement is set by dragging the XYZ manipulator (arrows
 * along an axis, squares inside a plane) or typed: relative, along one axis,
 * or as the absolute position of the centre. The frame is the global one or a
 * local one (the planar face picked, or the sketch's own axes). The result is
 * computed live by the kernel and shown as the real part, never as a display
 * shift; the document only changes on OK, as one undo step.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import * as THREE from "three";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { Feature, MoveFeature, SketchFeature, Vec3 } from "../document/types";
import { featureOfBody } from "../document/types";
import { MIN_LENGTH } from "../features/common";
import { GLOBAL_FRAME, faceFrame, toGlobal, toLocal, type MoveFrame } from "../features/move";
import { frameOf, toWorld } from "../sketcher/frame";
import { moveSketchPlane, sketchSnapPoints } from "../sketcher/move";
import { dragStep, roundTo } from "../viewport/axis-drag";
import { bodyVertices } from "../viewport/body-points";
import { faceSnaps, ontoPlane, type FaceSnaps } from "../viewport/face-snaps";
import { SnapDots } from "../viewport/snap-squares";
import { AXIS_NAMES, MoveGizmo, type GizmoHandle } from "../viewport/move-gizmo";
import { alignBox, type Box, type Guide } from "../features/smart-align";
import { SnapGuides } from "../viewport/snap-guides";
import { bodySnap, facePoint, otherBoxes } from "./body-snap";
import { pointText } from "./model-selection";
import { PanelTool, type ToolContext } from "./panel-tool";

/** What is moved: a body of the model, or a sketch. */

/** The point under the pointer, the pivot and the target (the dots of Déplacer). */
const HOVER_COLOR = 0xf8500a;
const PIVOT_COLOR = 0xe11d48;
const TARGET_COLOR = 0x16a34a;
export const COPIES: [string, string][] = [["0", "Non : déplacer"], ...Array.from({ length: 10 }, (_, i): [string, string] => [String(i + 1), `${i + 1} copie${i ? "s" : ""} (l'original reste)`])];

export type MoveSubject = { kind: "body"; id: string } | { kind: "sketch"; id: string };

type InputMode = "relative" | "distance" | "absolute" | "points";
type FrameMode = "global" | "local";

export interface MoveToolOptions {
  /** Point to move from (a corner of the moved body) and, if already picked, the point to reach (a corner of another body). */
  points?: { source: Vec3; target?: Vec3 };
  /** Normal of a planar face picked in the view: it defines the local frame of a body. */
  faceNormal?: Vec3;
  /** Switches to the push/pull of the picked face (moving the face, not the body). */
  moveFace?: () => void;
}

/** A body with more corners than this (a rounded one) shows only the corners of the face pointed at. */
const MAX_BODY_CORNERS = 40;

export class MoveTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private subject: MoveSubject;
  private translate: Vec3 = [0, 0, 0];
  private inputMode: InputMode = "relative";
  private frameMode: FrameMode = "global";
  private axis: 0 | 1 | 2 = 0;
  private readonly localFrame: MoveFrame | null;
  /** Centre of what is moved, before the move: the manipulator sits at centre + translation. */
  private center: Vec3 = [0, 0, 0];
  private readonly gizmo: MoveGizmo;
  private dragFrom: Vec3 = [0, 0, 0];
  private readonly sketch: SketchFeature | null;
  /** Pivot (the point moved from, where the manipulator sits) and the target, in model coordinates before the move. */
  private source: Vec3 | null = null;
  private reach: Vec3 | null = null;
  /** The target is a face: the body is brought onto its plane (along its normal). */
  private reachFace = false;
  private reachNormal: Vec3 | null = null;
  private pickStep: "source" | "reach" = "source";
  /** The pivot (rose) and the target (green), as small dots. */
  private readonly markers = new SnapDots(this.ctx.viewport.scene, 9);
  /** Snap points of the face under the pointer, and the one under the pointer (Fusion's point picking). */
  private hover: {
    points: Vec3[];
    /** What each point belongs to: a body id, or "sketch:<id>". */
    owners: string[];
    /** Index of the point under the pointer, -1 when none. */
    index: number;
    /** The body face under the pointer, if it can be a target (its plane). */
    face: FaceSnaps | null;
  } | null = null;
  /** The point a click would pick, under the pointer: a small orange dot (the others are not shown). */
  private readonly squares = new SnapDots(this.ctx.viewport.scene);
  /** The smart snapping: the box of the body before the move, and the pink guides of its alignments. */
  private box: Box | null = null;
  private readonly guides = new SnapGuides(this.ctx.viewport.scene);
  /** Copies made instead of moving (as Curic Gizmo's copy): the original stays, copy k is moved k times. */
  private copies = 0;
  private readonly copy: { id: string; name: string };

  constructor(ctx: ToolContext, editing: Feature | null, subject: MoveSubject, private readonly options: MoveToolOptions = {}) {
    super(ctx, subject.kind === "body" ? "Déplacer le corps" : "Déplacer l'esquisse", editing);
    const doc = ctx.doc();
    this.subject = subject;
    const sketch = subject.kind === "sketch" ? findFeature(doc, subject.id) : undefined;
    this.sketch = sketch?.type === "sketch" ? sketch : null;
    if (editing?.type === "move") {
      this.id = editing.id;
      this.name = editing.name;
      this.translate = [...editing.translate];
    } else {
      this.id = this.sketch ? this.sketch.id : uniqueId(doc, "mv");
      this.name = this.sketch ? this.sketch.name : uniqueName(doc, "Déplacement");
    }
    this.copy = { id: uniqueId(doc, "ar"), name: uniqueName(doc, "Copie") };
    if (this.sketch) {
      const f = frameOf(this.sketch);
      this.localFrame = { x: f.u, y: f.v, z: f.normal };
    } else this.localFrame = options.faceNormal ? faceFrame(options.faceNormal) : null;
    this.gizmo = new MoveGizmo(ctx.viewport, { rotate: true });
    this.measure();
    // A new body move starts like Fusion's: hover a face to see its points, click one to put the manipulator there.
    if (!editing || this.sketch) this.inputMode = "points";
    if (options.points && !this.sketch) {
      this.inputMode = "points";
      this.source = options.points.source;
      this.reach = options.points.target ?? null;
      this.pickStep = "reach";
      this.translate = this.reach ? ([0, 1, 2].map((i) => (this.reach as Vec3)[i]! - (this.source as Vec3)[i]!) as Vec3) : [0, 0, 0];
    }
  }

  /** Opens the tool: shows the panel and the manipulator. */
  open(): void {
    this.start();
    this.sync();
  }

  // ---- geometry of the tool ---------------------------------------------------------

  /** Centre of the moved thing, while it is still displayed in its own place (the preview replaces it). */
  private measure(): void {
    if (this.sketch) {
      const frame = frameOf(this.sketch);
      const xs = this.sketch.points.map((p) => p.x);
      const ys = this.sketch.points.map((p) => p.y);
      const c: [number, number] = xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
      this.center = toWorld(frame, c[0], c[1]);
      return;
    }
    // An existing move shows its result under its own id: take that and take the move back.
    const own = this.editing?.type === "move" ? this.ctx.viewport.bodyMesh(this.editing.id) : undefined;
    const mesh = own ?? this.ctx.viewport.bodyMesh(this.subject.id);
    const bbox = mesh?.metrics.bbox;
    if (!bbox) return;
    const shift = own ? this.translate : [0, 0, 0];
    this.box = bbox.map((corner) => corner.map((v, i) => v - shift[i]!)) as Box;
    this.center = [0, 1, 2].map((i) => ((bbox[0][i] as number) + (bbox[1][i] as number)) / 2 - (shift[i] as number)) as Vec3;
  }

  private frame(): MoveFrame {
    return this.frameMode === "local" && this.localFrame ? this.localFrame : GLOBAL_FRAME;
  }

  /** Marks the point moved from (rose, where it is now) and the point to reach (green). */
  private placeMarkers(): void {
    this.markers.clear();
    if (this.inputMode !== "points") return;
    const points: Vec3[] = [];
    const colors: number[] = [];
    if (this.source) {
      points.push([0, 1, 2].map((i) => (this.source as Vec3)[i]! + this.translate[i]!) as Vec3);
      colors.push(PIVOT_COLOR);
    }
    if (this.reach) {
      points.push(this.reach);
      colors.push(TARGET_COLOR);
    }
    this.markers.show(points, colors);
  }

  /** The manipulator sits on the pivot (or the centre), moved with the body; while a pivot is being chosen it follows the point under the pointer. */
  private placeGizmo(): void {
    this.placeMarkers();
    const hovered = this.pickStep === "source" && this.hover && this.hover.index >= 0 ? this.hover.points[this.hover.index] : undefined;
    const base = hovered ?? this.source ?? this.center;
    const shift = hovered ? [0, 0, 0] : this.translate;
    this.gizmo.place([0, 1, 2].map((i) => (base[i] as number) + (shift[i] as number)) as Vec3, this.frame());
    // The curved arrows turn around the axes of the global frame (the Rotation tool's axes).
    this.gizmo.showRotation(this.frameMode === "global");
  }

  /** Only the point that will be picked, under the pointer: a small orange dot. */
  private placeSnaps(): void {
    const point = this.hover && this.hover.index >= 0 ? this.hover.points[this.hover.index] : undefined;
    if (!point) return this.squares.clear();
    this.squares.show([point], [HOVER_COLOR]);
  }

  /** Redraws the panel and the manipulator, and asks for a new preview. */
  private sync(): void {
    this.render();
    this.placeGizmo();
    this.schedulePreview();
  }

  private setTranslate(v: Vec3): void {
    this.translate = v.map((x) => (Math.abs(x) < 1e-9 ? 0 : x)) as Vec3;
    this.sync();
  }

  // ---- feature ---------------------------------------------------------------------

  protected feature(): Feature | string {
    const length = Math.hypot(...this.translate);
    if (length < MIN_LENGTH) return "Tirez le manipulateur ou saisissez un déplacement.";
    if (this.sketch) return moveSketchPlane(this.sketch, this.translate);
    const translate = this.translate.map((x) => Number(x.toFixed(6))) as Vec3;
    if (this.copies > 0 && !this.editing) return { ...this.copy, type: "array", targets: [this.subject.id], step: translate, count: this.copies };
    return { id: this.id, type: "move", name: this.name, target: this.subject.id, translate } satisfies MoveFeature;
  }

  /** The result cannot be validated while the kernel refuses it. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.copies > 0 ? this.copy.id : this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le déplacement est invalide.") : null;
  }

  override confirm(): void {
    const reason = this.blocker();
    if (reason) {
      this.ctx.notify(reason, "error");
      return;
    }
    super.confirm();
  }

  protected override heading(): string {
    return this.sketch ? `Déplacer : ${this.sketch.name}` : this.editing ? `Modifier : ${this.editing.name}` : "Déplacer le corps";
  }

  // ---- panel -----------------------------------------------------------------------

  protected rows(): (HTMLElement | null)[] {
    const frame = this.frame();
    const local = toLocal(frame, this.translate);
    const unit = this.ctx.unit();
    const bodies = this.ctx.bodies().filter((b) => featureOfBody(b.id) !== this.id);
    if (this.subject.kind === "body" && !bodies.some((b) => b.id === this.subject.id)) bodies.push({ id: this.subject.id, name: bodyLabel(this.ctx.doc(), this.subject.id) });
    const names = this.frameMode === "local" && this.localFrame ? (this.sketch ? ["u", "v", "n"] : ["x", "y", "z"]) : ["X", "Y", "Z"];
    const fields: (HTMLElement | null)[] = [];
    if (this.inputMode === "relative") {
      for (const i of [0, 1, 2] as const) {
        fields.push(this.numberRow(`Δ${names[i]}`, local[i], unit, (v) => this.setTranslate(toGlobal(frame, local.map((x, k) => (k === i ? v : x)) as Vec3)), true));
      }
    } else if (this.inputMode === "distance") {
      fields.push(
        this.selectRow("Axe", String(this.axis), [0, 1, 2].map((i): [string, string] => [String(i), `${names[i]}${this.frameMode === "local" ? " (local)" : ""}`]), (v) => {
          this.axis = Number(v) as 0 | 1 | 2;
          this.sync();
        }),
        this.numberRow(
          "Distance",
          local[this.axis],
          unit,
          (v) => {
            const along: Vec3 = [0, 0, 0];
            along[this.axis] = v;
            this.setTranslate(toGlobal(frame, along));
          },
          true,
        ),
      );
    } else if (this.inputMode === "points") {
      fields.push(
        this.info(
          this.source
            ? `Pivot : ${pointText(this.source, unit)}`
            : this.sketch
              ? "Pivot : cliquez un point de l'esquisse (extrémité, centre ou milieu d'une ligne) où placer les flèches."
              : "Pivot : survolez une face du corps, ses coins et son centre apparaissent ; cliquez le point où placer les flèches.",
        ),
        this.source ? this.linkButton("Changer le pivot", () => ((this.pickStep = "source"), (this.hover = null), this.sync())) : null,
        this.source && !this.reach
          ? this.info(
              `Cible : cliquez un point (coin ou milieu) d'une face ${this.sketch ? "d'un corps" : "d'un autre corps"} ou un point d'une autre esquisse, ou l'intérieur d'une face plane pour amener ${this.sketch ? "l'esquisse" : "le corps"} sur son plan — ou tirez les flèches.`,
            )
          : null,
        this.reach ? this.info(this.reachFace ? `Cible : plan de la face passant par ${pointText(this.reach, unit)}` : `Cible : ${pointText(this.reach, unit)}`) : null,
        this.reach ? this.linkButton("Changer la cible", () => ((this.pickStep = "reach"), (this.hover = null), this.sync())) : null,
        ...[0, 1, 2].map((i) => this.numberRow(`Δ${names[i]}`, local[i] as number, unit, (v) => this.setTranslate(toGlobal(frame, local.map((x, k) => (k === i ? v : x)) as Vec3)), true)),
      );
    } else {
      const at = [0, 1, 2].map((i) => (this.center[i] as number) + (this.translate[i] as number)) as Vec3;
      for (const i of [0, 1, 2] as const) {
        fields.push(this.numberRow(AXIS_NAMES[i], at[i], unit, (v) => this.setTranslate(this.translate.map((x, k) => (k === i ? v - (this.center[i] as number) : x)) as Vec3), true));
      }
      fields.push(this.info(`Position du centre ${this.sketch ? "de l'esquisse" : "du corps"}, dans le repère global.`));
    }
    const frameOptions: [string, string][] = [["global", "Global"]];
    if (this.localFrame) frameOptions.push(["local", this.sketch ? "Local (axes de l'esquisse)" : "Local (face choisie)"]);
    return [
      this.info(this.sketch ? `Esquisse : ${this.sketch.name}` : `Corps : ${bodyLabel(this.ctx.doc(), this.subject.id)}`),
      this.options.moveFace && !this.sketch
        ? this.selectRow("Objet", "body", [["body", "Corps entier"], ["face", "Face seule (pousser/tirer)"]], (v) => v === "face" && this.options.moveFace?.())
        : null,
      this.subject.kind === "body" && !this.editing ? this.selectRow("Copier", String(this.copies), COPIES, (v) => ((this.copies = Number(v)), this.sync())) : null,
      this.subject.kind === "body" && !this.editing && bodies.length > 1
        ? this.selectRow("Corps", this.subject.id, bodies.map((b): [string, string] => [b.id, b.name]), (v) => {
            this.subject = { kind: "body", id: v };
            this.measure();
            this.sync();
          })
        : null,
      this.selectRow("Repère", this.frameMode, frameOptions, (v) => {
        this.frameMode = v as FrameMode;
        this.sync();
      }),
      this.localFrame ? null : this.info("Repère local : sélectionnez une face plane du corps avant « Déplacer »."),
      this.selectRow(
        "Saisie",
        this.inputMode,
        [
          ["points", "Pivot et cible (points, faces)"],
          ["relative", "Relatif (Δ)"],
          ["distance", "Distance sur un axe"],
          ["absolute", "Position absolue"],
        ],
        (v) => {
          this.inputMode = v as InputMode;
          this.pickStep = this.source ? "reach" : "source";
          this.sync();
        },
      ),
      ...fields,
      this.info(
        this.sketch
          ? "Flèche : le long d'un axe (le long de la normale, le plan de l'esquisse change de décalage ; dans le plan, son origine se déplace avec toute la géométrie et ses contraintes). Tuile : dans un plan. Point central : libre."
          : "Flèche : le long d'un axe. Tuile : dans un plan. Point central : libre, dans le plan de l'écran. Flèche courbe : tourner (outil Tourner). Le solide réel est déplacé.",
      ),
    ];
  }

  private linkButton(label: string, run: () => void): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-left text-sky-700 underline hover:text-sky-900 dark:text-sky-300";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  protected override dispose(): void {
    this.inputMode = "relative"; // no markers left behind
    this.placeMarkers();
    this.hover = null;
    this.placeSnaps();
    this.markers.clear();
    this.squares.clear();
    this.guides.clear();
    this.gizmo.dispose();
  }

  // ---- pointer -----------------------------------------------------------------------

  /** A point of a face under the pointer is picked by a click: it wins over the manipulator (which may sit on it). */
  private onSnap(): boolean {
    return this.inputMode === "points" && !!this.hover && this.hover.index >= 0;
  }

  override down(event: PointerEvent): boolean {
    if (!this.onSnap()) {
      // A curved arrow: the Rotation tool takes over, around that axis, on what is being moved.
      const handle = this.gizmo.handleAt(event);
      if (handle?.kind === "rotate" && this.ctx.turn) {
        this.ctx.turn(handle.axis, this.subject, event);
        return true;
      }
    }
    if (this.onSnap() || !this.gizmo.dragStart(event)) return false;
    this.dragFrom = [...this.translate];
    return true;
  }

  override move(event: PointerEvent): void {
    const delta = this.gizmo.dragMove(event);
    const handle = this.gizmo.dragging;
    if (delta && handle) {
      this.setTranslate(this.dragged(handle, delta));
      return;
    }
    if (this.inputMode === "points") this.hoverSnaps(event);
    const onGizmo = !this.onSnap() && this.gizmo.hovered(event) !== null;
    this.ctx.viewport.renderer.domElement.style.cursor = this.onSnap() ? THIN_CROSSHAIR : onGizmo ? "grab" : "";
  }

  /** Translation after a drag by `delta`, rounded to the zoom on the axes the handle really moves along. */
  private dragged(handle: GizmoHandle, delta: Vec3): Vec3 {
    const frame = this.frame();
    const step = dragStep(this.ctx.viewport.worldPerPixel());
    const start = toLocal(frame, this.dragFrom);
    const moved = toLocal(frame, [0, 1, 2].map((i) => (this.dragFrom[i] as number) + (delta[i] as number)) as Vec3);
    // The ball (free move in the screen's plane) changes all three coordinates.
    const along = handle.kind === "axis" ? [handle.axis] : handle.kind === "plane" ? [0, 1, 2].filter((i) => i !== handle.normal) : handle.kind === "free" ? [0, 1, 2] : [];
    const result = toGlobal(frame, start.map((s, i) => (along.includes(i) ? roundTo(moved[i] as number, step) : s)) as Vec3);
    // Smart snapping (global axes): a face or the middle of the body stops at the level of another body's.
    if (!bodySnap.smart || !this.box || frame !== GLOBAL_FRAME) return (this.guides.clear(), result);
    const own = (id: string) => (id === this.subject.id && this.copies === 0) || featureOfBody(id) === this.id || id.startsWith(`${this.copy.id}#`);
    const aligned = alignBox(this.box, otherBoxes(this.ctx.viewport, own), result, along, bodySnap.tolerance(this.ctx.viewport));
    this.guides.show(aligned.guides, this.ctx.viewport);
    return aligned.translate;
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.gizmo.dragEnd()) return (this.guides.clear(), true);
    if (isClick) this.click(event);
    return isClick;
  }

  /** Sketch points a click may pick now: the moved sketch's own for its pivot, those of the other sketches as targets. */
  private sketchCandidates(): { owner: string; point: Vec3 }[] {
    if (this.pickStep === "source" && !this.sketch) return [];
    const list: { owner: string; point: Vec3 }[] = [];
    for (const f of this.ctx.doc().features) {
      if (f.type !== "sketch" || f.suppressed || f.hidden) continue;
      const mine = f.id === this.sketch?.id;
      if (this.pickStep === "source" ? !mine : mine) continue;
      for (const point of sketchSnapPoints(mine && this.sketch ? this.sketch : f)) list.push({ owner: `sketch:${f.id}`, point });
    }
    return list;
  }

  /**
   * Points a click can pick under the pointer, as Fusion shows them: the corners and middle of the body face
   * under it (the moved body's for the pivot, another body's for the target), and sketch points (all those of
   * a moved sketch for its pivot, those near the pointer of the other sketches for the target).
   */
  private hoverSnaps(event: PointerEvent | null): void {
    const points: Vec3[] = [];
    const owners: string[] = [];
    let face: FaceSnaps | null = null;
    let guides: Guide[] = [];
    const pick = event ? this.ctx.viewport.pickFace(event) : null;
    const usable = (bodyId: string) => {
      const own = bodyId === this.subject.id || bodyId === this.id || bodyId.startsWith(`${this.copy.id}#`);
      return this.sketch ? this.pickStep === "reach" : this.pickStep === "source" ? !this.editing || own : !own;
    };
    // The corners and points are caught only with the geometry snapping.
    if (pick && bodySnap.geometry) {
      const mesh = usable(pick.bodyId) ? this.ctx.viewport.bodyMesh(pick.bodyId) : undefined;
      const snaps = mesh ? faceSnaps(mesh, pick.faceIndex) : null;
      if (snaps) {
        // The corners of the whole element (a thin board shows all of its corners, not only those of the face pointed at),
        // else those of the face; and the middle of the face.
        const corners = mesh && bodyVertices(mesh).length <= MAX_BODY_CORNERS ? bodyVertices(mesh) : snaps.corners;
        for (const p of [...corners, snaps.center]) {
          points.push(p);
          owners.push(pick.bodyId);
        }
        face = snaps;
      }
    }
    if (event && bodySnap.geometry) {
      const all = this.sketch !== null && this.pickStep === "source";
      for (const c of this.sketchCandidates()) {
        if (!all && this.ctx.viewport.screenDistance(event, c.point) > 40) continue;
        points.push(c.point);
        owners.push(c.owner);
      }
    }
    // No point caught: the point of the face, in line with a corner (smart snapping) — or anywhere, the geometry snapping off.
    if (event && !points.some((p) => this.ctx.viewport.screenDistance(event, p) < 16)) {
      const free = facePoint(this.ctx.viewport, event, { alignedOnly: bodySnap.geometry, anchors: this.source ? [this.source] : [], skip: (id) => !usable(id) });
      if (free) {
        points.push(free.point);
        owners.push(free.bodyId);
        guides = free.guides;
      }
    }
    this.guides.show(guides, this.ctx.viewport);
    if (!event || points.length === 0) {
      if (this.hover) {
        this.hover = null;
        this.placeSnaps();
        this.placeGizmo();
      }
      return;
    }
    let index = -1;
    let best = 16;
    points.forEach((p, i) => {
      const d = this.ctx.viewport.screenDistance(event, p);
      if (d < best) [best, index] = [d, i];
    });
    this.hover = { points, owners, index, face };
    this.placeSnaps();
    this.placeGizmo();
  }

  /**
   * Pivot then target, as in Fusion: a click on a point (a corner or the middle of a face, a sketch point)
   * puts the pivot there; then a point of another body or sketch is the target (the pivot comes onto it), or
   * the inside of a planar face (what is moved comes onto its plane, along its normal).
   */
  private pickPoint(event: PointerEvent): void {
    this.hoverSnaps(event);
    const hover = this.hover;
    if (!hover) return;
    const point = hover.index >= 0 ? hover.points[hover.index] : undefined;
    const owner = hover.index >= 0 ? hover.owners[hover.index] : undefined;
    if (this.pickStep === "source") {
      if (!point || !owner) {
        this.ctx.notify("Cliquez un des points affichés pour y placer les flèches.", "info");
        return;
      }
      if (!this.sketch && owner !== this.subject.id && owner !== this.id) {
        // A point of another body: that body is the one to move.
        this.subject = { kind: "body", id: owner };
        this.measure();
        this.translate = [0, 0, 0];
        this.reach = null;
      }
      // A point of the body's preview is shown moved: take it back to where it was.
      this.source = owner === this.id && !this.sketch ? ([0, 1, 2].map((k) => point[k]! - this.translate[k]!) as Vec3) : point;
      this.pickStep = "reach";
    } else if (point) {
      this.reach = point;
      this.reachFace = false;
    } else if (hover.face?.normal) {
      this.reach = hover.face.center;
      this.reachNormal = hover.face.normal;
      this.reachFace = true;
    } else {
      this.ctx.notify("Cliquez un point affiché, ou l'intérieur d'une face plane.", "info");
      return;
    }
    this.hover = null;
    this.placeSnaps();
    if (this.source && this.reach) {
      const d = this.reachFace && this.reachNormal ? ontoPlane(this.source, this.reach, this.reachNormal) : ([0, 1, 2].map((k) => this.reach![k]! - this.source![k]!) as Vec3);
      this.setTranslate(d);
    } else this.sync();
  }

  /** A click on another body takes it as the body to move. */
  protected override click(event: PointerEvent): void {
    if (this.inputMode === "points") {
      this.pickPoint(event);
      return;
    }
    if (this.subject.kind !== "body" || this.editing) return;
    const pick = this.ctx.viewport.pickFace(event);
    if (!pick || featureOfBody(pick.bodyId) === this.id || pick.bodyId === this.subject.id) return;
    this.subject = { kind: "body", id: pick.bodyId };
    this.measure();
    this.sync();
  }
}
