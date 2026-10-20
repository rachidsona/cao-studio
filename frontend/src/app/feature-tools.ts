/** Revolution, combination of bodies and hole-on-face tools (see panel-tool.ts). */
import { AXIS_X, AXIS_Y } from "../document/sketch";
import { findFeature, uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, CombineFeature, FaceRef, HoleFeature, RevolveFeature, SketchFeature, Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";

const OPERATIONS: [BooleanOperation, string][] = [
  ["new", "Nouveau corps"],
  ["join", "Union"],
  ["cut", "Soustraction"],
  ["intersect", "Intersection"],
];

export class RevolveTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private sketch: string | undefined;
  private axis: string;
  private angle: number;
  private operation: BooleanOperation;
  private target: string | undefined;

  constructor(ctx: ToolContext, editing: RevolveFeature | null, preferredSketch?: string) {
    super(ctx, "Révolution", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "rv");
    this.name = editing?.name ?? uniqueName(doc, "Révolution");
    const candidates = this.sketches();
    this.sketch = editing?.sketch ?? (candidates.some((s) => s.id === preferredSketch) ? preferredSketch : candidates.at(-1)?.id);
    this.angle = editing?.angle ?? 360;
    this.operation = editing?.operation ?? "new";
    this.target = editing?.target;
    this.axis = editing?.axis ?? this.defaultAxis();
  }

  /** Sketches with a closed profile. */
  private sketches(): SketchFeature[] {
    return this.ctx
      .doc()
      .features.filter((f): f is SketchFeature => f.type === "sketch" && this.ctx.status(f.id)?.sketch?.closed === true);
  }

  private sketchFeature(): SketchFeature | undefined {
    const f = this.sketch ? findFeature(this.ctx.doc(), this.sketch) : undefined;
    return f?.type === "sketch" ? f : undefined;
  }

  /** A construction line is the usual revolution axis; otherwise the sketch's vertical axis. */
  private defaultAxis(): string {
    return this.sketchFeature()?.curves.find((c) => c.kind === "line" && c.construction)?.id ?? AXIS_Y;
  }

  protected feature(): RevolveFeature | string {
    if (!this.sketch) return "Aucune esquisse avec un profil fermé : dessinez d'abord le profil à faire tourner.";
    if (this.operation !== "new" && !this.target) return "Choisissez le corps cible.";
    return {
      id: this.id,
      type: "revolve",
      name: this.name,
      sketch: this.sketch,
      axis: this.axis,
      angle: this.angle,
      operation: this.operation,
      ...(this.operation === "new" ? {} : { target: this.target }),
    };
  }

  protected rows(): (HTMLElement | null)[] {
    const sketch = this.sketchFeature();
    const axes: [string, string][] = [
      [AXIS_X, "Axe X de l'esquisse"],
      [AXIS_Y, "Axe Y de l'esquisse"],
      ...(sketch?.curves ?? [])
        .filter((c) => c.kind === "line")
        .map((c): [string, string] => [c.id, `Ligne ${c.id}${c.construction ? " (construction)" : ""}`]),
    ];
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    return [
      this.selectRow(
        "Profil",
        this.sketch ?? "",
        this.sketches().map((s) => [s.id, s.name]),
        (v) => {
          this.sketch = v;
          this.axis = this.defaultAxis();
          changed();
        },
      ),
      this.selectRow("Axe", this.axis, axes, (v) => {
        this.axis = v;
        changed();
      }),
      this.numberRow("Angle", this.angle, "deg", (v) => {
        this.angle = Math.min(360, v);
        changed();
      }),
      this.selectRow("Opération", this.operation, OPERATIONS, (v) => {
        this.operation = v as BooleanOperation;
        if (this.operation !== "new") this.target ??= this.ctx.bodies().at(-1)?.id;
        changed();
      }),
      this.operation === "new"
        ? null
        : this.selectRow(
            "Cible",
            this.target ?? "",
            this.ctx.bodies().filter((b) => b.id !== this.id).map((b): [string, string] => [b.id, b.name]),
            (v) => {
              this.target = v;
              changed();
            },
          ),
    ];
  }
}

export class CombineTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private tools: Set<string>;
  private operation: CombineFeature["operation"];
  private keepTools: boolean;

  /** `preselected`: bodies picked in the model (first = target, others = tools). */
  constructor(ctx: ToolContext, editing: CombineFeature | null, preselected: string[] = []) {
    super(ctx, "Combiner des corps", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "cb");
    this.name = editing?.name ?? uniqueName(doc, "Combinaison");
    const bodies = ctx.bodies();
    const [first, ...others] = preselected;
    this.target = editing?.target ?? first ?? bodies[0]?.id;
    this.tools = new Set(editing?.tools ?? (first ? others : bodies[1] ? [bodies[1].id] : []));
    this.operation = editing?.operation ?? "join";
    this.keepTools = editing?.keepTools ?? false;
  }

  /** Bodies offered: the visible ones, plus those already used when editing. */
  private bodies(): { id: string; name: string }[] {
    const list = [...this.ctx.bodies()].filter((b) => b.id !== this.id);
    for (const id of [this.target, ...this.tools]) {
      if (id && !list.some((b) => b.id === id)) list.push({ id, name: findFeature(this.ctx.doc(), id)?.name ?? id });
    }
    return list;
  }

  protected feature(): CombineFeature | string {
    if (!this.target) return "Choisissez le corps cible.";
    const tools = [...this.tools].filter((t) => t !== this.target);
    if (tools.length === 0) return "Cochez au moins un corps outil.";
    return { id: this.id, type: "combine", name: this.name, target: this.target, tools, operation: this.operation, ...(this.keepTools ? { keepTools: true } : {}) };
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const bodies = this.bodies();
    return [
      this.selectRow("Cible", this.target ?? "", bodies.map((b): [string, string] => [b.id, b.name]), (v) => {
        this.target = v;
        this.tools.delete(v);
        changed();
      }),
      this.selectRow(
        "Opération",
        this.operation,
        [
          ["join", "Union"],
          ["cut", "Soustraction"],
          ["intersect", "Intersection"],
        ],
        (v) => {
          this.operation = v as CombineFeature["operation"];
          changed();
        },
      ),
      this.info("Corps outils :"),
      ...bodies
        .filter((b) => b.id !== this.target)
        .map((b) =>
          this.checkRow(b.name, this.tools.has(b.id), (on) => {
            if (on) this.tools.add(b.id);
            else this.tools.delete(b.id);
            changed();
          }),
        ),
      this.checkRow("Conserver les corps outils", this.keepTools, (on) => {
        this.keepTools = on;
        changed();
      }),
    ];
  }
}

export class HoleTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private diameter: number;
  private depth: number | "through";
  private target: string | undefined;
  private origin: Vec3 | undefined;
  private direction: Vec3 | undefined;
  private face: FaceRef | undefined;
  private legacy: { x: number; y: number } | undefined;

  constructor(ctx: ToolContext, editing: HoleFeature | null) {
    super(ctx, "Perçage", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "h");
    this.name = editing?.name ?? uniqueName(doc, "Perçage");
    this.diameter = editing?.diameter ?? 10;
    this.depth = editing?.depth ?? "through";
    this.target = editing?.target;
    this.origin = editing?.origin;
    this.direction = editing?.direction;
    this.face = editing?.face;
    if (editing && !editing.origin) this.legacy = { x: editing.x, y: editing.y };
  }

  protected feature(): HoleFeature | string {
    if (!this.target || (!this.origin && !this.legacy)) return "Cliquez une face plane pour placer le perçage.";
    const base = { id: this.id, type: "hole" as const, name: this.name, target: this.target, diameter: this.diameter, depth: this.depth };
    if (this.origin && this.direction) {
      return { ...base, x: 0, y: 0, origin: this.origin, direction: this.direction, ...(this.face ? { face: this.face } : {}) };
    }
    return { ...base, x: this.legacy?.x ?? 0, y: this.legacy?.y ?? 0 };
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const where = this.origin
      ? `Centre : ${this.origin.map((v) => formatLength(v, unit)).join(" ; ")}`
      : this.legacy
        ? `Position X/Y : ${formatLength(this.legacy.x, unit)} ; ${formatLength(this.legacy.y, unit)}`
        : "Aucune face choisie";
    return [
      this.info(where),
      this.numberRow("Diamètre", this.diameter, unit, (v) => {
        this.diameter = v;
        changed();
      }),
      this.checkRow("Traversant", this.depth === "through", (on) => {
        this.depth = on ? "through" : 10;
        changed();
      }),
      this.depth === "through"
        ? null
        : this.numberRow("Profondeur", this.depth, unit, (v) => {
            this.depth = v;
            changed();
          }),
    ];
  }

  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (pick) this.placeAt(pick);
  }

  /** Places the hole on the picked face, at the picked point, drilling into the body. */
  placeAt(pick: FacePick): void {
    // While previewing, the visible body is this hole's own result: keep drilling the same target.
    const bodyId = pick.bodyId;
    const target = bodyId === this.id ? this.target : bodyId;
    void this.ctx.geometry
      .describe(bodyId, [], pick.faceIndex)
      .then(({ face }) => {
        if (!face || face.type !== "PLANE") {
          this.ctx.notify("Choisissez une face plane pour le perçage.", "error");
          return;
        }
        this.target = target;
        this.origin = [pick.point.x, pick.point.y, pick.point.z];
        this.direction = [-face.normal[0], -face.normal[1], -face.normal[2]];
        this.face = face;
        this.legacy = undefined;
        this.render();
        this.schedulePreview();
      })
      .catch((error: unknown) => this.ctx.notify(error instanceof Error ? error.message : String(error), "error"));
  }
}
