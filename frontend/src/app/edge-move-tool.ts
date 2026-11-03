/**
 * « Déplacer ce trait » (panneau Sélection, une arête choisie ; comme déplacer une arête dans SketchUp) : le trait se
 * déplace et les faces du corps qui le bordent s'étirent pour le suivre — le bout d'une planche amené en biais contre
 * un côté, un dessus incliné. Les trois flèches X, Y, Z le tirent, les champs donnent le déplacement au millimètre, et
 * un clic sur un coin (ou un trait) d'un corps y amène le bout du trait le plus proche ; un clic sur une face plane
 * y colle le trait (chaque bout va sur la face, droit vers elle). Dans l'historique (un
 * modificateur « points », features/modifiers.ts) ; il se rouvre pour reprendre le déplacement.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import type { ModifierFeature, Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import { ArrowHandle } from "../viewport/arrow-handle";
import { POINT_AXES, type PointAxes } from "./align-points";
import { Marks } from "./measure";
import { PanelTool, type ToolContext } from "./panel-tool";
import { ReferencePicker, type Reference } from "./reference-measure";
import { ReferenceMarker } from "./reference-marker";

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export class EdgeMoveTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private readonly target: string | undefined;
  private readonly ends: [Vec3, Vec3] | null;
  private shift: Vec3;
  /** Stuck on a face: the plane each end goes to (along its normal), instead of one shift for both. */
  private onto: { point: Vec3; normal: Vec3 } | null = null;
  private axes: PointAxes = "xyz";
  private readonly arrows: ArrowHandle[];
  private drag: { axis: number; from: number } | null = null;
  private readonly marks = new Marks(this.ctx.viewport.scene);
  /** Corners and edges of the bodies as they were when the tool opened: a click takes one. */
  private readonly reference: ReferencePicker;
  /** Lights up the corner, edge or face a click would take. */
  private readonly marker: ReferenceMarker;

  constructor(ctx: ToolContext, editing: ModifierFeature | null, edge: { bodyId: string; ends: [Vec3, Vec3] } | null) {
    super(ctx, "Déplacer ce trait", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Trait déplacé");
    const moves = editing?.moves ?? [];
    this.target = editing?.target ?? edge?.bodyId;
    this.ends = editing && moves.length >= 2 ? [moves[0]!.from, moves[1]!.from] : (edge?.ends ?? null);
    this.shift = moves[0] ? ([0, 1, 2].map((i) => moves[0]!.to[i]! - moves[0]!.from[i]!) as Vec3) : [0, 0, 0];
    this.reference = new ReferencePicker(ctx.viewport);
    this.reference.capture();
    this.marker = new ReferenceMarker(ctx.viewport);
    this.arrows = AXES.map(() => new ArrowHandle(ctx.viewport, () => this.panel.querySelector<HTMLInputElement>("input")?.focus()));
  }

  /** The edge where it goes: shifted, or each end brought onto the face clicked. */
  private moved(): [Vec3, Vec3] | null {
    if (!this.ends) return null;
    const onto = this.onto;
    if (!onto) return [add(this.ends[0], this.shift), add(this.ends[1], this.shift)];
    const to = (e: Vec3): Vec3 => {
      const d = [0, 1, 2].reduce((sum, i) => sum + (onto.point[i]! - e[i]!) * onto.normal[i]!, 0);
      return [0, 1, 2].map((i) => e[i]! + onto.normal[i]! * d) as Vec3;
    };
    return [to(this.ends[0]), to(this.ends[1])];
  }

  /** The edge moved (orange), where it was (dashed), and the arrows on its middle. */
  private draw(): void {
    this.marks.clear();
    const moved = this.moved();
    if (!this.ends || !moved) return this.arrows.forEach((a) => (a.object.visible = false));
    this.marks.line(this.ends[0], this.ends[1], 0x9ca3af, true);
    this.marks.line(moved[0], moved[1], 0xf97316, false);
    for (const p of moved) this.marks.dot(p, 0xf97316);
    if (this.drag) return;
    const middle = moved[0].map((c, i) => (c + moved[1][i]!) / 2) as Vec3;
    this.arrows.forEach((arrow, a) => arrow.place(middle, AXES[a]!, 0, "XYZ"[a]!));
  }

  protected override render(): void {
    super.render();
    this.draw();
  }

  protected feature(): ModifierFeature | string {
    if (!this.target || !this.ends) return "Sélectionnez un trait (une arête) d'un corps, puis « Déplacer ce trait ».";
    const moved = this.moved()!;
    const far = (i: number) => Math.hypot(...[0, 1, 2].map((k) => moved[i]![k]! - this.ends![i]![k]!));
    if (far(0) < 1e-6 && far(1) < 1e-6) return this.onto ? "Le trait est déjà sur cette face." : "Tirez une flèche, tapez le déplacement, ou cliquez un coin ou une face où amener le trait.";
    const round = (v: Vec3) => v.map((c) => Number(c.toFixed(4))) as Vec3;
    return { id: this.id, type: "modifier", name: this.name, target: this.target, kind: "points", amount: 0, moves: this.ends.map((from, i) => ({ from: round(from), to: round(moved[i]!) })) };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le corps ne se déforme pas ainsi.") : null;
  }

  private setShift(shift: Vec3): void {
    this.onto = null;
    this.shift = shift.map((c, i) => (this.axes.includes("xyz"[i]!) ? Number(c.toFixed(4)) : 0)) as Vec3;
    this.render();
    this.schedulePreview();
  }

  override down(event: PointerEvent): boolean {
    const axis = this.arrows.findIndex((a) => a.dragStart(event));
    if (axis < 0) return false;
    this.drag = { axis, from: this.shift[axis]! };
    return true;
  }

  /** What a click here takes: a corner or an edge (not one hidden behind the face under the pointer), else a face. */
  private referenceAt(event: PointerEvent): Reference | null {
    const ignore = (id: string) => id === this.id || id === this.target;
    const face = this.ctx.viewport.pickFace(event);
    const eye = this.ctx.viewport.camera.position;
    const far = (p: Vec3) => eye.distanceTo(new THREE.Vector3(...p));
    const near = this.reference.near(event);
    const hidden = near && face && !ignore(face.bodyId) && far(near.point) > eye.distanceTo(face.point) + 1;
    return near && !hidden ? near : this.reference.find(event, ignore, 0, 0);
  }

  override move(event: PointerEvent): void {
    // Not dragging: the corner, the edge or the face a click would take lights up (nothing over an arrow).
    if (!this.drag) {
      const overArrow = this.arrows.some((a) => a.hovered(event));
      this.marker.show(overArrow || !this.ends ? null : this.referenceAt(event));
      this.ctx.viewport.renderer.domElement.style.cursor = overArrow ? "grab" : "";
      return;
    }
    const value = this.arrows[this.drag.axis]!.dragMove(event);
    if (value === null) return;
    this.shift[this.drag.axis] = this.drag.from + value;
    this.draw();
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.drag) {
      for (const a of this.arrows) a.dragEnd();
      this.drag = null;
      this.setShift(this.shift);
      return true;
    }
    return super.up(event, isClick);
  }

  /** A click on a corner (or an edge) of a body: the nearer end of the edge goes there; on a flat face: onto it. */
  protected override click(event: PointerEvent): void {
    if (!this.ends) return;
    const ref = this.referenceAt(event);
    if (!ref) return;
    if (ref.kind === "face") {
      if (!ref.plane) return this.ctx.notify("Cliquez une face plane, un coin ou un trait.", "info");
      this.onto = { point: ref.plane.point, normal: ref.plane.normal };
      const moved = this.moved()!;
      this.shift = [0, 1, 2].map((i) => Number((moved[0][i]! - this.ends![0][i]!).toFixed(4))) as Vec3;
      this.render();
      this.schedulePreview();
      return this.ctx.notify("Trait collé sur la face cliquée.", "info");
    }
    const at = ref.point;
    const d = (p: Vec3) => Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
    const end = d(this.ends[0]) <= d(this.ends[1]) ? this.ends[0] : this.ends[1];
    this.setShift([0, 1, 2].map((i) => at[i]! - end[i]!) as Vec3);
    this.ctx.notify(`Trait amené sur ${ref.kind === "point" ? "le coin" : "le trait"} cliqué (${formatLength(Math.hypot(...this.shift), this.ctx.unit())}).`, "info");
  }

  protected override dispose(): void {
    this.marker.dispose();
    this.ctx.viewport.renderer.domElement.style.cursor = "";
    this.marks.clear();
    for (const a of this.arrows) a.dispose();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const field = (i: number) => this.numberRow(`Déplacement ${"XYZ"[i]}`, this.shift[i]!, unit, (v) => this.setShift(this.shift.map((c, k) => (k === i ? v : c)) as Vec3), true);
    return [
      this.info(this.target ? `Trait de « ${bodyLabel(this.ctx.doc(), this.target)} » : ses faces s'étirent pour le suivre.` : "Aucun trait."),
      ...[0, 1, 2].map(field),
      this.selectRow("Bouger", this.axes, POINT_AXES, (v) => ((this.axes = v as PointAxes), this.setShift(this.shift))),
      this.onto ? this.info("Collé sur la face cliquée : chaque bout du trait va droit sur elle.") : null,
      this.info("Tirez une flèche, cliquez un coin (ou un trait) d'un corps — le bout du trait le plus proche y va —, ou une face : le trait s'y colle."),
    ];
  }
}
