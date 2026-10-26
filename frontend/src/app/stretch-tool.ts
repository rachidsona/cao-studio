/**
 * "Étirer" (as Curic Stretch): a plane across the furniture, perpendicular to
 * X, Y or Z, and a distance. Bodies crossed by the plane get longer (or
 * shorter) by the distance, bodies beyond it move, bodies before it stay: a
 * cabinet 600 wide becomes 800 wide in one go. Sketches too: the points
 * beyond the plane move, the lines crossing it get longer (in place). What is
 * concerned: the bodies and sketches selected, or all the visible ones. A
 * click on a body places the plane where it was clicked. One stretch per
 * body, in one undo step.
 */
import { findFeature } from "../document/operations";
import { featureInputs, type Axis, type Feature, type SketchFeature, type StretchFeature, type Vec3 } from "../document/types";
import { stretchSide } from "../features/curic";
import { sketchBox, stretchSketch } from "../sketcher/sketch-transform";
import { AXIS_OPTIONS, boxOfBodies, freshFeatureIds, PlaneMarker, unionBox } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Last settings, kept for the next stretch of the session (mm). */
let last = { axis: 0 as Axis, distance: 100 };

export class StretchTool extends PanelTool {
  /** Bodies concerned (before the stretch), with their box. */
  private readonly bodies: { id: string; box: NonNullable<ReturnType<typeof boxOfBodies>> }[];
  private axis: Axis;
  private position: number;
  private distance: number;
  private slots: { id: string; name: string }[] = [];
  private readonly marker: PlaneMarker;
  /** Sketches concerned, as they are in the document. */
  private readonly sketches: SketchFeature[];

  constructor(ctx: ToolContext, editing: StretchFeature | null, selected: string[], sketches: string[] = []) {
    super(ctx, "Étirer", editing);
    const all = !editing && selected.length === 0 && sketches.length === 0;
    const ids = editing ? [editing.target] : all ? ctx.bodies().map((b) => b.id) : selected;
    const doc = ctx.doc();
    // Taking everything, a sketch read by an operation (an extrusion's profile) is left out: its body is
    // stretched already, stretching the sketch too would stretch it twice.
    const used = new Set(doc.features.flatMap((f) => (f.type === "sketch" ? [] : featureInputs(f))));
    this.sketches = editing ? [] : doc.features.filter((f): f is SketchFeature => f.type === "sketch" && (all ? !f.hidden && !f.suppressed && !used.has(f.id) : sketches.includes(f.id)));
    this.bodies = ids.flatMap((id) => {
      const box = boxOfBodies(ctx.viewport, [id]);
      return box ? [{ id, box }] : [];
    });
    this.axis = editing?.axis ?? last.axis;
    this.distance = editing?.distance ?? last.distance;
    this.position = editing?.position ?? this.middle();
    if (editing) this.slots = [{ id: editing.id, name: editing.name }];
    this.marker = new PlaneMarker(ctx.viewport);
  }

  /** Box around the bodies concerned, as they were before the stretch (the preview replaces them). */
  private box(): [Vec3, Vec3] | null {
    return unionBox([...this.bodies.map((b) => b.box), ...this.sketches.map(sketchBox)]);
  }

  /** The middle of the bodies along the axis: a first stretch that crosses them. */
  private middle(): number {
    const box = this.box();
    return box ? Number((((box[0][this.axis] as number) + (box[1][this.axis] as number)) / 2).toFixed(4)) : 0;
  }

  /** Bodies stretched (crossed by the plane) or moved (beyond it); those before it are left out. */
  private concerned(): { id: string; side: "across" | "beyond" }[] {
    return this.bodies.flatMap((b) => {
      const side = stretchSide(b.box, this.axis, this.position);
      return side === "before" ? [] : [{ id: b.id, side }];
    });
  }

  /** One stretch per body concerned, and each sketch concerned stretched in place. */
  private features(): Feature[] {
    const concerned = this.concerned();
    if (!this.editing && this.slots.length < concerned.length) this.slots = freshFeatureIds(this.ctx.doc(), "st", "Étirement", concerned.length);
    const bodies = concerned.map((c, i): StretchFeature => ({ ...(this.slots[i] as { id: string; name: string }), type: "stretch", target: c.id, axis: this.axis, position: this.position, distance: this.distance }));
    const sketches = this.sketches.flatMap((s) => stretchSketch(findFeature(this.ctx.doc(), s.id) as SketchFeature, this.axis, this.position, this.distance) ?? []);
    return [...bodies, ...sketches];
  }

  protected feature(): Feature | string {
    if (this.bodies.length === 0 && this.sketches.length === 0) return "Rien à étirer.";
    if (Math.abs(this.distance) < 1e-3) return "Donnez une distance d'étirement.";
    const list = this.features();
    return list[0] ?? "Le plan est après tout : placez-le à travers le meuble (cliquez un corps).";
  }

  protected override companions(): Feature[] {
    return this.editing ? [] : this.features().slice(1);
  }

  protected override blocker(): string | null {
    for (const f of this.features()) {
      const status = this.ctx.status(f.id);
      if (status && status.state !== "ok") return status.message ?? "L'étirement est impossible.";
    }
    return null;
  }

  override confirm(): void {
    last = { axis: this.axis, distance: this.distance };
    super.confirm();
  }

  protected override render(): void {
    super.render();
    this.marker.show(this.axis, this.position, this.box());
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.slots = this.editing ? this.slots : [];
      this.render();
      this.schedulePreview();
    };
    const unit = this.ctx.unit();
    const concerned = this.concerned();
    const across = concerned.filter((c) => c.side === "across").length;
    const sketches = this.features().filter((f) => f.type === "sketch").length;
    return [
      this.info(`${across} corps étiré${across > 1 ? "s" : ""}, ${concerned.length - across} déplacé${concerned.length - across > 1 ? "s" : ""} (sur ${this.bodies.length}) ; ${sketches} esquisse${sketches > 1 ? "s" : ""} sur ${this.sketches.length}.`),
      this.selectRow("Axe", String(this.axis), AXIS_OPTIONS, (v) => {
        this.axis = Number(v) as Axis;
        this.position = this.middle();
        changed();
      }),
      this.numberRow(
        "Plan à",
        this.position,
        unit,
        (v) => {
          this.position = v;
          changed();
        },
        true,
      ),
      this.numberRow(
        "Distance",
        this.distance,
        unit,
        (v) => {
          this.distance = v;
          changed();
        },
        true,
      ),
      this.info("Cliquez un corps pour y placer le plan (orange). Distance négative : raccourcir."),
    ];
  }

  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (!pick) return;
    // The point clicked is on the stretched bodies of the preview: back to where it was before the stretch.
    const p = pick.point.toArray()[this.axis] as number;
    const before = p > this.position && this.slots.some((s) => s.id === pick.bodyId) ? p - this.distance : p;
    this.position = Number(before.toFixed(4));
    this.slots = this.editing ? this.slots : [];
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.marker.hide();
  }
}
