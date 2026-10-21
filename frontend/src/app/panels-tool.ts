/**
 * "Panneaux" (furniture, as JoinerCAD's skeleton design): choose the skeleton
 * sketch, the board thickness and depth, the side of the outline lines the
 * boards lie on, and which boards run through at the corners. Every line
 * becomes a board, computed live by the kernel; OK adds the operation (one
 * undo step), each board being a body of its own.
 */
import { findFeature, uniqueId, uniqueName } from "../document/operations";
import type { PanelsFeature, SketchFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Last values used, kept for the next panels of the session (mm). */
let last = { thickness: 18, depth: 400 };

export class PanelsTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private sketch: string | undefined;
  private thickness: number;
  private depth: number;
  private align: PanelsFeature["align"];
  private through: PanelsFeature["through"];

  constructor(ctx: ToolContext, editing: PanelsFeature | null, preferredSketch?: string) {
    super(ctx, "Panneaux depuis un squelette", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "pn");
    this.name = editing?.name ?? uniqueName(doc, "Panneaux");
    const candidates = this.sketches();
    this.sketch = editing?.sketch ?? (candidates.some((s) => s.id === preferredSketch) ? preferredSketch : candidates.at(-1)?.id);
    this.thickness = editing?.thickness ?? last.thickness;
    this.depth = editing?.depth ?? last.depth;
    this.align = editing?.align ?? "inside";
    this.through = editing?.through ?? "vertical";
  }

  /** Sketches with at least one line (the skeleton). */
  private sketches(): SketchFeature[] {
    return this.ctx
      .doc()
      .features.filter((f): f is SketchFeature => f.type === "sketch" && f.curves.some((c) => c.kind === "line" && !c.construction && !c.projected));
  }

  protected feature(): PanelsFeature | string {
    if (!this.sketch || !findFeature(this.ctx.doc(), this.sketch)) return "Dessinez d'abord le squelette du meuble : une esquisse dont chaque ligne sera un panneau.";
    return { id: this.id, type: "panels", name: this.name, sketch: this.sketch, thickness: this.thickness, depth: this.depth, align: this.align, through: this.through };
  }

  /** The result cannot be validated while the kernel refuses it. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Les panneaux sont invalides.") : null;
  }

  override confirm(): void {
    const reason = this.blocker();
    if (reason) {
      this.ctx.notify(reason, "error");
      return;
    }
    last = { thickness: this.thickness, depth: this.depth };
    super.confirm();
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const unit = this.ctx.unit();
    return [
      this.selectRow("Squelette", this.sketch ?? "", this.sketches().map((s): [string, string] => [s.id, s.name]), (v) => {
        this.sketch = v;
        changed();
      }),
      this.numberRow("Épaisseur", this.thickness, unit, (v) => {
        this.thickness = v;
        changed();
      }),
      this.numberRow(
        "Profondeur",
        this.depth,
        unit,
        (v) => {
          this.depth = v;
          changed();
        },
        true,
      ),
      this.selectRow(
        "Côté",
        this.align,
        [
          ["inside", "Vers l'intérieur (cotes extérieures)"],
          ["center", "Centré sur les traits"],
          ["outside", "Vers l'extérieur"],
        ],
        (v) => {
          this.align = v as PanelsFeature["align"];
          changed();
        },
      ),
      this.selectRow(
        "Aux coins",
        this.through,
        [
          ["vertical", "Les montants passent"],
          ["horizontal", "Dessus et dessous passent"],
        ],
        (v) => {
          this.through = v as PanelsFeature["through"];
          changed();
        },
      ),
      this.info("Chaque ligne de l'esquisse devient un panneau (un corps). Une ligne intérieure, comme une étagère, est centrée sur son trait."),
    ];
  }
}
