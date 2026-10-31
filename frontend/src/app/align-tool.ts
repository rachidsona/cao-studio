/**
 * "Aligner" (as Curic Align): the chosen bodies and sketches line up with a
 * reference — a body or a sketch — along X, Y and Z independently: low side,
 * centre or high side aligned, or placed against it after (+) or before (−).
 * By default a body goes right after the reference in X, flush with its front
 * (Y) and on the same floor (Z): cabinets side by side. A body aligned on a
 * body is an alignment that follows its reference when the history changes;
 * on a sketch, a move. A sketch is moved in place (its plane and origin). All
 * in one undo step.
 */
import { bodyLabel, findFeature } from "../document/operations";
import type { AlignFeature, AlignMode, Feature, MoveFeature, SketchFeature } from "../document/types";
import { alignDelta, type Box } from "../features/curic";
import { moveSketchPlane } from "../sketcher/move";
import { sketchBox } from "../sketcher/sketch-transform";
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

  constructor(ctx: ToolContext, editing: AlignFeature | null, selected: string[], sketches: string[] = []) {
    super(ctx, "Aligner", editing);
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

  protected feature(): Feature | string {
    if (!this.reference) return "Choisissez la référence (un corps ou une esquisse).";
    if (this.targets.length === 0 && this.sketches.length === 0) return "Cliquez dans la vue les corps ou les esquisses à aligner sur la référence.";
    if (this.modes.every((m) => m === "none")) return "Choisissez au moins un alignement (X, Y ou Z).";
    return this.features()[0] ?? "Déjà aligné.";
  }

  protected override companions(): Feature[] {
    return this.editing ? [] : this.features().slice(1);
  }

  protected override blocker(): string | null {
    for (const f of this.features()) {
      const status = this.ctx.status(f.id);
      if (status && status.state !== "ok") return status.message ?? "L'alignement est impossible.";
    }
    return null;
  }

  override confirm(): void {
    lastModes = [...this.modes];
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
    return [
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

  protected override click(event: PointerEvent): void {
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
