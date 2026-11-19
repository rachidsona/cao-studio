/**
 * "Panneaux" (furniture, as JoinerCAD's skeleton design): choose the skeleton
 * sketch, the board thickness and depth, the side of the outline lines the
 * boards lie on, and which boards run through at the corners. Every line
 * becomes a board, computed live by the kernel; OK adds the operation (one
 * undo step), each board being a body of its own. A skeleton that reads as a caisson (document/skeleton-partition.ts:
 * a rectangle, straight strokes from edge to edge) becomes a Répartition instead — its cases, shelves and cloisons,
 * which the niche tools then fill —, the skeleton hidden.
 */
import { withCaissonPlaced } from "../document/caisson-spec";
import { findFeature, uniqueId, uniqueName, updateFeature } from "../document/operations";
import { panelDefaults } from "../document/panel-defaults";
import { skeletonCaisson } from "../document/skeleton-partition";
import { isPartition } from "../sketcher/partition-history";
import type { CadDocument, PanelsFeature, SketchFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";


export class PanelsTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private sketch: string | undefined;
  private thickness: number;
  private depth: number;
  private align: PanelsFeature["align"];
  private through: PanelsFeature["through"];
  /** Why the skeleton stays in boards rather than becoming a Répartition (null: it becomes one). */
  private boards: string | null = null;

  constructor(ctx: ToolContext, editing: PanelsFeature | null, preferredSketch?: string) {
    super(ctx, "Panneaux depuis un squelette", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "pn");
    this.name = editing?.name ?? uniqueName(doc, "Panneaux");
    const candidates = this.sketches();
    this.sketch = editing?.sketch ?? (candidates.some((s) => s.id === preferredSketch) ? preferredSketch : candidates.at(-1)?.id);
    this.thickness = editing?.thickness ?? panelDefaults.thickness;
    this.depth = editing?.depth ?? panelDefaults.depth;
    this.align = editing?.align ?? panelDefaults.align;
    this.through = editing?.through ?? "vertical";
  }

  /**
   * Sketches with at least one line (the skeleton): not a Répartition (already a caisson), nor a hidden one (a skeleton
   * already made into one) — but the one being changed; in the document as it was before this use of the tool.
   */
  private sketches(): SketchFeature[] {
    const doc = this.docBefore();
    const own = doc.features.find((f): f is PanelsFeature => f.type === "panels" && f.id === this.id)?.sketch;
    return doc.features.filter((f): f is SketchFeature => f.type === "sketch" && f.curves.some((c) => c.kind === "line" && !c.construction && !c.projected) && (f.id === own || (!f.hidden && !(f.offsets ?? []).some(isPartition))));
  }

  protected feature(): PanelsFeature | string {
    if (!this.sketch || !findFeature(this.ctx.doc(), this.sketch)) return "Dessinez d'abord le squelette du meuble : une esquisse dont chaque ligne sera un panneau.";
    return { id: this.id, type: "panels", name: this.name, sketch: this.sketch, thickness: this.thickness, depth: this.depth, align: this.align, through: this.through };
  }

  /**
   * The skeleton as a Répartition, in place of its boards, when it reads as a caisson: one undo step all the same, the
   * skeleton hidden. Otherwise the boards, and why.
   */
  protected override decorate(doc: CadDocument): CadDocument {
    const sketch = this.sketch ? findFeature(doc, this.sketch) : undefined;
    if (sketch?.type !== "sketch") return doc;
    const made = skeletonCaisson(sketch, { thickness: this.thickness, depth: this.depth, align: this.align, through: this.through });
    const base = typeof made === "string" ? null : updateFeature({ ...doc, features: doc.features.filter((f) => f.id !== this.id) }, sketch.id, (f) => ({ ...f, hidden: true }));
    const placed = typeof made === "string" ? made : withCaissonPlaced(base!, made.spec, { frame: made.frame, width: made.width, height: made.height, name: this.name });
    this.boards = typeof placed === "string" ? placed : null;
    return typeof placed === "string" ? doc : placed.doc;
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
    Object.assign(panelDefaults, { thickness: this.thickness, depth: this.depth, align: this.align });
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
      this.info(
        this.boards === null
          ? "Le squelette devient une Répartition : son contour est le caisson, un trait du bas au haut un côté entre deux cases, un trait d'un bord à l'autre d'une case une étagère (ou une cloison). Les niches se remplissent ensuite comme celles d'une Répartition."
          : `Chaque ligne de l'esquisse devient un panneau (un corps). Une ligne intérieure, comme une étagère, est centrée sur son trait. ${this.boards}`,
      ),
    ];
  }
}
