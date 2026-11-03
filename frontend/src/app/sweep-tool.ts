/**
 * "Suivre-moi" (as SketchUp's Follow Me): the closed profile of a sketch swept
 * along the path of another (lines and arcs): skirting boards, mouldings,
 * cornices. The profile is drawn in a plane through the start of the path;
 * the result is a new body, or joined to / cut from a body. The kernel's
 * sweep is in features/sweep.ts. « Extruder le long d'un chemin » (JHS
 * PowerBar's Extrude Along Path) is the same tool with the profile placed:
 * drawn anywhere, it is set square to the start of the path — or, as in JHS, no profile at all: a rectangle width ×
 * height standing on the path (centred, on its left or on its right), from the end chosen (a red dot shows it).
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, SketchFeature, SweepFeature, Vec3 } from "../document/types";
import { chainStart, pathChain, reverseChain } from "../features/sweep";
import { frameOf } from "../sketcher/frame";
import { Marks } from "./measure";
import { PanelTool, type ToolContext } from "./panel-tool";
import { operationChoices } from "../ui/feature-meta";

const OPERATIONS = operationChoices("new", "join", "cut");
type Place = NonNullable<SweepFeature["place"]>;
type Section = NonNullable<SweepFeature["section"]>;
const RECTANGLE = "rectangle";
const ALIGNS: [Section["align"], string][] = [
  ["center", "Centré sur le chemin"],
  ["left", "À gauche du chemin"],
  ["right", "À droite du chemin"],
];
const ANCHORS: [Place["anchor"], string][] = [
  ["bottom-left", "Coin bas gauche"],
  ["bottom-right", "Coin bas droit"],
  ["center", "Centre"],
  ["origin", "Origine de l'esquisse"],
];

export class SweepTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private profile: string | undefined;
  private path: string | undefined;
  private operation: BooleanOperation;
  private target: string | undefined;
  private frenet: boolean;
  /** Extrude Along Path: where the profile is set on the path (null: where it is drawn). */
  private place: Place | null;
  /** Extrude Along Path with no profile drawn: the rectangle swept (null: a profile sketch). */
  private section: Section | null;
  private readonly alongPath: boolean;
  private readonly marks = new Marks(this.ctx.viewport.scene);

  constructor(ctx: ToolContext, editing: SweepFeature | null, selected: string[] = [], alongPath = false) {
    super(ctx, editing?.place || alongPath ? "Extruder le long d'un chemin" : "Suivre-moi", editing);
    this.alongPath = !!(editing?.place || editing?.section || alongPath);
    this.place = editing ? (editing.place ?? null) : alongPath ? { anchor: "bottom-left", spin: 0, flip: false } : null;
    this.section = editing ? (editing.section ?? null) : alongPath ? { width: 20, height: 100, align: "center" } : null;
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sw");
    this.name = editing?.name ?? uniqueName(doc, "Suivre-moi");
    const closed = this.profiles();
    // The sketches chosen beforehand: the closed one is the profile, the other the path.
    this.profile = editing?.profile ?? selected.find((id) => closed.some((s) => s.id === id)) ?? closed.at(-1)?.id;
    // A rectangle swept: the sketch chosen is the path, even a closed one (a wall all round).
    this.path = editing?.path ?? (this.section ? selected[0] : undefined) ?? selected.find((id) => id !== this.profile) ?? this.paths().filter((f) => f.id !== this.profile).at(-1)?.id ?? this.paths().at(-1)?.id;
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
    return this.ctx.doc().features.filter((f): f is SketchFeature => f.type === "sketch" && (this.section !== null || f.id !== this.profile) && f.curves.some((c) => !c.construction && c.kind !== "circle"));
  }

  protected feature(): SweepFeature | string {
    if (this.section) {
      if (!this.path) return "Dessinez le chemin (lignes et arcs) dans une esquisse.";
      if (this.operation !== "new" && !this.target) return "Choisissez le corps cible.";
      return { id: this.id, type: "sweep", name: this.name, profile: "", path: this.path, operation: this.operation, ...(this.operation === "new" ? {} : { target: this.target }), ...(this.frenet ? { frenet: true } : {}), section: { ...this.section } };
    }
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
      ...(this.place ? { place: { ...this.place } } : {}),
    };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le balayage est impossible.") : null;
  }

  /** A red dot where the rectangle starts (the start of the path, or its end). */
  private drawStart(): void {
    this.marks.clear();
    const sketch = this.section && this.path ? this.ctx.doc().features.find((f): f is SketchFeature => f.id === this.path && f.type === "sketch") : undefined;
    if (!sketch || !this.section) return;
    try {
      const chain = pathChain(sketch);
      const { origin, tangent } = chainStart(this.section.fromEnd ? reverseChain(chain) : chain, frameOf(sketch));
      const ahead = origin.map((c, i) => c + tangent[i]! * Math.max(40, this.section!.width)) as Vec3;
      this.marks.line(origin as Vec3, ahead, 0xdc2626, false);
      this.marks.dot(origin as Vec3, 0xdc2626);
    } catch {
      // A path that is not one chain: the preview says why.
    }
  }

  protected override render(): void {
    super.render();
    this.drawStart();
  }

  protected override dispose(): void {
    this.marks.clear();
  }

  private sectionRows(changed: () => void): HTMLElement[] {
    const section = this.section!;
    const unit = this.ctx.unit();
    const set = (next: Partial<Section>) => ((this.section = { ...section, ...next }), changed());
    return [
      this.numberRow("Largeur", section.width, unit, (v) => set({ width: v })),
      this.numberRow("Hauteur", section.height, unit, (v) => set({ height: v })),
      this.selectRow("Alignement", section.align, ALIGNS, (v) => set({ align: v as Section["align"] })),
      this.selectRow("Commencer", section.fromEnd ? "end" : "start", [["start", "À ce bout (point rouge)"], ["end", "À l'autre bout"]], (v) => set(v === "end" ? { fromEnd: true } : { fromEnd: false })),
      this.info("Un rectangle debout sur le chemin, balayé tout du long : un mur, une plinthe, un bandeau. Gauche et droite se lisent en partant du point rouge."),
    ];
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const profiles = this.profiles().map((s): [string, string] => [s.id, s.name]);
    return [
      this.selectRow("Profil", this.section ? RECTANGLE : (this.profile ?? ""), this.alongPath ? [[RECTANGLE, "Rectangle (largeur × hauteur)"], ...profiles] : profiles, (v) => {
        if (v === RECTANGLE) this.section ??= { width: 20, height: 100, align: "center" };
        else {
          this.section = null;
          this.profile = v;
          this.place ??= { anchor: "bottom-left", spin: 0, flip: false };
          if (this.path === v) this.path = this.paths()[0]?.id;
        }
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
      ...(this.section ? this.sectionRows(changed) : []),
      this.section ? null : this.checkRow("Poser le profil au début du chemin", this.place !== null, (v) => {
        this.place = v ? { anchor: "bottom-left", spin: 0, flip: false } : null;
        changed();
      }),
      ...(this.section
        ? []
        : this.place
        ? [
            this.selectRow("Point sur le chemin", this.place.anchor, ANCHORS, (v) => ((this.place = { ...this.place!, anchor: v as Place["anchor"] }), changed())),
            this.selectRow("Tourner le profil", String(this.place.spin), [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]], (v) => ((this.place = { ...this.place!, spin: Number(v) }), changed())),
            this.checkRow("Retourner (de l'autre côté du chemin)", this.place.flip, (v) => ((this.place = { ...this.place!, flip: v }), changed())),
            this.info("Le profil, dessiné où l'on veut (à plat, par exemple), est posé debout au début du chemin, perpendiculaire à lui : son point choisi sur le chemin, son haut vers le haut."),
          ]
        : [this.info("Le profil doit être dessiné dans un plan qui passe par le début du chemin (le plan perpendiculaire au chemin).")]),
    ];
  }
}
