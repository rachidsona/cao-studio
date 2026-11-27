/** Revolution, combination of bodies and hole-on-face tools (see panel-tool.ts). */
import { AXIS_X, AXIS_Y } from "../document/sketch";
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, CadDocument, CombineFeature, FaceRef, HoleFeature, RevolveFeature, SketchFeature, Vec3 } from "../document/types";
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

/**
 * The body that bodies combined into one make (`id`), with the material and the look of its target: it goes on looking
 * as the target did (nothing given to it when the target had none).
 */
export function withTargetLook(doc: CadDocument, id: string, target: string): CadDocument {
  const from = doc.bodyInfo?.[target];
  const kept = Object.fromEntries(Object.entries({ material: from?.material, appearance: from?.appearance, color: from?.color, layer: from?.layer }).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? { ...doc, bodyInfo: { ...doc.bodyInfo, [id]: { ...doc.bodyInfo?.[id], ...kept } } } : doc;
}

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
    // As Fusion's Combine: nothing is kept before OK (the tool then stays for another); « Terminer » leaves the model as it is.
    this.storesLive = false;
    this.ownButtons = true;
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
    // The tools of a cut in red (what is taken away), the others in blue.
    const role = this.operation === "cut" ? ("remove" as const) : ("second" as const);
    const tools = [...this.tools].filter((t) => t !== this.target).map((body) => ({ body, role }));
    this.ctx.viewport.setChosen([...(this.target ? [{ body: this.target, role: "first" as const }] : []), ...tools]);
  }

  /** A body clicked in the view: the target, or a tool added or taken away. */
  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    const next = pickBody({ target: this.target, tools: [...this.tools], choosing: this.choosing }, target.id, this.id);
    if (next.target === this.target && next.tools.length === this.tools.size && next.choosing === this.choosing && next.tools.every((t) => this.tools.has(t))) {
      if (target.id === this.target || target.id === this.id) this.ctx.notify("C'est la cible : cliquez le champ « Corps cible » pour en choisir une autre.", "info");
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

  /** The bodies made one (an union, not when editing): the body they make looks as its target did. */
  protected override decorate(doc: CadDocument): CadDocument {
    return this.operation === "join" && !this.editing && this.target ? withTargetLook(doc, this.id, this.target) : doc;
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
    const tools = [...this.tools].filter((t) => t !== this.target);
    // As Fusion's selection fields: the one that takes the next click is outlined in blue, ✕ empties it.
    const field = (which: "target" | "tools", label: string, shown: string, empty: boolean, clear: () => void) => {
      const on = this.choosing === which;
      const pick = el("button", { type: "button", class: `flex h-8 min-w-0 flex-1 items-center gap-1.5 border px-2 text-left ${on ? "border-sky-600 bg-sky-50 dark:border-sky-400 dark:bg-sky-950" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}`, "aria-pressed": String(on), "data-combine-pick": which, "data-combine-value": which === "target" ? (this.target ?? "") : tools.join(" "), title: `Cliquer puis choisir ${which === "target" ? "le corps cible" : "les corps outils"} dans la vue` }, el("span", { class: `size-2.5 shrink-0 ${which === "target" ? "bg-orange-500" : this.operation === "cut" ? "bg-red-500" : "bg-sky-500"}` }), el("span", { class: `truncate ${empty ? "text-gray-500 dark:text-gray-400" : ""}` }, shown));
      pick.addEventListener("click", () => ((this.choosing = which), this.render()));
      const cross = el("button", { type: "button", class: "size-8 shrink-0 border border-gray-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 dark:border-gray-600", disabled: empty, title: "Vider", "aria-label": `Vider : ${label}` }, "✕");
      cross.addEventListener("click", () => (clear(), changed()));
      return el("div", { class: "space-y-1" }, el("p", { class: "font-medium" }, label), el("div", { class: "flex gap-1" }, pick, cross));
    };
    const chosen = tools.map((id) => {
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
    // The operations side by side; « Sans le commun »: the part in common taken away from each body, all kept;
    // « Limiter »: the target stops at the tools, which stay whole.
    const ops: [CombineFeature["operation"], string, string][] = [["join", "∪", "Joindre"], ["cut", "−", "Couper"], ["intersect", "∩", "Intersection"], ["exclude", "⊖", "Sans le commun"], ["limit", "⊣", "Limiter"]];
    const operation = el("div", { class: "grid grid-cols-3 gap-1", role: "group", "aria-label": "Opération" }, ...ops.map(([op, sign, label]) => {
      const on = this.operation === op;
      const b = el("button", { type: "button", "aria-pressed": String(on), "data-combine-op": op, class: `flex h-12 flex-col items-center justify-center border text-2xs font-medium ${on ? "border-sky-600 bg-sky-50 text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-200" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, el("span", { class: "text-lg leading-none" }, sign), label);
      b.addEventListener("click", () => ((this.operation = op), changed()));
      return b;
    }));
    const problem = this.blocker() ?? (typeof this.feature() === "string" ? (this.feature() as string) : null);
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: problem !== null, "data-combine-ok": "" }, "OK");
    ok.addEventListener("click", () => this.finish());
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Fermer l'outil ; ce qui n'a pas eu son OK n'est pas gardé (Échap)", "data-panel-done": "" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    return [
      field("target", "Corps cible", this.target ? name(this.target) : "Sélectionner", !this.target, () => ((this.target = undefined), (this.choosing = "target"))),
      field("tools", "Corps outils", tools.length ? `${tools.length} sélectionné${tools.length > 1 ? "s" : ""}` : "Sélectionner", !tools.length, () => (this.tools.clear(), (this.choosing = "tools"))),
      chosen.length ? el("ul", { class: "space-y-1", "aria-label": "Corps outils choisis" }, ...chosen) : null,
      list,
      el("p", { class: "font-medium" }, "Opération"),
      operation,
      this.operation === "exclude"
        ? this.info("Chaque corps perd la partie qu'il a en commun avec les autres ; tous restent.")
        : this.operation === "limit"
          ? this.info("Le corps cible s'arrête aux corps outils (une étagère au côté qu'elle traverse) : ce qui dépasse est ôté ; les outils restent entiers.")
          : this.checkRow("Conserver les corps outils", this.keepTools, (on) => {
            this.keepTools = on;
            changed();
          }),
      this.info(this.choosing === "target" ? "Cliquez le corps cible dans la vue ; ensuite, les clics choisissent les corps outils." : "Un corps cliqué s'ajoute aux corps outils ; cliqué de nouveau, il en sort."),
      el("div", { class: "flex gap-1.5" }, cancel, ok),
    ];
  }

  /** OK (or Entrée): the combination kept, in one undo step; nothing whole yet, it says what is missing. */
  protected override finish(): void {
    const built = this.feature();
    if (typeof built === "string") return this.ctx.notify(built, "info");
    super.finish();
  }

  /** The kernel cannot combine so (no overlap to cut or keep): OK waits. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Ces corps ne se combinent pas ainsi.") : null;
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
