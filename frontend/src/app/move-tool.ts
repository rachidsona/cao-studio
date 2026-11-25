/**
 * "Déplacer" in the 3D model: moves a body (a new "move" operation, the real
 * solid translated by the kernel), a whole sketch (its plane offset and
 * points) or a whole cabinet (its origin, its fronts following). The displacement is set by dragging the XYZ manipulator (arrows
 * along an axis, squares inside a plane) or typed: relative, along one axis,
 * or as the absolute position of the centre. The frame is the global one or a
 * local one (the planar face picked, or the sketch's own axes). The result is
 * computed live by the kernel and shown as the real part, never as a display
 * shift; the document only changes on OK, as one undo step. Ctrl keeps the
 * move horizontal, ⌘ vertical (pivot and target, the tile and the ball).
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import * as THREE from "three";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { CabinetFeature, CadDocument, Feature, MoveFeature, SketchFeature, Vec3 } from "../document/types";
import { shelfMovedBy } from "../document/niche-size";
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
import { keepInRoom, roomKeepOuts, wallBody } from "../document/cabinet-clear";
import { clearOf } from "../features/box-clear";
import { alignBox, type Box, type Guide } from "../features/smart-align";
import { SnapGuides } from "../viewport/snap-guides";
import { AXIS_LOCK_OPTIONS, AxisLock, lockMove, type AxisLockMode } from "./axis-lock";
import { bodySnap, facePoint, otherBoxes } from "./body-snap";
import { cabinetBodies } from "./cabinet-drag";
import { pointText } from "./model-selection";
import { wholeBodies, wholeOf } from "./move-whole";
import { PanelTool, type ToolContext } from "./panel-tool";
import { MoveKeys, type Typed } from "./move-keys";
import { followMove, movedBy } from "./move-follow";
import { measureRows, modeButtons, pivotButtons, type InputMode } from "./move-panel";
import { formatLength } from "../measurements/units";

/** What is moved: a body of the model, or a sketch. */

/** The point under the pointer, the pivot and the target (the dots of Déplacer). */
const HOVER_COLOR = 0xf8500a;
const PIVOT_COLOR = 0xe11d48;
const TARGET_COLOR = 0x16a34a;
export const COPIES: [string, string][] = [["0", "Non : déplacer"], ...Array.from({ length: 10 }, (_, i): [string, string] => [String(i + 1), `${i + 1} copie${i ? "s" : ""} (l'original reste)`])];

export type MoveSubject = { kind: "body" | "sketch" | "cabinet"; id: string };

type FrameMode = "global" | "local";

export interface MoveToolOptions {
  /** Point to move from (a corner of the moved body) and, if already picked, the point to reach (a corner of another body). */
  points?: { source: Vec3; target?: Vec3 };
  /** Normal of a planar face picked in the view: it defines the local frame of a body. */
  faceNormal?: Vec3;
  /** Switches to the push/pull of the picked face (moving the face, not the body). */
  moveFace?: () => void;
  /** Switches to the whole this body belongs to (wholeOf). */
  whole?: (bodyId: string) => void;
  /** The whole is being moved: switches back to the element selected. */
  element?: () => void;
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
  private readonly cabinet: CabinetFeature | null;
  /** The bodies of the cabinet moved (its fronts too). */
  private group = new Set<string>();
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
  /** The direction kept: horizontal (Ctrl), vertical (⌘). */
  private readonly lock = new AxisLock(this.ctx.viewport.renderer.domElement, () => this.relock());
  private readonly copy: { id: string; name: string };
  /** SketchUp's way: the pivot taken, what is moved follows the pointer until a click. */
  private following = false;
  /** The axis kept by the arrow keys (→ X, ← Y, ↑ Z), in the frame in use. */
  private axisLock: 0 | 1 | 2 | null = null;
  /** What is typed during the move (a distance, x5, /5), applied by Entrée. */
  private readonly keys: MoveKeys;

  constructor(ctx: ToolContext, editing: Feature | null, subject: MoveSubject, private readonly options: MoveToolOptions = {}) {
    super(ctx, subject.kind === "sketch" ? "Déplacer l'esquisse" : "Déplacer le corps", editing);
    const doc = ctx.doc();
    this.subject = subject;
    const sketch = subject.kind === "sketch" ? findFeature(doc, subject.id) : undefined;
    this.sketch = sketch?.type === "sketch" ? sketch : null;
    const cabinet = subject.kind === "cabinet" ? findFeature(doc, subject.id) : undefined;
    this.cabinet = cabinet?.type === "cabinet" ? cabinet : null;
    if (editing?.type === "move") {
      this.id = editing.id;
      this.name = editing.name;
      this.translate = [...editing.translate];
    } else {
      this.id = (this.sketch ?? this.cabinet)?.id ?? uniqueId(doc, "mv");
      this.name = (this.sketch ?? this.cabinet)?.name ?? uniqueName(doc, "Déplacement");
    }
    this.copy = { id: uniqueId(doc, "ar"), name: uniqueName(doc, "Copie") };
    if (this.sketch) {
      const f = frameOf(this.sketch);
      this.localFrame = { x: f.u, y: f.v, z: f.normal };
    } else this.localFrame = options.faceNormal ? faceFrame(options.faceNormal) : null;
    this.gizmo = new MoveGizmo(ctx.viewport, { rotate: true });
    this.keys = new MoveKeys({ typing: () => this.render(), apply: (t, text) => this.applyTyped(t, text), axis: (a) => this.lockAxis(a), toggleCopy: () => this.setCopies(this.copies ? 0 : 1, "Alt") }, () => this.ctx.unit());
    this.measure();
    // A new body move starts like Fusion's: hover a face to see its points, click one to put the manipulator there.
    // So does the whole of a cabinet or a Répartition: the manipulator goes on a point of it, not its middle.
    if (!editing || this.sketch || this.cabinet) this.inputMode = "points";
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
      // A whole Répartition: its panels' corners are points of it too; its box keeps it out of walls and neighbours.
      if (this.options.element) {
        this.group = new Set(wholeBodies(this.ctx.doc(), "sketch", this.sketch.id, this.ctx.viewport.displayedBodies));
        const all = new THREE.Box3();
        for (const id of this.group) for (const p of this.ctx.viewport.bodyMesh(id)?.metrics.bbox ?? []) all.expandByPoint(new THREE.Vector3(...p));
        this.box = all.isEmpty() ? null : ([all.min.toArray(), all.max.toArray()] as Box);
      }
      return;
    }
    if (this.cabinet) {
      this.group = new Set(cabinetBodies(this.ctx.doc(), this.ctx.viewport.displayedBodies, this.cabinet.id));
      const all = new THREE.Box3();
      for (const id of this.group) for (const p of this.ctx.viewport.bodyMesh(id)?.metrics.bbox ?? []) all.expandByPoint(new THREE.Vector3(...p));
      if (all.isEmpty()) return;
      this.box = [all.min.toArray(), all.max.toArray()] as Box;
      this.center = all.getCenter(new THREE.Vector3()).toArray() as Vec3;
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
    this.gizmo.showRotation(this.frameMode === "global" && !this.cabinet);
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
    const kept = this.clear(v);
    // A distance typed that would bring the cabinet into a wall or a neighbour: stopped flush, and said.
    if (kept.some((c, i) => Math.abs(c - v[i]!) > 0.5) && !this.following && !this.gizmo.dragging) this.ctx.notify(`${this.furniture ? "Le meuble" : "La pièce"} s'arrête au ras : plus loin, ${this.furniture ? "il" : "elle"} entrerait dans un mur${this.furniture ? " ou un meuble" : ""} (« Accrochage intelligent » éteint, ${this.furniture ? "il" : "elle"} va où on le dit).`, "info");
    this.translate = kept.map((x) => (Math.abs(x) < 1e-9 ? 0 : x)) as Vec3;
    this.sync();
  }

  // ---- feature ---------------------------------------------------------------------

  protected feature(): Feature | string {
    const length = Math.hypot(...this.translate);
    if (length < MIN_LENGTH) return "Tirez le manipulateur ou saisissez un déplacement.";
    if (this.sketch) return moveSketchPlane(this.sketch, this.translate);
    if (this.cabinet) return { ...this.cabinet, origin: this.cabinet.origin.map((v, i) => Number((v + this.translate[i]!).toFixed(3))) as Vec3 };
    const translate = this.translate.map((x) => Number(x.toFixed(6))) as Vec3;
    if (this.copies > 0 && !this.editing) return { ...this.copy, type: "array", targets: [this.subject.id], step: translate, count: this.copies };
    return { id: this.id, type: "move", name: this.name, target: this.subject.id, translate } satisfies MoveFeature;
  }

  /**
   * One shelf (or cloison) of a Répartition moved along its own axis: moved in its division instead of as a body, so
   * its niches change and what equips them (drawers, a rod) follows it.
   */
  protected override decorate(doc: CadDocument): CadDocument {
    if (this.subject.kind !== "body" || this.copies > 0 || this.editing) return doc;
    const moved = shelfMovedBy({ ...doc, features: doc.features.filter((f) => f.id !== this.id) }, this.subject.id, this.translate);
    return moved && typeof moved !== "string" ? moved : doc;
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
    return this.sketch || this.cabinet ? `Déplacer : ${(this.sketch ?? this.cabinet)!.name}` : this.editing ? `Modifier : ${this.editing.name}` : "Déplacer le corps";
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
              ? this.group.size
                ? "Pivot : cliquez un coin d'un de ses panneaux, ou un point de l'esquisse, où placer les flèches."
                : "Pivot : cliquez un point de l'esquisse (extrémité, centre ou milieu d'une ligne) où placer les flèches."
              : "Pivot : survolez une face du corps, ses coins et son centre apparaissent ; cliquez le point où placer les flèches.",
        ),
        this.source ? this.linkButton("Changer le pivot", () => ((this.pickStep = "source"), (this.hover = null), (this.following = false), this.sync())) : null,
        this.pivotRow(),
        this.source && !this.reach
          ? this.info(
              `Cible : cliquez un point (coin ou milieu) d'une face ${this.sketch ? "d'un corps" : "d'un autre corps"} ou un point d'une autre esquisse, ou l'intérieur d'une face plane pour amener ${this.sketch ? "l'esquisse" : "le corps"} sur son plan — ou tirez les flèches.`,
            )
          : null,
        this.reach ? this.info(this.reachFace ? `Cible : plan de la face passant par ${pointText(this.reach, unit)}` : `Cible : ${pointText(this.reach, unit)}`) : null,
        this.reach ? this.linkButton("Changer la cible", () => ((this.pickStep = "reach"), (this.hover = null), (this.following = true), this.sync())) : null,
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
    const whole = this.subject.kind === "body" && !this.editing && this.options.whole ? wholeOf(this.ctx.doc(), this.subject.id, this.ctx.viewport.displayedBodies) : null;
    const choices: [string, string][] = [["element", "L'élément sélectionné"], ...(whole || this.options.element ? ([["whole", "Le corps entier"]] as [string, string][]) : []), ...(this.options.moveFace ? ([["face", "La face seule (pousser/tirer)"]] as [string, string][]) : [])];
    return [
      this.info(this.sketch ? `Esquisse : ${this.sketch.name}` : this.cabinet ? `Meuble : ${this.cabinet.name}` : `Corps : ${bodyLabel(this.ctx.doc(), this.subject.id)}`),
      choices.length > 1
        ? this.selectRow("Déplacer", this.options.element ? "whole" : "element", choices, (v) => {
            if (v === "face") this.options.moveFace?.();
            if (v === "whole" && whole) this.options.whole?.(this.subject.id);
            if (v === "element") this.options.element?.();
          })
        : null,
      whole ? this.info(`Le corps entier : ${whole.name}, ${whole.bodies.length} pièces.`) : null,
      this.subject.kind === "body" && !this.editing ? this.selectRow("Copier", String(this.copies), COPIES, (v) => ((this.copies = Number(v)), this.sync())) : null,
      this.subject.kind === "body" && !this.editing && bodies.length > 1
        ? this.selectRow("Corps", this.subject.id, bodies.map((b): [string, string] => [b.id, b.name]), (v) => {
            this.subject = { kind: "body", id: v };
            this.measure();
            this.sync();
          })
        : null,
      this.selectRow("Direction", this.lock.mode, AXIS_LOCK_OPTIONS, (v) => ((this.lock.mode = v as AxisLockMode), this.relock())),
      this.selectRow("Repère", this.frameMode, frameOptions, (v) => {
        this.frameMode = v as FrameMode;
        this.sync();
      }),
      this.localFrame ? null : this.info("Repère local : sélectionnez une face plane du corps avant « Déplacer »."),
      this.modeRow(),
      ...fields,
      ...this.keysRows(),
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
    this.lock.dispose();
    this.keys.dispose();
  }

  /** The move from the pivot to the target (onto the plane of a face), in the direction kept. */
  private reachMove(): Vec3 | null {
    if (!this.source || !this.reach) return null;
    const d = this.reachFace && this.reachNormal ? ontoPlane(this.source, this.reach, this.reachNormal) : ([0, 1, 2].map((k) => this.reach![k]! - this.source![k]!) as Vec3);
    return lockMove(d, this.lock.mode);
  }

  /** The direction changed: the target is reached again along it. */
  private relock(): void {
    const d = this.reachMove();
    if (d) this.setTranslate(this.level(d, this.lock.mode, this.reachFace));
    else this.render();
  }

  // ---- SketchUp, 3ds Max ------------------------------------------------------------

  /** The axis locked, as a unit vector of the frame in use. */
  private axisDir(): Vec3 | null {
    if (this.axisLock === null) return null;
    const f = this.frame();
    return [f.x, f.y, f.z][this.axisLock] as Vec3;
  }

  /** What is moved comes under the pointer (its pivot on the point caught), kept on the locked axis. */
  private follow(event: PointerEvent): void {
    if (!this.source || this.pickStep !== "reach" || this.gizmo.dragging) return;
    const hover = this.hover;
    const snap = hover && hover.index >= 0 ? (hover.points[hover.index] ?? null) : null;
    const face = snap ? null : (this.ctx.viewport.pickFace(event, (id) => id === this.subject.id || this.group.has(id) || featureOfBody(id) === this.id || id.startsWith(`${this.copy.id}#`))?.point.toArray() as Vec3 | undefined) ?? null;
    const d = followMove({ source: this.source, ray: this.ctx.viewport.rayFromEvent(event), axis: this.axisDir(), snap, face, step: dragStep(this.ctx.viewport.worldPerPixel()) });
    if (d) this.setTranslate(this.level(lockMove(d, this.lock.of(event)), this.lock.of(event), !snap));
    this.showAxis();
  }

  /** The line of the locked axis through the pivot, as SketchUp draws it. */
  private showAxis(): void {
    const axis = this.axisDir();
    if (!axis) return;
    const from = this.source ?? this.center;
    const reach = 1e5;
    this.guides.show([[from.map((c, i) => c - axis[i]! * reach) as Vec3, from.map((c, i) => c + axis[i]! * reach) as Vec3]], this.ctx.viewport);
  }

  /** An arrow key: that axis kept (the same again, or ↓, frees it); what is shown goes back onto it. */
  private lockAxis(axis: 0 | 1 | 2 | null): void {
    this.axisLock = axis === this.axisLock ? null : axis;
    const dir = this.axisDir();
    if (!dir) {
      this.guides.clear();
      return this.render();
    }
    const along = this.translate[0] * dir[0] + this.translate[1] * dir[1] + this.translate[2] * dir[2];
    this.showAxis();
    this.setTranslate(dir.map((c) => c * along) as Vec3);
  }

  /** Copies made instead of moving (Alt, Maj + drag, x5): for a body only. */
  private setCopies(count: number, how: string): void {
    if (this.subject.kind !== "body" || this.editing) return this.ctx.notify("Les copies se font sur un corps, à sa création (pas sur un meuble entier ni une esquisse).", "info");
    this.copies = Math.max(0, Math.min(100, count));
    this.ctx.notify(this.copies ? `${how} : ${this.copies} copie${this.copies > 1 ? "s" : ""}, l'original reste.` : `${how} : plus de copie, le corps est déplacé.`, "info");
    this.sync();
  }

  /** Entrée after typing: a distance along the direction shown (or the axis), a vector, x5 or /5. */
  private applyTyped(typed: Typed | null, text: string): void {
    if (!typed) return (this.ctx.notify(`« ${text} » : tapez une distance (250), un vecteur (10;20;0), x5 ou /5.`, "error"), this.render());
    if (typed.kind === "copies") return this.setCopies(typed.count, `« ${text} »`);
    if (typed.kind === "divide") {
      const step = this.translate.map((c) => c / typed.count) as Vec3;
      this.translate = step;
      return this.setCopies(typed.count, `« ${text} »`);
    }
    const d = typed.kind === "vector" ? typed.value : movedBy(typed.value, this.translate, this.axisDir());
    if (!d) return (this.ctx.notify("Donnez d'abord une direction : bougez la souris, tirez une flèche ou bloquez un axe (→ X, ← Y, ↑ Z).", "info"), this.render());
    this.following = false;
    if (this.source) this.reach = [0, 1, 2].map((k) => this.source![k]! + d[k]!) as Vec3;
    this.reachFace = false;
    this.setTranslate(d);
  }

  /** As Fusion's « Set pivot » and 3ds Max's pivot: the pivot at the centre, the middle of the bottom, or a corner. */
  private pivotRow(): HTMLElement | null {
    if (this.inputMode !== "points" || !this.box) return null;
    return pivotButtons(this.box, (p) => {
      this.source = p;
      this.pickStep = "reach";
      this.reach = null;
      this.following = true;
      this.setTranslate([0, 0, 0]);
    });
  }

  private modeRow(): HTMLElement {
    return modeButtons(this.inputMode, (mode) => {
      this.inputMode = mode;
      this.pickStep = this.source ? "reach" : "source";
      this.following = false;
      this.sync();
    }, this.ctx.switchTo && (() => this.ctx.switchTo?.("faceGlue")));
  }

  private keysRows(): HTMLElement[] {
    return measureRows({ typed: this.keys.text, length: formatLength(Math.hypot(...this.translate), this.ctx.unit()), axis: this.axisLock, copies: this.copies });
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
      if (handle?.kind === "rotate" && this.ctx.turn && this.subject.kind !== "cabinet") {
        this.ctx.turn(handle.axis, this.subject as { kind: "body" | "sketch"; id: string }, event);
        return true;
      }
    }
    if (this.onSnap() || !this.gizmo.dragStart(event)) return false;
    this.dragFrom = [...this.translate];
    this.following = false;
    // As in 3ds Max: Maj + drag makes a copy, the original staying.
    if (event.shiftKey && this.copies === 0) this.setCopies(1, "Maj + glisser");
    return true;
  }

  override move(event: PointerEvent): void {
    const delta = this.gizmo.dragMove(event);
    const handle = this.gizmo.dragging;
    if (delta && handle) {
      // The tile and the ball keep the direction (Ctrl, ⌘); an arrow has its own.
      this.setTranslate(this.dragged(handle, handle.kind === "axis" ? delta : lockMove(delta, this.lock.of(event))));
      return;
    }
    if (this.inputMode === "points") this.hoverSnaps(event);
    if (this.following) this.follow(event);
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
    const aligned = alignBox(this.box, otherBoxes(this.ctx.viewport, this.own), result, along, bodySnap.tolerance(this.ctx.viewport));
    const clear = this.clear(aligned.translate, along);
    this.guides.show(clear === aligned.translate ? aligned.guides : [], this.ctx.viewport);
    return clear;
  }

  /** What is moved, its preview and its copies: not in its own way. */
  private readonly own = (id: string): boolean => (id === this.subject.id && this.copies === 0) || this.group.has(id) || featureOfBody(id) === this.id || id.startsWith(`${this.copy.id}#`);

  /** A piece of furniture moved whole: a cabinet, or a whole Répartition (a dressing, a bookcase). */
  private get furniture(): boolean {
    return this.cabinet !== null || (this.sketch !== null && !!this.options.element);
  }

  /**
   * What is moved (an arrow dragged, the pointer followed, a point clicked, a distance typed) never goes into a wall of
   * the room nor through one — square or out of square: it stops flush, in the room. A piece of furniture moved whole
   * does not go into the other bodies either (a neighbour, a column): beside it, flush. A single part may still go
   * into another body (to cut it, to fit it). No place clear on its way: where it is (features/box-clear.ts,
   * document/cabinet-clear.ts). The smart snapping off: as asked.
   */
  private clear(move: Vec3, axes: readonly number[] = [0, 1, 2]): Vec3 {
    if (!this.box || !bodySnap.smart || (this.sketch && !this.options.element)) return move;
    const doc = this.ctx.doc();
    const wall = wallBody(doc);
    const obstacles = this.furniture ? [...otherBoxes(this.ctx.viewport, (id) => this.own(id) || wall(id)), ...roomKeepOuts(doc)] : roomKeepOuts(doc);
    return keepInRoom(doc, this.box, clearOf(this.box, obstacles, move, axes) ?? this.translate);
  }

  /** Furniture brought onto a face (no point caught), the direction free: it keeps its height — it slides on the floor, it does not climb the wall pointed at. */
  private level(d: Vec3, mode: AxisLockMode, onFace: boolean): Vec3 {
    return this.furniture && onFace && mode === "free" && this.axisLock === null ? [d[0], d[1], 0] : d;
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
    const usable = (bodyId: string) => {
      const own = bodyId === this.subject.id || this.group.has(bodyId) || bodyId === this.id || bodyId.startsWith(`${this.copy.id}#`);
      // A sketch's pivot is one of its points, or a corner of the panels it makes (a whole Répartition).
      if (this.sketch) return this.pickStep === "reach" ? !this.group.has(bodyId) : this.group.has(bodyId);
      return this.pickStep === "source" ? !this.editing || own : !own;
    };
    // The target is looked for through what is moved (it follows the pointer, it would hide it).
    const pick = event ? this.ctx.viewport.pickFace(event, this.pickStep === "reach" ? (id) => !usable(id) : undefined) : null;
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
      if (!this.sketch && owner !== this.subject.id && owner !== this.id && !this.group.has(owner)) {
        // A point of another body: that body is the one to move.
        this.subject = { kind: "body", id: owner };
        this.measure();
        this.translate = [0, 0, 0];
        this.reach = null;
      }
      // A point of the body's preview is shown moved: take it back to where it was.
      this.source = this.group.has(owner) || (owner === this.id && !this.sketch) ? ([0, 1, 2].map((k) => point[k]! - this.translate[k]!) as Vec3) : point;
      this.pickStep = "reach";
      this.following = true;
    } else if (point) {
      this.lock.take(event);
      this.reach = point;
      this.reachFace = false;
    } else if (hover.face?.normal) {
      this.lock.take(event);
      this.reach = hover.face.center;
      this.reachNormal = hover.face.normal;
      this.reachFace = true;
    } else if (this.following && this.source) {
      // Nothing caught: put down where it followed the pointer.
      this.following = false;
      this.reach = [0, 1, 2].map((k) => this.source![k]! + this.translate[k]!) as Vec3;
      this.reachFace = false;
      this.hover = null;
      this.placeSnaps();
      return this.sync();
    } else {
      this.ctx.notify("Cliquez un point affiché, ou l'intérieur d'une face plane.", "info");
      return;
    }
    this.following = false;
    this.hover = null;
    this.placeSnaps();
    const d = this.reachMove();
    if (d) this.setTranslate(this.level(d, this.lock.mode, this.reachFace));
    else this.sync();
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
