/**
 * "Suivre-moi" (as SketchUp's Follow Me): the closed profile of a sketch swept
 * along the path of another (lines and arcs): skirting boards, mouldings,
 * cornices. The profile is drawn in a plane through the start of the path;
 * the result is a new body, or joined to / cut from a body. The kernel's
 * sweep is in features/sweep.ts.
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, SketchFeature, SweepFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

const OPERATIONS: [BooleanOperation, string][] = [
  ["new", "Nouveau corps"],
  ["join", "Union"],
  ["cut", "Soustraction"],
];

export class SweepTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private profile: string | undefined;
  private path: string | undefined;
  private operation: BooleanOperation;
  private target: string | undefined;
  private frenet: boolean;

  constructor(ctx: ToolContext, editing: SweepFeature | null, selected: string[] = []) {
    super(ctx, "Suivre-moi", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sw");
    this.name = editing?.name ?? uniqueName(doc, "Suivre-moi");
    const closed = this.profiles();
    // The sketches chosen beforehand: the closed one is the profile, the other the path.
    this.profile = editing?.profile ?? selected.find((id) => closed.some((s) => s.id === id)) ?? closed.at(-1)?.id;
    this.path = editing?.path ?? selected.find((id) => id !== this.profile) ?? this.paths().at(-1)?.id;
    this.operation = editing?.operation ?? "new";
    this.target = editing?.target;
    this.frenet = editing?.frenet ?? false;
  }

  /** Sketches with a closed profile. */
  private profiles(): SketchFeature[] {
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && this.ctx.status(f.id)?.sketch?.closed === true);
  }

  /** Sketches with curves that can be a path (any sketch but the profile). */
  private paths(): SketchFeature[] {
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && f.id !== this.profile && f.curves.some((c) => !c.construction && c.kind !== "circle"));
  }

  protected feature(): SweepFeature | string {
    if (!this.profile) return "Dessinez d'abord un profil fermé (la coupe de la moulure) dans une esquisse.";
    if (!this.path) return "Dessinez le chemin (lignes et arcs) dans une autre esquisse.";
    if (this.operation !== "new" && !this.target) return "Choisissez le corps cible.";
    return {
      id: this.id,
      type: "sweep",
      name: this.name,
      profile: this.profile,
      path: this.path,
      operation: this.operation,
      ...(this.operation === "new" ? {} : { target: this.target }),
      ...(this.frenet ? { frenet: true } : {}),
    };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le balayage est impossible.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    return [
      this.selectRow("Profil", this.profile ?? "", this.profiles().map((s): [string, string] => [s.id, s.name]), (v) => {
        this.profile = v;
        if (this.path === v) this.path = this.paths()[0]?.id;
        changed();
      }),
      this.selectRow("Chemin", this.path ?? "", this.paths().map((s): [string, string] => [s.id, s.name]), (v) => {
        this.path = v;
        changed();
      }),
      this.selectRow("Opération", this.operation, OPERATIONS, (v) => {
        this.operation = v as BooleanOperation;
        if (this.operation !== "new") this.target ??= this.ctx.bodies().at(-1)?.id;
        changed();
      }),
      this.operation === "new"
        ? null
        : this.selectRow("Cible", this.target ?? "", this.ctx.bodies().filter((b) => b.id !== this.id).map((b): [string, string] => [b.id, b.name]), (v) => {
            this.target = v;
            changed();
          }),
      this.checkRow("Suivre la courbure (repère de Frenet)", this.frenet, (v) => {
        this.frenet = v;
        changed();
      }),
      this.info("Le profil doit être dessiné dans un plan qui passe par le début du chemin (le plan perpendiculaire au chemin)."),
    ];
  }
}
