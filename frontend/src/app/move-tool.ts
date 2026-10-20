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
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { Feature, MoveFeature, SketchFeature, Vec3 } from "../document/types";
import { featureOfBody } from "../document/types";
import { MIN_LENGTH } from "../features/common";
import { GLOBAL_FRAME, faceFrame, toGlobal, toLocal, type MoveFrame } from "../features/move";
import { sketchFrame, toWorld } from "../sketcher/frame";
import { moveSketchPlane } from "../sketcher/move";
import { dragStep, roundTo } from "../viewport/axis-drag";
import { AXIS_NAMES, MoveGizmo, type GizmoHandle } from "../viewport/move-gizmo";
import { PanelTool, type ToolContext } from "./panel-tool";

/** What is moved: a body of the model, or a sketch. */
export type MoveSubject = { kind: "body"; id: string } | { kind: "sketch"; id: string };

type InputMode = "relative" | "distance" | "absolute";
type FrameMode = "global" | "local";

export interface MoveToolOptions {
  /** Normal of a planar face picked in the view: it defines the local frame of a body. */
  faceNormal?: Vec3;
  /** Switches to the push/pull of the picked face (moving the face, not the body). */
  moveFace?: () => void;
}

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
    if (this.sketch) {
      const f = sketchFrame(this.sketch.plane, this.sketch.offset);
      this.localFrame = { x: f.u, y: f.v, z: f.normal };
    } else this.localFrame = options.faceNormal ? faceFrame(options.faceNormal) : null;
    this.gizmo = new MoveGizmo(ctx.viewport);
    this.measure();
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
      const frame = sketchFrame(this.sketch.plane, this.sketch.offset);
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
    this.center = [0, 1, 2].map((i) => ((bbox[0][i] as number) + (bbox[1][i] as number)) / 2 - (shift[i] as number)) as Vec3;
  }

  private frame(): MoveFrame {
    return this.frameMode === "local" && this.localFrame ? this.localFrame : GLOBAL_FRAME;
  }

  private placeGizmo(): void {
    this.gizmo.place([0, 1, 2].map((i) => (this.center[i] as number) + (this.translate[i] as number)) as Vec3, this.frame());
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
    return { id: this.id, type: "move", name: this.name, target: this.subject.id, translate } satisfies MoveFeature;
  }

  /** The result cannot be validated while the kernel refuses it. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
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
      this.selectRow("Saisie", this.inputMode, [["relative", "Relatif (Δ)"], ["distance", "Distance sur un axe"], ["absolute", "Position absolue"]], (v) => {
        this.inputMode = v as InputMode;
        this.sync();
      }),
      ...fields,
      this.info(
        this.sketch
          ? "Le long de la normale : le plan de l'esquisse change de décalage. Dans le plan : tous ses points se déplacent."
          : "Flèche : déplacement le long d'un axe. Carré : déplacement dans un plan. Le solide réel est déplacé.",
      ),
    ];
  }

  protected override dispose(): void {
    this.gizmo.dispose();
  }

  // ---- pointer -----------------------------------------------------------------------

  override down(event: PointerEvent): boolean {
    if (!this.gizmo.dragStart(event)) return false;
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
    this.ctx.viewport.renderer.domElement.style.cursor = this.gizmo.hovered(event) ? "grab" : "";
  }

  /** Translation after a drag by `delta`, rounded to the zoom on the axes the handle really moves along. */
  private dragged(handle: GizmoHandle, delta: Vec3): Vec3 {
    const frame = this.frame();
    const step = dragStep(this.ctx.viewport.worldPerPixel());
    const start = toLocal(frame, this.dragFrom);
    const moved = toLocal(frame, [0, 1, 2].map((i) => (this.dragFrom[i] as number) + (delta[i] as number)) as Vec3);
    const along = handle.kind === "axis" ? [handle.axis] : [0, 1, 2].filter((i) => i !== handle.normal);
    const result = start.map((s, i) => (along.includes(i) ? roundTo(moved[i] as number, step) : s)) as Vec3;
    return toGlobal(frame, result);
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.gizmo.dragEnd()) return true;
    if (isClick) this.click(event);
    return isClick;
  }

  /** A click on another body takes it as the body to move. */
  protected override click(event: PointerEvent): void {
    if (this.subject.kind !== "body" || this.editing) return;
    const pick = this.ctx.viewport.pickFace(event);
    if (!pick || featureOfBody(pick.bodyId) === this.id || pick.bodyId === this.subject.id) return;
    this.subject = { kind: "body", id: pick.bodyId };
    this.measure();
    this.sync();
  }
}
