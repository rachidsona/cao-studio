/**
 * "Aligner" (as Curic Align): the chosen bodies and sketches line up with a
 * reference — a body or a sketch — along X, Y and Z independently: low side,
 * centre or high side aligned, or placed against it after (+) or before (−).
 * By default a body goes right after the reference in X, flush with its front
 * (Y) and on the same floor (Z): cabinets side by side. A body aligned on a
 * body is an alignment that follows its reference when the history changes;
 * on a sketch, a move. A sketch is moved in place (its plane and origin). All
 * in one undo step. « Face sur face » (app/align-faces.ts) colle une face d'un corps sur une face d'un autre, même
 * inclinée ; « Point sur point » (app/align-points.ts) amène un coin d'un corps sur un coin d'un autre.
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { AlignFeature, AlignMode, Feature, MoveFeature, SketchFeature } from "../document/types";
import { alignDelta, type Box } from "../features/curic";
import { moveSketchPlane } from "../sketcher/move";
import { sketchBox } from "../sketcher/sketch-transform";
import { el } from "../ui/dom";
import type { FacePick } from "../viewport/viewport";
import { AlignFaces } from "./align-faces";
import { AlignPoints, POINT_AXES, type PointAxes } from "./align-points";
import { boxOfBodies, freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

const MODES: [AlignMode, string][] = [
  ["none", "— (ne bouge pas)"],
  ["min", "Côté − aligné"],
  ["center", "Centré"],
  ["max", "Côté + aligné"],
  ["after", "Accolé après (+)"],
  ["before", "Accolé avant (−)"],
];

/** Last settings, kept for the next alignment of the session. */
let lastModes: [AlignMode, AlignMode, AlignMode] = ["after", "min", "min"];
type Method = "axes" | "faces" | "points";
let lastMethod: Method = "axes";

export class AlignTool extends PanelTool {
  private targets: string[];
  private sketches: string[];
  private reference: string | undefined;
  private modes: [AlignMode, AlignMode, AlignMode];
  private gaps: [number, number, number] = [0, 0, 0];
  /** Ids and names of the operations made for the bodies (fixed while the tool is open). */
  private slots: { id: string; name: string }[] = [];
  /** Boxes of the visible bodies when the tool opened (the preview replaces the bodies it moves). */
  private readonly bodyBoxes = new Map<string, Box>();
  /** By the boxes along X, Y and Z, or a face laid on another face. */
  private method: Method;
  private readonly faces: AlignFaces;
  private readonly points: AlignPoints;

  constructor(ctx: ToolContext, editing: AlignFeature | null, selected: string[], sketches: string[] = [], faces: readonly FacePick[] = []) {
    super(ctx, "Aligner", editing);
    this.faces = new AlignFaces(ctx, () => {
      this.render();
      this.schedulePreview();
    });
    this.points = new AlignPoints(ctx, () => {
      this.points.draw(null);
      this.render();
      this.schedulePreview();
    });
    // A face picked when the tool opens: the face that moves.
    this.method = editing ? "axes" : faces.length ? "faces" : lastMethod;
    if (!editing && faces[0]) void this.faces.pick(faces[0]);
    for (const b of ctx.bodies()) {
      const box = boxOfBodies(ctx.viewport, [b.id]);
      if (box) this.bodyBoxes.set(b.id, box);
    }
    if (editing) {
      this.targets = [editing.target];
      this.sketches = [];
      this.reference = editing.reference;
      this.modes = [...editing.modes];
      this.gaps = [...(editing.gaps ?? [0, 0, 0])];
      this.slots = [{ id: editing.id, name: editing.name }];
    } else {
      // Several things picked: the last one is the reference, the others line up with it.
      const picked = [...selected, ...sketches];
      this.reference = picked.length >= 2 ? picked.at(-1) : ctx.bodies().find((b) => !selected.includes(b.id))?.id;
      this.targets = selected.filter((id) => id !== this.reference);
      this.sketches = sketches.filter((id) => id !== this.reference);
      this.modes = [...lastModes];
    }
  }

  private sketch(id: string | undefined): SketchFeature | null {
    const f = id ? findFeature(this.ctx.doc(), id) : undefined;
    return f?.type === "sketch" ? f : null;
  }

  private referenceBox(): Box | null {
    const sketch = this.sketch(this.reference);
    if (sketch) return sketchBox(sketch);
    return this.reference ? (this.bodyBoxes.get(this.reference) ?? boxOfBodies(this.ctx.viewport, [this.reference])) : null;
  }

  /** What is made: for each body an alignment (on a body) or a move (on a sketch), and each sketch moved in place. */
  private features(): Feature[] {
    const ref = this.referenceBox();
    if (!this.reference || !ref) return [];
    const onSketch = this.sketch(this.reference) !== null;
    if (!this.editing && this.slots.length < this.targets.length) this.slots = freshFeatureIds(this.ctx.doc(), onSketch ? "mv" : "al", onSketch ? "Déplacement" : "Alignement", this.targets.length);
    const bodies: Feature[] = this.targets.flatMap((target, i): Feature[] => {
      const slot = this.slots[i] as { id: string; name: string };
      if (!onSketch) return [{ ...slot, type: "align", target, reference: this.reference as string, modes: [...this.modes], ...(this.gaps.some((v) => v !== 0) ? { gaps: [...this.gaps] } : {}) } satisfies AlignFeature];
      const box = this.bodyBoxes.get(target);
      const translate = box ? alignDelta(box, ref, this.modes, this.gaps) : null;
      return translate && Math.hypot(...translate) > 1e-6 ? [{ ...slot, type: "move", target, translate } satisfies MoveFeature] : [];
    });
    const sketches = this.sketches.flatMap((id) => {
      const sketch = this.sketch(id);
      const box = sketch ? sketchBox(sketch) : null;
      const delta = box ? alignDelta(box, ref, this.modes, this.gaps) : null;
      return sketch && delta && Math.hypot(...delta) > 1e-6 ? [moveSketchPlane(sketch, delta)] : [];
    });
    return [...bodies, ...sketches];
  }

  /** The features of « Face sur face » or « Point sur point », or what is missing. */
  private picked(): Feature[] | string {
    return this.method === "faces" ? this.faces.features() : this.points.features();
  }

  protected feature(): Feature | string {
    if (this.method !== "axes") {
      const made = this.picked();
      return typeof made === "string" ? made : made[0]!;
    }
    if (!this.reference) return "Choisissez la référence (un corps ou une esquisse).";
    if (this.targets.length === 0 && this.sketches.length === 0) return "Cliquez dans la vue les corps ou les esquisses à aligner sur la référence.";
    if (this.modes.every((m) => m === "none")) return "Choisissez au moins un alignement (X, Y ou Z).";
    return this.features()[0] ?? "Déjà aligné.";
  }

  protected override companions(): Feature[] {
    if (this.method !== "axes") {
      const made = this.picked();
      return typeof made === "string" ? [] : made.slice(1);
    }
    return this.editing ? [] : this.features().slice(1);
  }

  protected override blocker(): string | null {
    const made = this.method !== "axes" ? this.picked() : this.features();
    for (const f of typeof made === "string" ? [] : made) {
      const status = this.ctx.status(f.id);
      if (status && status.state !== "ok") return status.message ?? "L'alignement est impossible.";
    }
    return null;
  }

  override confirm(): void {
    lastModes = [...this.modes];
    lastMethod = this.method;
    super.confirm();
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const doc = this.ctx.doc();
    const names = [...this.targets.map((id) => bodyLabel(doc, id)), ...this.sketches.map((id) => this.sketch(id)?.name ?? id)];
    const bodies = this.ctx.bodies().filter((b) => !this.targets.includes(b.id) || b.id === this.reference);
    const sketches = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.hidden && !f.suppressed && !this.sketches.includes(f.id));
    // Each axis: how it lines up, and the gap kept (between the faces placed against each other, or set back).
    const axisRow = (i: 0 | 1 | 2, label: string) => [
      this.selectRow(label, this.modes[i], MODES, (v) => {
        this.modes[i] = v as AlignMode;
        changed();
      }),
      this.modes[i] === "none" ? null : this.numberRow("  écart", this.gaps[i], this.ctx.unit(), (v) => ((this.gaps[i] = v), changed()), true),
    ];
    const method = this.editing
      ? null
      : this.selectRow("Méthode", this.method, [["axes", "Par axes (X, Y, Z)"], ["faces", "Face sur face"], ["points", "Point sur point"]], (v) => {
          this.method = v as Method;
          this.points.draw(null);
          changed();
        });
    if (this.method === "faces") return [method, ...this.faceRows(changed)];
    if (this.method === "points") return [method, ...this.pointRows(changed)];
    return [
      method,
      this.info(names.length ? `Alignés (${names.length}) : ${names.join(", ")}` : "Rien à aligner."),
      this.selectRow(
        "Référence",
        this.reference ?? "",
        [["", "— choisir —"], ...bodies.map((b): [string, string] => [b.id, b.name]), ...sketches.map((s): [string, string] => [s.id, `Esquisse « ${s.name} »`])],
        (v) => {
          this.reference = v || undefined;
          this.targets = this.targets.filter((id) => id !== this.reference);
          this.sketches = this.sketches.filter((id) => id !== this.reference);
          this.slots = [];
          changed();
        },
      ),
      ...axisRow(0, "X largeur"),
      ...axisRow(1, "Y profond."),
      ...axisRow(2, "Z hauteur"),
      this.info("Cliquez un corps ou une esquisse dans la vue pour l'ajouter à ce qui s'aligne, ou le retirer."),
    ];
  }

  /** Face sur face: the two faces, where it lands, the gap and a quarter turn on the face. */
  private faceRows(changed: () => void): (HTMLElement | null)[] {
    const f = this.faces;
    const made = f.features();
    const doc = this.ctx.doc();
    const restart = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Recommencer");
    restart.addEventListener("click", () => f.restart());
    return [
      this.info(f.moving ? `Face qui bouge : « ${bodyLabel(doc, f.moving.bodyId)} »${f.fixed ? ` ; collée sur « ${bodyLabel(doc, f.fixed.bodyId)} »` : ""}.` : "1. Cliquez la face du corps à déplacer."),
      f.fixed
        ? null
        : this.info(f.moving ? "2. Cliquez la face où la coller, sur un autre corps — droite ou inclinée." : "2. Puis la face où la coller, sur un autre corps — droite ou inclinée."),
      f.fixed ? this.selectRow("Où", f.where, [["point", "Au point cliqué"], ["center", "Au centre de la face"]], (v) => ((f.where = v as "point" | "center"), changed())) : null,
      f.fixed ? this.numberRow("Jeu", f.gap, this.ctx.unit(), (v) => ((f.gap = v), changed()), true) : null,
      f.fixed ? this.selectRow("Tourner sur la face", String(f.spin), [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]], (v) => ((f.spin = Number(v)), changed())) : null,
      typeof made === "string" && f.fixed ? this.info(made) : null,
      f.moving ? restart : null,
    ];
  }

  /** Point sur point: the two points, and on which axes the element moves. */
  private pointRows(changed: () => void): (HTMLElement | null)[] {
    const p = this.points;
    const restart = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Recommencer");
    restart.addEventListener("click", () => p.restart());
    const made = p.features();
    return [
      this.info(p.describe()),
      this.selectRow("Bouger", p.axes, POINT_AXES, (v) => ((p.axes = v as PointAxes), changed())),
      typeof made === "string" && p.fixed ? this.info(made) : null,
      this.info("Un caisson bouge avec ses façades ; deux points d'un même caisson ne bougent que la pièce."),
      p.moving ? restart : null,
    ];
  }

  override move(event: PointerEvent): void {
    if (this.method === "points") return this.points.draw(this.points.pointAt(event));
    if (this.method !== "faces") return;
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face && !this.faces.madeIds.includes(face.bodyId) ? { face } : null);
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
    this.points.dispose();
  }

  protected override click(event: PointerEvent): void {
    if (this.method === "faces") {
      const face = this.ctx.viewport.pickFace(event);
      if (face) void this.faces.pick(face);
      return;
    }
    if (this.method === "points") return this.points.pick(event);
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (!target || this.editing) return;
    if (target.kind === "sketch") {
      if (target.id === this.reference) return;
      const i = this.sketches.indexOf(target.id);
      if (i >= 0) this.sketches.splice(i, 1);
      else this.sketches.push(target.id);
    } else {
      // A body shown by the preview is the result of an operation: it stands for the body it moves.
      const slot = this.slots.findIndex((s) => s.id === target.id);
      const id = slot >= 0 ? (this.targets[slot] ?? target.id) : target.id;
      if (id === this.reference) return;
      const i = this.targets.indexOf(id);
      if (i >= 0) this.targets.splice(i, 1);
      else this.targets.push(id);
      this.slots = [];
    }
    this.render();
    this.schedulePreview();
  }
}
