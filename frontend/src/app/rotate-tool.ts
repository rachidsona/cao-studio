/**
 * "Tourner" (as Curic Rotate): the chosen bodies and sketches turn around an
 * axis parallel to X, Y or Z, by quarter turns or a typed angle. The pivot is
 * the centre of what turns, or a corner of a body clicked in the view (green
 * dot). One rotation per body and each sketch turned in place (in its plane:
 * a sketch only turns around its normal), in one undo step. A click elsewhere
 * on a body or a sketch adds it, or removes it.
 *
 * The pivot carries the three curved arrows of the Move manipulator (Shapr3D style): dragging one turns around its
 * axis, by steps of 5° (hold Maj for free angles).
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { Axis, Feature, RotateFeature, SketchFeature, Vec3 } from "../document/types";
import type { Box } from "../features/curic";
import { rotateSketch, sketchBox } from "../sketcher/sketch-transform";
import { el } from "../ui/dom";
import { AXIS_OPTIONS, boxOfBodies, freshFeatureIds, PointMarker, unionBox } from "./curic-common";
import { MoveGizmo } from "../viewport/move-gizmo";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Last settings, kept for the next rotation of the session. */
let last = { axis: 2 as Axis, angle: 90 };

export class RotateTool extends PanelTool {
  private targets: string[];
  private sketches: string[];
  private axis: Axis;
  private angle: number;
  /** A corner clicked as pivot, or null for the centre of what turns. */
  private pivot: Vec3 | null;
  private slots: { id: string; name: string }[] = [];
  /** Boxes of the visible bodies when the tool opened (the preview replaces the bodies it turns). */
  private readonly bodyBoxes = new Map<string, Box>();
  private readonly marker: PointMarker;
  private readonly gizmo: MoveGizmo;
  /** The angle (degrees) when a curved arrow was taken. */
  private angleFrom = 0;

  constructor(ctx: ToolContext, editing: RotateFeature | null, selected: string[], sketches: string[] = [], axis?: Axis) {
    super(ctx, "Tourner", editing);
    for (const b of ctx.bodies()) {
      const box = boxOfBodies(ctx.viewport, [b.id]);
      if (box) this.bodyBoxes.set(b.id, box);
    }
    const lastBody = ctx.bodies().at(-1)?.id;
    this.targets = editing ? [editing.target] : selected.length || sketches.length ? [...selected] : lastBody ? [lastBody] : [];
    this.sketches = editing ? [] : [...sketches];
    this.axis = editing?.axis ?? axis ?? last.axis;
    // Taken by a curved arrow of the Move manipulator (axis given): the angle starts from nothing and follows the pointer.
    this.angle = editing?.angle ?? (axis !== undefined ? 0 : last.angle);
    this.pivot = editing?.center ?? null;
    if (editing) this.slots = [{ id: editing.id, name: editing.name }];
    this.marker = new PointMarker(ctx.viewport);
    this.gizmo = new MoveGizmo(ctx.viewport, { translate: false, rotate: true });
  }

  private sketch(id: string): SketchFeature | null {
    const f = findFeature(this.ctx.doc(), id);
    return f?.type === "sketch" ? f : null;
  }

  /** The pivot: the corner chosen, else the centre of what turns. */
  private center(): Vec3 {
    if (this.pivot) return this.pivot;
    const box = unionBox([...this.targets.map((id) => this.bodyBoxes.get(id) ?? null), ...this.sketches.map((id) => (this.sketch(id) ? sketchBox(this.sketch(id) as SketchFeature) : null))]);
    return box ? ([0, 1, 2].map((i) => Number((((box[0][i] as number) + (box[1][i] as number)) / 2).toFixed(4))) as Vec3) : [0, 0, 0];
  }

  private features(): Feature[] {
    const center = this.center();
    if (!this.editing && this.slots.length < this.targets.length) this.slots = freshFeatureIds(this.ctx.doc(), "ro", "Rotation", this.targets.length);
    const bodies = this.targets.map((target, i): RotateFeature => ({ ...(this.slots[i] as { id: string; name: string }), type: "rotate", target, axis: this.axis, angle: this.angle, center, ...(this.editing?.type === "rotate" && this.editing.dir ? { dir: this.editing.dir } : {}) }));
    const sketches = this.sketches.flatMap((id) => rotateSketch(this.sketch(id) as SketchFeature, this.axis, this.angle, center) ?? []);
    return [...bodies, ...sketches];
  }

  protected feature(): Feature | string {
    if (this.targets.length === 0 && this.sketches.length === 0) return "Cliquez les corps ou les esquisses à tourner.";
    if (Math.abs(this.angle) < 1e-6) return "Donnez un angle.";
    return this.features()[0] ?? "Ces esquisses ne tournent que dans leur plan : choisissez l'axe perpendiculaire à leur plan.";
  }

  protected override companions(): Feature[] {
    return this.editing ? [] : this.features().slice(1);
  }

  protected override blocker(): string | null {
    for (const f of this.features()) {
      const status = this.ctx.status(f.id);
      if (status && status.state !== "ok") return status.message ?? "La rotation est impossible.";
    }
    return null;
  }

  override confirm(): void {
    last = { axis: this.axis, angle: this.angle };
    super.confirm();
  }

  protected override render(): void {
    super.render();
    this.marker.show(this.center());
    this.gizmo.place(this.center(), { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  }

  override down(event: PointerEvent): boolean {
    if (!this.gizmo.dragStart(event)) return false;
    const handle = this.gizmo.dragging;
    if (handle?.kind === "rotate") {
      // Taking the arrow of the axis in use goes on from the angle given; another axis starts from nothing.
      this.angleFrom = handle.axis === this.axis ? this.angle : 0;
      this.axis = handle.axis;
    }
    return true;
  }

  override move(event: PointerEvent): void {
    const turned = this.gizmo.dragAngle(event);
    if (turned !== null) {
      // Steps of 5° unless Maj is held; one more turn each time the arrow goes past a half turn.
      const degrees = this.angleFrom + (turned * 180) / Math.PI;
      this.angle = Number((event.shiftKey ? degrees : Math.round(degrees / 5) * 5).toFixed(2));
      this.render();
      this.schedulePreview();
      return;
    }
    this.ctx.viewport.renderer.domElement.style.cursor = this.gizmo.hovered(event) ? "grab" : "";
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.gizmo.dragEnd()) return true;
    return super.up(event, isClick);
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const doc = this.ctx.doc();
    const names = [...this.targets.map((id) => bodyLabel(doc, id)), ...this.sketches.map((id) => this.sketch(id)?.name ?? id)];
    const skipped = this.sketches.filter((id) => this.sketch(id) && !rotateSketch(this.sketch(id) as SketchFeature, this.axis, 0.0001, [0, 0, 0])).length;
    const turn = (label: string, angle: number) => {
      const button = el("button", { type: "button", class: "h-7 flex-1 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, label);
      button.addEventListener("click", () => {
        this.angle = angle;
        changed();
      });
      return button;
    };
    return [
      this.info(names.length ? `Tournés (${names.length}) : ${names.join(", ")}` : "Rien de choisi."),
      this.selectRow("Axe", String(this.axis), AXIS_OPTIONS, (v) => {
        this.axis = Number(v) as Axis;
        changed();
      }),
      this.numberRow(
        "Angle",
        this.angle,
        "deg",
        (v) => {
          this.angle = v;
          changed();
        },
        true,
      ),
      el("div", { class: "flex gap-1" }, turn("−90°", -90), turn("+90°", 90), turn("180°", 180)),
      this.info(this.pivot ? "Pivot : le coin choisi (point vert)." : "Pivot : le centre de la sélection (point vert)."),
      skipped ? this.info(`${skipped} esquisse${skipped > 1 ? "s" : ""} ne tourne${skipped > 1 ? "nt" : ""} pas autour de cet axe (seulement dans son plan).`) : null,
      this.info("Cliquez un coin d'un corps pour pivoter autour de lui ; un corps ou une esquisse pour l'ajouter ou le retirer."),
    ];
  }

  protected override click(event: PointerEvent): void {
    // A corner near the pointer becomes the pivot (clicked again: back to the centre).
    const corner = this.ctx.viewport.bodyVertices().find((v) => this.ctx.viewport.screenDistance(event, v) <= 12);
    if (corner) {
      const same = this.pivot && Math.hypot(...corner.map((c, i) => c - (this.pivot as Vec3)[i]!)) < 1e-6;
      this.pivot = same ? null : corner;
    } else {
      const target = this.ctx.viewport.hoverTargetForTool(event);
      if (!target || this.editing) return;
      if (target.kind === "sketch") {
        const i = this.sketches.indexOf(target.id);
        if (i >= 0) this.sketches.splice(i, 1);
        else this.sketches.push(target.id);
      } else {
        // A body shown by the preview is the result of a rotation: it stands for the body it turns.
        const slot = this.slots.findIndex((s) => s.id === target.id);
        const id = slot >= 0 ? (this.targets[slot] ?? target.id) : target.id;
        const i = this.targets.indexOf(id);
        if (i >= 0) this.targets.splice(i, 1);
        else this.targets.push(id);
        this.slots = [];
      }
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.marker.hide();
    this.gizmo.dispose();
  }
}
