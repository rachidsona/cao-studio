/**
 * « Plan de cuisine » : une cuisine commence par son plan vu de dessus, comme un dressing (app/plan-layout-tool.ts). On
 * choisit un modèle — droite, en L, en U, en G avec une péninsule, parallèle, avec ou sans îlot —, on règle ses cotes ou on
 * pose son mur A sur la Pièce relevée, et OK pose l'esquisse « Plan de la cuisine ». Chaque linéaire se clique ensuite,
 * dans le schéma ou la liste, et s'aménage meuble par meuble sur sa bande de face (app/kitchen-run-editor.ts) ;
 * « Proposer une cuisine » les remplit tous comme l'Implantation. OK refait la cuisine 3D entière, en une annulation, et
 * « Modifier le plan » la fait suivre. Cliquer l'esquisse du plan, ou un meuble fait par lui, rouvre l'outil.
 */
import { SPACE } from "../../features/kitchen-run-items";
import { withCaissonsPlaced } from "../../document/cabinet-furnish";
import * as THREE from "three";
import { kitchenPlanIn, kitchenPlanOf, kitchenRunOf, kitchenStarted, runsLost, withKitchenBuilt, withKitchenChanged, withKitchenPlan } from "../../document/kitchen-floor";
import { kitchenFromPlan } from "../../document/kitchen-plan-build";
import { kitchenMarks, kitchenRoomInfo, linkedKitchen, unlinkedKitchen } from "../../document/kitchen-plan-room";
import { CORNER_KINDS, type CornerSetting } from "../../document/kitchen-corners";
import { cornerKind, KITCHEN_MODELS, KITCHEN_PLAN, kitchenJoints, type CornerKind, kitchenPlanProblem, kitchenRuns, runGeometry, type KitchenField, type KitchenModel, type KitchenRun } from "../../document/kitchen-plan-shapes";
import { proposeKitchen } from "../../document/kitchen-propose";
import type { CatalogEntry } from "../../document/kitchen-catalog";
import { MATERIALS } from "../../document/materials";
import { bodyOrigin, findFeature } from "../../document/operations";
import { planRooms } from "../../document/plan-room";
import { featureOfBody, type KitchenFloorPlan, type SketchFeature } from "../../document/types";
import { wallName } from "../../features/room-plan";
import { turn } from "../../features/room-runs";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { askConfirm } from "../../ui/confirm-dialog";
import { hasDock, placePanel, showPanel } from "../../ui/dock";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { kitchenSchema } from "./kitchen-plan-schema";
import { RunEditor } from "./kitchen-run-editor";
import { endPreview, previewRun, shownDoc } from "./kitchen-run-preview";
import { Folds } from "../../ui/fold";
import { paintPrice, quoteButton } from "../workshop/live-price";
import { isolatedSketch, isolateFeatures, showAll } from "../zone-view";
import { RunDimsView } from "./kitchen-run-dims-view";
import { runDims } from "../../document/kitchen-run-dims";
import { withRunDim } from "../../document/kitchen-dim-edit";
import { editValue } from "../dim-editor";
import { addNormalizer } from "../doc-normalizers";
import { syncKitchenPlans } from "../../document/kitchen-sync";
import { appliancesFollow } from "../../document/appliance-follow";

const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: the last plan set. */
let last: KitchenFloorPlan = { ...KITCHEN_PLAN };

/** The run open in the Plan de cuisine, for « Meubles de cuisine » (app/kitchen-units.ts). */
export interface OpenRun {
  plan: string;
  run: string;
  /** The unit chosen on its strip. */
  chosen: string | null;
  /** Changed and not yet applied: a unit added goes in with the rest, at OK. */
  dirty: boolean;
  add(entry: CatalogEntry): void;
}
let current: KitchenPlanTool | null = null;
/** The run seen alone in the view, with its dimensions. */
let seen: { plan: string; run: string } | null = null;
export const kitchenRunOpen = (): OpenRun | null => current?.openRunInfo() ?? null;

type Sized = KitchenField | "lengthA" | "height" | "depth" | "wallDepth" | "worktopHeight" | "islandLength" | "islandDepth" | "passage" | "plinth" | "worktopThickness";
type Switch = "wallUnits" | "appliances" | "fridge" | "ovenColumn" | "splashback" | "kick";

export class KitchenPlanTool {
  private plan: KitchenFloorPlan = { ...last };
  private editing = false;
  private runEditor: RunEditor | null = null;
  private runPlan: string | null = null;
  private readonly folds = new Folds(() => this.draw());
  readonly panel: HTMLElement;
  private drawn: unknown = null;
  private drawnIsolated: string | null = null;
  private hadPlan = false;

  constructor(
    private readonly editor: Editor,
    container: HTMLElement,
    private readonly closed: () => void,
    /** The sketch of the plan to show; absent: the one of the project. */
    readonly chosen?: string,
    quiet = false,
    run?: string,
    /** All the model in view, when the kitchen stands out of it. */
    private readonly frame: () => void = () => {},
  ) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-80 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Plan de cuisine",
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(container, this.panel, { first: true, quiet });
    const placed = this.placed();
    const zone = placed && run ? kitchenRuns(kitchenPlanIn(this.editor.doc, placed.id)!).find((r) => r.id === run) : undefined;
    if (placed && zone) this.openRun(placed.id, zone, false);
    else this.draw();
  }

  /** The run being worked on, with changes not yet applied. */
  get busy(): string | null {
    return this.runEditor?.dirty ? this.runEditor.runId : null;
  }

  refresh(): void {
    // The isolation ended from the view's bar: the panel shows it.
    const changed = this.editor.doc !== this.drawn;
    if (!changed && isolatedSketch() === this.drawnIsolated) return;
    if (this.hadPlan && !this.placed()) return this.close();
    // A run untouched follows the project (a unit added from « Meubles de cuisine », an undo).
    const open = changed && this.runEditor && !this.runEditor.dirty && this.runPlan ? kitchenPlanIn(this.editor.doc, this.runPlan) : undefined;
    const run = open && kitchenRuns(open).find((r) => r.id === this.runEditor?.runId);
    if (changed && this.runEditor && !this.runEditor.dirty) {
      if (run) return this.openRun(this.runPlan!, run, false, this.runEditor.chosenItem);
      this.runEditor = null;
    }
    // The project changed under a run being changed: its preview is made again on it.
    if (changed && this.runEditor?.dirty && this.runPlan) void previewRun(this.editor, this.runPlan, this.runEditor.runId, this.runEditor.pending());
    this.draw();
  }

  openRunInfo(): OpenRun | null {
    const editor = this.runEditor;
    if (!editor || !this.runPlan) return null;
    return { plan: this.runPlan, run: editor.runId, chosen: editor.chosenItem, dirty: editor.dirty, add: (entry) => editor.addEntry(entry) };
  }

  close(): void {
    void endPreview(this.editor);
    this.panel.remove();
    this.closed();
  }

  private placed(): SketchFeature | undefined {
    const chosen = this.chosen ? findFeature(this.editor.doc, this.chosen) : undefined;
    return chosen?.type === "sketch" && chosen.kitchenPlan ? chosen : kitchenPlanOf(this.editor.doc);
  }

  private draw(): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type !== "checkbox" && this.panel.contains(active)) return;
    const placed = this.placed();
    this.drawn = this.editor.doc;
    this.drawnIsolated = isolatedSketch();
    this.hadPlan ||= !!placed;
    const plan = placed ? kitchenPlanIn(this.editor.doc, placed.id) : undefined;
    if (placed && plan && this.runEditor) this.panel.replaceChildren(...this.runEditor.render());
    else this.panel.replaceChildren(...(placed && plan && !this.editing ? this.runs(placed.id, plan) : this.settings(placed?.id)));
    paintPrice();
  }

  // ---- the model and its sizes --------------------------------------------------------

  private set(patch: Partial<KitchenFloorPlan>): void {
    this.plan = last = { ...this.plan, ...patch };
    this.draw();
  }

  private number(label: string, key: Sized): HTMLElement {
    const unit = this.editor.unit;
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(this.plan[key] ?? KITCHEN_PLAN[key] ?? 0, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && parsed > 0;
      input.setAttribute("aria-invalid", String(!ok));
      if (ok && fromDisplay(parsed, unit) !== this.plan[key]) this.set({ [key]: fromDisplay(parsed, unit) });
    };
    input.addEventListener("change", apply);
    input.addEventListener("blur", () => this.draw());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        input.blur();
      }
    });
    return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
  }

  /** A setting on or off, as the Implantation's (an absent one at its usual value). */
  private check(label: string, key: Switch): HTMLElement {
    const box = el("input", { type: "checkbox", class: "size-4 shrink-0 accent-sky-600", checked: (this.plan[key] ?? KITCHEN_PLAN[key]) === true, "data-plan-switch": key });
    box.addEventListener("change", () => this.set({ [key]: box.checked }));
    return el("label", { class: "flex min-h-7 items-center gap-2" }, box, label);
  }

  private select(label: string, value: string, options: [string, string][], change: (v: string) => void): HTMLElement {
    const choice = el("select", { class: SELECT, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
    choice.addEventListener("change", () => change(choice.value));
    return el("label", { class: ROW }, label, choice);
  }

  private settings(planId?: string): HTMLElement[] {
    const plan = this.plan;
    const model = KITCHEN_MODELS[plan.model];
    const models = el(
      "div",
      { class: "grid grid-cols-4 gap-1", role: "group", "aria-label": "Modèles" },
      ...(Object.keys(KITCHEN_MODELS) as KitchenModel[]).map((key) => {
        const button = el("button", { type: "button", title: KITCHEN_MODELS[key].label, "aria-label": KITCHEN_MODELS[key].label, "aria-pressed": String(key === plan.model), class: `border p-1 ${key === plan.model ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, kitchenSchema({ ...KITCHEN_PLAN, model: key }, null));
        button.addEventListener("click", () => this.set({ model: key }));
        return button;
      }),
    );
    const problem = kitchenPlanProblem(plan);
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, this.editing ? "Annuler" : "Terminer");
    cancel.addEventListener("click", () => {
      if (!this.editing) return this.close();
      this.editing = false;
      this.draw();
    });
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: problem !== null }, this.editing ? "Appliquer" : "Créer le plan");
    ok.addEventListener("click", () => void (this.editing && planId ? this.change(planId) : this.create()));
    const materials = MATERIALS.filter((m) => m.id !== "hdf").map((m): [string, string] => [m.id, m.name]);
    const island = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: plan.island === true, "aria-label": "Îlot" });
    island.addEventListener("change", () => this.set({ island: island.checked }));
    const islandRows = plan.island && !model.noIsland;
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, "Plan de cuisine"),
      models,
      el("p", { class: "font-medium text-gray-700 dark:text-gray-200" }, model.label),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, problem ? null : kitchenSchema(plan, (r) => [r.label, formatLength(r.zone.run.length, this.editor.unit)], undefined, {}, kitchenMarks(this.editor.doc, plan))),
      this.roomChoice(),
      ...kitchenJoints(plan).map(({ joint, label, walls }) => this.select(label, plan.through?.[joint] ? "1" : "0", walls.map((w, i): [string, string] => [String(i), `${w} passe`]), (v) => this.set({ through: { ...plan.through, [joint]: v === "1" } }))),
      ...kitchenJoints(plan).map(({ joint }) => this.select(`Dans l'angle, à ${joint === "left" ? "gauche" : "droite"}`, cornerKind(plan, joint), (Object.keys(CORNER_KINDS) as CornerKind[]).map((k): [string, string] => [k, CORNER_KINDS[k].label]), (v) => this.set({ corners: { ...plan.corners, [joint]: v as CornerKind } }))),
      plan.room ? el("p", { class: "text-gray-600 dark:text-gray-300" }, `Cotes de la pièce : mur A ${formatLength(plan.lengthA, this.editor.unit)}, plafond ${formatLength(plan.height, this.editor.unit)}.`) : this.number("Longueur mur A", "lengthA"),
      ...(Object.entries(model.fields) as [KitchenField, string][]).filter(([key]) => !plan.room || key === "lengthD" || key === "aisle").map(([key, label]) => this.number(label, key)),
      plan.room ? null : this.number("Hauteur sous plafond", "height"),
      this.number("Profondeur des bas", "depth"),
      this.number("Profondeur des hauts", "wallDepth"),
      this.number("Hauteur du plan de travail", "worktopHeight"),
      this.number("Épaisseur du plan de travail", "worktopThickness"),
      this.number("Socle", "plinth"),
      model.noIsland ? null : el("label", { class: "flex min-h-8 items-center gap-2" }, island, "Îlot face au mur A"),
      islandRows ? this.number("Passage devant l'îlot", "passage") : null,
      islandRows ? this.number("Longueur de l'îlot", "islandLength") : null,
      islandRows ? this.number("Profondeur de l'îlot", "islandDepth") : null,
      this.select("Façades", plan.frontMaterial ?? "lacquer-white", materials, (v) => this.set({ frontMaterial: v })),
      this.select("Plan de travail en", plan.worktopMaterial ?? "solid-oak", materials, (v) => this.set({ worktopMaterial: v })),
      this.check("Crédence", "splashback"),
      this.check("Plinthes", "kick"),
      el("p", { class: "pt-1 font-semibold text-gray-700 dark:text-gray-200" }, "Pour « Proposer une cuisine »"),
      el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "Comme dans l'Implantation ; ils servent quand vous cliquez « Proposer une cuisine »."),
      this.select("Façades des bas", plan.fronts ?? "mixed", [["mixed", "Tiroirs et portes, en alternance"], ["drawers", "Tiroirs partout"], ["doors", "Portes partout"]], (v) => this.set({ fronts: v as KitchenFloorPlan["fronts"] })),
      this.check("Meubles hauts au-dessus", "wallUnits"),
      this.check("Électroménager (évier, lave-vaisselle, plaque, four, hotte)", "appliances"),
      this.check("Colonne réfrigérateur", "fridge"),
      plan.appliances !== false ? this.check("Four en colonne (sinon sous la plaque)", "ovenColumn") : null,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** The surveyed room it stands in: wall A on one of its walls, or the sizes typed here. */
  private roomChoice(): HTMLElement | null {
    const rooms = planRooms(this.editor.doc);
    if (!rooms.length) return null;
    const current = this.plan.room ? `${this.plan.room.id}:${this.plan.room.wall}` : "";
    const options: [string, string][] = [["", "Cotes tapées ici"], ...rooms.flatMap((room) => room.walls.map((_, i): [string, string] => [`${room.id}:${i}`, `${room.name}, ${wallName(i)}`]))];
    return this.select("Mur A dans la pièce", current, options, (value) => {
      const [id, wall] = value.split(":");
      const room = rooms.find((r) => r.id === id);
      const next = room ? linkedKitchen(this.plan, room, Number(wall)) : unlinkedKitchen(this.plan);
      if (typeof next === "string") return this.editor.notify(next, "error");
      this.set(next);
    });
  }

  private async create(): Promise<void> {
    const problem = kitchenPlanProblem(this.plan);
    if (problem) return this.editor.notify(problem, "error");
    await this.editor.change(withKitchenPlan(this.editor.doc, { ...this.plan, runs: {}, made: {} }).doc);
    this.editor.notify("Plan de la cuisine posé : cliquez un linéaire pour l'aménager, ou « Proposer une cuisine ».", "success");
    this.draw();
  }

  private async change(planId: string): Promise<void> {
    const lost = runsLost(this.editor.doc, planId, this.plan);
    if (lost.length && !(await askConfirm(`Ce plan n'a plus : ${lost.join(", ")}. Ses meubles seront supprimés. Continuer ?`, "Appliquer"))) return;
    const made = withKitchenChanged(this.editor.doc, planId, this.plan);
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.editor.notify(made.problems.length ? `Plan modifié. ${made.problems.join(" ")}` : "Plan modifié : la cuisine a suivi.", made.problems.length ? "info" : "success");
    this.editing = false;
    this.draw();
  }

  // ---- the runs of the plan -----------------------------------------------------------

  private runs(planId: string, plan: KitchenFloorPlan): HTMLElement[] {
    const doc = this.editor.doc;
    const unit = this.editor.unit;
    const room = kitchenRoomInfo(doc, plan);
    const layout = kitchenFromPlan(plan, room);
    const row = (run: KitchenRun) => {
      const count = plan.runs?.[run.id]?.length ?? 0;
      // The places kept (a unit pushed, a caisson furnished by hand) are not free.
      const kept = (plan.runs?.[run.id] ?? []).filter((i) => i.model === SPACE).reduce((sum, i) => sum + i.width, 0);
      const free = Math.max(0, (layout.fills[run.id]?.free ?? []).reduce((sum, [a, b]) => sum + b - a, 0) - kept);
      const go = el("button", { type: "button", class: SMALL, "data-open-run": run.id }, "Aménager");
      go.addEventListener("click", () => this.openRun(planId, run));
      const see = el("button", { type: "button", class: SMALL, "data-see-run": run.id, title: "Isole ce linéaire, de face, avec ses cotes", disabled: !(plan.made?.[run.id]?.length) }, "Voir");
      see.addEventListener("click", () => this.seeRun(planId, run));
      return el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "min-w-0 flex-1" }, `${run.label} · ${formatLength(run.zone.run.length, unit)}${count ? ` · ${count} meuble${count > 1 ? "s" : ""}${free > 0 ? ` · ${formatLength(free, unit)} libres` : ""}` : ""}`), see, go);
    };
    const propose = el("button", { type: "button", class: WIDE, "data-propose": "" }, "Proposer une cuisine");
    propose.title = "Remplit tous les linéaires comme l'Implantation : modules de 60 cm d'abord, puis le plus grand qui tient, un fileur, l'électroménager à sa place";
    propose.addEventListener("click", () => void this.propose(planId, plan));
    const change = el("button", { type: "button", class: WIDE }, "Modifier le plan");
    change.addEventListener("click", () => {
      this.plan = { ...plan };
      this.editing = true;
      this.draw();
    });
    const finish = el("button", { type: "button", class: WIDE }, "Terminer");
    finish.addEventListener("click", () => (hasDock() ? showPanel("properties") : this.close()));
    const warn = kitchenStarted(plan) ? [...layout.ergonomics.warn, ...layout.notes] : [];
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, "Plan de cuisine"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Cliquez un linéaire pour l'aménager meuble par meuble."),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, kitchenSchema(plan, (r) => [r.label], (r) => this.openRun(planId, r), layout.fills, kitchenMarks(doc, plan))),
      el("ul", { class: "space-y-1", "aria-label": "Linéaires du plan" }, ...kitchenRuns(plan).map(row)),
      propose,
      isolatedSketch() === planId ? showAllButton(() => this.draw()) : null,
      // Titled parts fold, one open at a time, all closed at first.
      kitchenStarted(plan) && layout.ergonomics.ok.length ? this.folds.fold("ergonomics", `Ergonomie (${layout.ergonomics.ok.length})`, () => layout.ergonomics.ok.map((m) => el("p", { class: "text-emerald-700 dark:text-emerald-300" }, `• ${m}`))) : null,
      warn.length ? this.folds.fold("checks", `À revoir (${warn.length})`, () => warn.map((m) => el("p", { class: "text-amber-900 dark:text-amber-100" }, m))) : null,
      this.folds.fold("price", "Prix du projet", () => [quoteButton()], el("span", { class: "font-mono font-medium", "data-live-total": "" })),
      change,
      finish,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  private async propose(planId: string, plan: KitchenFloorPlan): Promise<void> {
    if (kitchenStarted(plan) && !(await askConfirm("Les linéaires seront remplis à nouveau : ce qui y est posé sera remplacé. Continuer ?", "Proposer"))) return;
    const made = withKitchenBuilt(this.editor.doc, planId, proposeKitchen(plan, kitchenRoomInfo(this.editor.doc, plan)));
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.frame();
    this.editor.notify(made.problems.length ? `Cuisine proposée. ${made.problems.join(" ")}` : "Cuisine proposée : retouchez chaque linéaire en le cliquant.", made.problems.length ? "info" : "success");
    this.draw();
  }

  /** A run alone in the view, from the front, with its sizes; it stays so as the kitchen is made again. */
  seeRun(planId: string, run: KitchenRun): void {
    const plan = kitchenPlanIn(this.editor.doc, planId);
    if (!plan?.made?.[run.id]?.length) return this.editor.notify(`${run.label} n'a encore rien de bâti : aménagez-le d'abord.`, "info");
    const [nx, ny] = run.zone.run.normal;
    const front = turn(plan.place ?? { quarter: 0, origin: [0, 0] }, [nx, ny, 0]);
    seen = { plan: planId, run: run.id };
    isolateFeatures(planId, run.label, () => new Set(kitchenPlanIn(shownDoc(this.editor), planId)?.made?.[run.id] ?? []), front);
    this.draw();
  }

  /** A run opened in its editor, on the plan as it is in the project. */
  openRun(planId: string, run: KitchenRun, show = true, chosen: string | null = null): void {
    const plan = kitchenPlanIn(this.editor.doc, planId);
    if (!plan) return;
    this.runPlan = planId;
    // Another wall opened while one is isolated: it is the one seen.
    if (show && seen && seen.run !== run.id && isolatedSketch() === planId) this.seeRun(planId, run);
    this.runEditor = new RunEditor({
      editor: this.editor, plan, run, room: kitchenRoomInfo(this.editor.doc, plan), chosen,
      redraw: () => this.draw(),
      changed: () => void previewRun(this.editor, planId, run.id, this.runEditor!.pending()),
      back: () => ((this.runEditor = null), void endPreview(this.editor), this.draw()),
      apply: (items, rest, corners) => void this.applyRun(planId, run, items, rest, corners),
      runs: kitchenRuns(plan),
      go: (id) => void this.goRun(planId, run, id),
      see: () => this.seeRun(planId, run),
      seen: () => isolatedSketch() === planId && seen?.run === run.id,
    });
    if (show) showPanel(this.panel);
    this.draw();
  }

  /** Another run opened from this one; its changes, if any, applied first when one says so. */
  private async goRun(planId: string, from: KitchenRun, to: string): Promise<void> {
    const editor = this.runEditor;
    const target = () => {
      const plan = kitchenPlanIn(this.editor.doc, planId);
      return plan && kitchenRuns(plan).find((r) => r.id === to);
    };
    if (editor?.dirty) {
      const next = target();
      if (!(await askConfirm(`Les changements de « ${from.label} » ne sont pas appliqués : les appliquer, puis voir « ${next?.label ?? to} » ?`, "Appliquer"))) return;
      if (!(await this.applyRun(planId, from, ...editor.pending()))) return;
    }
    const run = target();
    if (run) this.openRun(planId, run);
  }

  private async applyRun(planId: string, run: KitchenRun, items: NonNullable<KitchenFloorPlan["runs"]>[string], rest: NonNullable<KitchenFloorPlan["rest"]>[string], corners: CornerSetting): Promise<boolean> {
    const plan = kitchenPlanIn(this.editor.doc, planId);
    if (!plan) return false;
    const built = withKitchenBuilt(this.editor.doc, planId, { runs: { ...plan.runs, [run.id]: items }, rest: { ...plan.rest, [run.id]: rest }, ...corners });
    if (typeof built === "string") {
      this.editor.notify(built, "error");
      return false;
    }
    // « Mes caissons » made in their places.
    const placed = withCaissonsPlaced(built.doc, planId);
    const made = { doc: placed.doc, problems: [...built.problems, ...placed.problems.map((m) => `${run.label} : ${m}`)] };
    this.runEditor = null;
    await this.editor.change(made.doc);
    await endPreview(this.editor);
    if (!kitchenStarted(plan)) this.frame();
    const own = made.problems.filter((m) => m.startsWith(`${run.label} :`));
    this.editor.notify(own.length ? `${run.label} aménagé. ${own.join(" ")}` : `${run.label} aménagé : la cuisine est refaite.`, own.length ? "info" : "success");
    this.draw();
    return true;
  }
}

/** « Tout montrer »: everything back in the view. */
function showAllButton(after: () => void): HTMLElement {
  const b = el("button", { type: "button", class: WIDE, "data-show-all": "" }, "Tout montrer");
  b.addEventListener("click", () => (showAll(), after()));
  return b;
}

export function bindKitchenPlan(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  // A unit the plan made, changed in the 3D: the plan follows it, in the same undo. A cabinet moved, by hand or by the
  // kitchen made again, takes its appliances along (before, so the plan keeps their cuts where they went, and after).
  addNormalizer((prev, next) => appliancesFollow(prev, next));
  addNormalizer(syncKitchenPlans);
  addNormalizer((prev, next) => appliancesFollow(prev, next, false));
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  // The dimensions of the run seen alone, as long as it is.
  const dims = new RunDimsView(viewport);
  const paintDims = () => {
    // The run being changed is seen as it would be.
    const doc = shownDoc(editor);
    const plan = seen && isolatedSketch() === seen.plan ? kitchenPlanIn(doc, seen.plan) : undefined;
    const run = plan && kitchenRuns(plan).find((r) => r.id === seen!.run);
    if (!plan || !run) return dims.clear();
    const room = kitchenRoomInfo(doc, plan);
    const fill = kitchenFromPlan(plan, room).fills[run.id];
    if (!fill) return dims.clear();
    const at = seen!;
    dims.show(plan, run, runDims(plan, run, runGeometry(plan, run, room?.[run.id]), fill), editor.unit, (label, d) => {
      // Typed while a run has changes not applied: they would be lost.
      if (current?.openRunInfo()?.dirty) return editor.notify("Un linéaire a des changements pas encore appliqués : faites OK ou Annuler d'abord.", "error");
      editValue(editor, label, d.b - d.a, (mm) => withRunDim(editor.doc, at.plan, at.run, d.edit!, mm));
    });
  };
  let tool: KitchenPlanTool | null = null;
  const frame = () => {
    const box = new THREE.Box3();
    for (const id of viewport.displayedBodies) {
      const m = viewport.bodyMesh(id)?.metrics.bbox;
      if (m) box.expandByPoint(new THREE.Vector3(...m[0])).expandByPoint(new THREE.Vector3(...m[1]));
    }
    if (!box.isEmpty() && !viewport.boxVisible(box, 0.8)) viewport.fitBox(box, 1.2);
  };
  const open = (chosen?: string, quiet = false, run?: string) => {
    tool?.close();
    tool = current = new KitchenPlanTool(editor, container, () => (tool = current = null), chosen, quiet, run, frame);
  };
  /** A sketch of a plan chosen: its tool; a body it made: its run, unless another is being changed. */
  const show = (sketchId: string | undefined, bodyId: string | undefined) => {
    if (editor.sketches.active || viewport.inSketch) return;
    const sketch = sketchId ? findFeature(editor.doc, sketchId) : undefined;
    if (sketch?.type === "sketch" && sketch.kitchenPlan) return tool?.chosen === sketch.id && !tool.busy ? showPanel(tool.panel) : tool?.busy ? undefined : open(sketch.id);
    const owner = bodyId ? kitchenRunOf(editor.doc, featureOfBody(bodyOrigin(editor.doc, bodyId))) : null;
    if (!owner || (tool?.busy && tool.busy !== owner.run)) return;
    if (tool?.busy === owner.run) return showPanel(tool.panel);
    const plan = kitchenPlanIn(editor.doc, owner.plan);
    const run = plan && kitchenRuns(plan).find((r) => r.id === owner.run);
    if (!run) return;
    if (tool && (tool.chosen ?? kitchenPlanOf(editor.doc)?.id) === owner.plan) tool.openRun(owner.plan, run);
    else open(owner.plan, false, owner.run);
  };
  root.querySelector('[data-workshop="kitchen-plan"]')?.addEventListener("click", () => open());
  root.addEventListener("cad:feature-selected", (event) => show((event as CustomEvent<string | null>).detail ?? undefined, undefined));
  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    show(selection.sketches[0] ?? selection.sketch[0]?.sketchId, selection.bodies[0] ?? selection.faces[0]?.bodyId);
  };
  const rendered = editor.onRender;
  editor.onRender = () => {
    rendered();
    paintDims();
    if (tool) tool.refresh();
    else if (hasDock() && kitchenPlanOf(editor.doc)) open(undefined, true);
  };
}
