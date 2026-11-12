/** Revolution, combination of bodies and hole-on-face tools (see panel-tool.ts). */
import { AXIS_X, AXIS_Y } from "../document/sketch";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, CadDocument, CombineFeature, FaceRef, HoleFeature, RevolveFeature, SketchFeature, Vec3 } from "../document/types";
import { setBodyAppearance } from "../appearance/assign";
import { formatLength } from "../measurements/units";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";
import { operationChoices } from "../ui/feature-meta";
import { el } from "../ui/dom";
import { pickBody } from "./combine-pick";

const OPERATIONS = operationChoices("new", "join", "cut", "intersect");

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

/** The look of the body that bodies combined into one make: a satin lacquer of this blue. */
export const JOINED_LOOK = "lacquer-satin";
export const JOINED_COLOR = "#2078CF";

export class CombineTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private tools: Set<string>;
  private operation: CombineFeature["operation"];
  private keepTools: boolean;
  /** What a click on a body in the view chooses: the target, or the tools (added, or taken away). */
  private choosing: "target" | "tools";

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
    this.choosing = preselected.length || editing ? "tools" : "target";
    // Chosen in the view: nothing is taken for granted when nothing was picked first.
    if (!preselected.length && !editing) {
      this.target = undefined;
      this.tools = new Set();
    }
  }

  override move(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    this.ctx.viewport.setHoverHighlight(target?.kind === "body" ? { bodies: [target.id] } : null);
  }

  override start(): void {
    super.start();
    this.markChosen();
  }

  /** The bodies chosen stay marked in the view: the target in orange, the tools in blue. */
  private markChosen(): void {
    const tools = [...this.tools].filter((t) => t !== this.target).map((body) => ({ body, role: "second" as const }));
    this.ctx.viewport.setChosen([...(this.target ? [{ body: this.target, role: "first" as const }] : []), ...tools]);
  }

  /** A body clicked in the view: the target, or a tool added or taken away. */
  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    const next = pickBody({ target: this.target, tools: [...this.tools], choosing: this.choosing }, target.id, this.id);
    if (next.target === this.target && next.tools.length === this.tools.size && next.choosing === this.choosing && next.tools.every((t) => this.tools.has(t))) {
      if (target.id === this.target || target.id === this.id) this.ctx.notify("C'est la cible : cliquez « Cible » pour en choisir une autre.", "info");
      return;
    }
    this.target = next.target;
    this.tools = new Set(next.tools);
    this.choosing = next.choosing;
    this.markChosen();
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }

  /**
   * The bodies made one (an union, not when editing): the body they make is painted blue, so that it reads as one
   * (as a satin lacquer, #2078CF, its colour then changed like any other in Apparence).
   */
  protected override decorate(doc: CadDocument): CadDocument {
    return this.operation === "join" && !this.editing ? setBodyAppearance(doc, [this.id], JOINED_LOOK, JOINED_COLOR) : doc;
  }

  /** Bodies offered: the visible ones, plus those already used when editing. */
  private bodies(): { id: string; name: string }[] {
    const list = [...this.ctx.bodies()].filter((b) => b.id !== this.id);
    for (const id of [this.target, ...this.tools]) {
      if (id && !list.some((b) => b.id === id)) list.push({ id, name: bodyLabel(this.ctx.doc(), id) });
    }
    return list;
  }

  protected feature(): CombineFeature | string {
    if (!this.target) return "Cliquez dans la vue le corps cible (ou choisissez-le dans la liste).";
    const tools = [...this.tools].filter((t) => t !== this.target);
    if (tools.length === 0) return "Cliquez dans la vue au moins un corps outil (ou cochez-le dans la liste).";
    return { id: this.id, type: "combine", name: this.name, target: this.target, tools, operation: this.operation, ...(this.keepTools ? { keepTools: true } : {}) };
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.markChosen();
      this.render();
      this.schedulePreview();
    };
    const bodies = this.bodies();
    const name = (id: string) => bodies.find((b) => b.id === id)?.name ?? bodyLabel(this.ctx.doc(), id);
    // What a click in the view chooses: the target, or the tools.
    const mode = (which: "target" | "tools", label: string) => {
      const b = el("button", { type: "button", class: `h-8 flex-1 border font-medium ${this.choosing === which ? "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}`, "aria-pressed": String(this.choosing === which), "data-combine-pick": which }, label);
      b.addEventListener("click", () => ((this.choosing = which), this.render()));
      return b;
    };
    const chosen = [...this.tools].filter((t) => t !== this.target).map((id) => {
      const drop = el("button", { type: "button", class: "size-6 shrink-0 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Retirer ce corps outil", "aria-label": `Retirer ${name(id)}` }, "✕");
      drop.addEventListener("click", () => (this.tools.delete(id), changed()));
      return el("li", { class: "flex items-center gap-1.5", "data-combine-tool": id }, el("span", { class: "min-w-0 flex-1 truncate" }, name(id)), drop);
    });
    const list = el("details", { class: "border border-gray-200 px-2 py-1 dark:border-gray-700" }, el("summary", { class: "cursor-pointer" }, `Choisir dans la liste (${bodies.length - (this.target ? 1 : 0)} corps)`),
      ...bodies
        .filter((b) => b.id !== this.target)
        .map((b) =>
          this.checkRow(b.name, this.tools.has(b.id), (on) => {
            if (on) this.tools.add(b.id);
            else this.tools.delete(b.id);
            changed();
          }),
        ),
    );
    return [
      this.info("Cliquez les corps dans la vue :"),
      el("div", { class: "flex gap-1.5", role: "group", "aria-label": "Ce que choisit un clic dans la vue" }, mode("target", "Cible"), mode("tools", "Corps outils")),
      this.info(this.choosing === "target" ? "Le corps cliqué devient la cible ; ensuite, les clics choisissent les corps outils." : "Un corps cliqué s'ajoute aux corps outils ; cliqué de nouveau, il en sort."),
      this.selectRow("Cible", this.target ?? "", [["", "— cliquez-la dans la vue —"], ...bodies.map((b): [string, string] => [b.id, b.name])], (v) => {
        this.target = v || undefined;
        if (v) this.tools.delete(v);
        changed();
      }),
      this.selectRow(
        "Opération",
        this.operation,
        operationChoices("join", "cut", "intersect"),
        (v) => {
          this.operation = v as CombineFeature["operation"];
          changed();
        },
      ),
      this.info(`Corps outils (${chosen.length}) :`),
      chosen.length ? el("ul", { class: "space-y-1", "aria-label": "Corps outils choisis" }, ...chosen) : null,
      list,
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
