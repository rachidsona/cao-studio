/**
 * « Plan de cuisine » : une cuisine commence par son plan vu de dessus, comme un dressing (app/plan-layout-tool.ts). On
 * choisit un modèle — droite, en L, en U, en G avec une péninsule, parallèle, avec ou sans îlot —, on règle ses cotes ou on
 * pose son mur A sur la Pièce relevée, et OK pose l'esquisse « Plan de la cuisine ». Chaque linéaire se clique ensuite,
 * dans le schéma ou la liste, et s'aménage meuble par meuble sur sa bande de face (app/kitchen-run-editor.ts) ;
 * « Proposer une cuisine » les remplit tous comme l'Implantation. OK refait la cuisine 3D entière, en une annulation, et
 * « Modifier le plan » la fait suivre. Cliquer l'esquisse du plan, ou un meuble fait par lui, rouvre l'outil.
 */
import { openKitchenDossier } from "./kitchen-dossier-view";
import { SPACE } from "../../features/kitchen-run-items";
import { withCaissonsPlaced } from "../../document/cabinet-furnish";
import * as THREE from "three";
import { kitchenPlanIn, kitchenPlanOf, kitchenRunOf, kitchenStarted, runsLost, withKitchenBuilt, withKitchenChanged, withKitchenPlan } from "../../document/kitchen-floor";
import { kitchenFromPlan } from "../../document/kitchen-plan-build";
import { kitchenMarks, kitchenRoomInfo, linkedKitchen, unlinkedKitchen } from "../../document/kitchen-plan-room";
import { planOnRoom } from "../../document/kitchen-room-fix";
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
import { asCards, panelHeader, zoneCard } from "../../ui/panel-close";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { kitchenSchema } from "./kitchen-plan-schema";
import { RunEditor } from "./kitchen-run-editor";
import { planFields, wallsCheck } from "./kitchen-plan-fields";
import { runFeatures } from "../../document/caisson-follow";
import { endPreview, previewRun, shownDoc } from "./kitchen-run-preview";
import { Folds } from "../../ui/fold";
import { paintPrice, quoteButton } from "../workshop/live-price";
import { isolatedSketch, isolateFeatures, showAll } from "../zone-view";
import { RunDimsView } from "./kitchen-run-dims-view";
import { runDims } from "../../document/kitchen-run-dims";
import { withRunDim } from "../../document/kitchen-dim-edit";
import { editValue } from "../dim-editor";

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
  add(entry: CatalogEntry): void; show(fold: string, item?: string): void;
}
let current: KitchenPlanTool | null = null;
/** « Cotes tapées ici » chosen: a new plan is no longer put on the room by itself (kept for the visit). */
let typed = false;
/** The run seen alone in the view, with its dimensions. */
let seen: { plan: string; run: string } | null = null;
export const kitchenRunOpen = (): OpenRun | null => current?.openRunInfo() ?? null;

export class KitchenPlanTool {
  private plan: KitchenFloorPlan = { ...last };
  private editing = false;
  /** A setting of the plan being changed, waiting to be applied. */
  private changeTimer: number | undefined;
  private runEditor: RunEditor | null = null;
  /** A change of the run waiting to be stored. */
  private runTimer: number | undefined;
  private runPlan: string | null = null;
  private readonly folds = new Folds(() => this.draw());
  /** The fields of the plan's form. */
  private readonly fields = planFields({ plan: () => this.plan, unit: () => this.editor.unit, set: (patch) => this.set(patch), draw: () => this.draw() });
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
    // A room surveyed: the new plan stands on its walls, as a magnet — not in them (document/kitchen-room-fix.ts).
    if (!placed && !typed) this.plan = planOnRoom(this.editor.doc, this.plan);
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
      if (run) return this.openRun(this.runPlan!, run, false, this.runEditor.chosenItem, this.runEditor.openFold, this.runEditor.otherChosen);
      this.runEditor = null;
    }
    // The project changed under a run being changed: its preview is made again on it.
    if (changed && this.runEditor?.dirty && this.runPlan) void previewRun(this.editor, this.runPlan, this.runEditor.runId, this.runEditor.pending());
    this.draw();
  }

  openRunInfo(): OpenRun | null {
    const editor = this.runEditor;
    if (!editor || !this.runPlan) return null;
    return { plan: this.runPlan, run: editor.runId, chosen: editor.chosenItem, dirty: editor.dirty, add: (entry) => editor.addEntry(entry), show: (fold, item) => editor.show(fold, item) };
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
    else this.panel.replaceChildren(...(placed && plan && !this.editing ? this.runs(placed.id, plan) : this.settings(placed?.id))), asCards(this.panel);
    paintPrice();
  }

  // ---- the model and its sizes --------------------------------------------------------

  private set(patch: Partial<KitchenFloorPlan>): void {
    const next = { ...this.plan, ...patch };
    // On a room, another shape takes its sizes from its own walls.
    this.plan = last = patch.model && next.room ? planOnRoom(this.editor.doc, next) : next;
    this.draw();
    const placed = this.placed();
    if (this.editing && placed) this.changeSoon(placed.id);
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
    // A plan being changed takes each setting at once (no « Appliquer »); the cross goes back to its zones. A new one
    // is made by « Créer le plan ».
    const close = () => {
      if (!this.editing) return this.close();
      this.editing = false;
      this.draw();
    };
    const ok = this.editing ? null : el("button", { type: "button", class: "h-8 w-full btn-accent font-medium disabled:opacity-40", disabled: problem !== null }, "Créer le plan");
    ok?.addEventListener("click", () => void this.create());
    const materials = MATERIALS.filter((m) => m.id !== "hdf").map((m): [string, string] => [m.id, m.name]);
    const island = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: plan.island === true, "aria-label": "Îlot" });
    island.addEventListener("change", () => this.set({ island: island.checked }));
    const islandRows = plan.island && !model.noIsland;
    const rows: (HTMLElement | null)[] = [
      panelHeader("Plan de cuisine", close),
      el("h3", { class: "panel-title" }, "Modèle"), models,
      el("p", { class: "font-medium text-gray-700 dark:text-gray-200" }, model.label),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, problem ? null : kitchenSchema(plan, (r) => [r.label, formatLength(r.zone.run.length, this.editor.unit)], undefined, {}, kitchenMarks(this.editor.doc, plan))),
      this.roomChoice(),
      ...kitchenJoints(plan).map(({ joint, label, walls }) => this.fields.select(label, plan.through?.[joint] ? "1" : "0", walls.map((w, i): [string, string] => [String(i), `${w} passe`]), (v) => this.set({ through: { ...plan.through, [joint]: v === "1" } }))),
      ...kitchenJoints(plan).map(({ joint }) => this.fields.select(`Dans l'angle, à ${joint === "left" ? "gauche" : "droite"}`, cornerKind(plan, joint), (Object.keys(CORNER_KINDS) as CornerKind[]).map((k): [string, string] => [k, CORNER_KINDS[k].label]), (v) => this.set({ corners: { ...plan.corners, [joint]: v as CornerKind } }))),
      el("h3", { class: "panel-title" }, "Cotes"), plan.room ? el("p", { class: "text-gray-600 dark:text-gray-300" }, `Cotes de la pièce : mur A ${formatLength(plan.lengthA, this.editor.unit)}, plafond ${formatLength(plan.height, this.editor.unit)}.`) : this.fields.number("Longueur mur A", "lengthA"),
      ...(Object.entries(model.fields) as [KitchenField, string][]).filter(([key]) => !plan.room || key === "lengthD" || key === "aisle").map(([key, label]) => this.fields.number(label, key)),
      plan.room ? null : this.fields.number("Hauteur sous plafond", "height"),
      this.fields.number("Profondeur des bas", "depth"),
      this.fields.number("Profondeur des hauts", "wallDepth"),
      this.fields.number("Hauteur du plan de travail", "worktopHeight"),
      this.fields.number("Épaisseur du plan de travail", "worktopThickness"),
      this.fields.number("Socle", "plinth"),
      model.noIsland ? null : el("label", { class: "flex min-h-8 items-center gap-2" }, island, "Îlot face au mur A"),
      islandRows ? this.fields.number("Passage devant l'îlot", "passage") : null,
      islandRows ? this.fields.number("Longueur de l'îlot", "islandLength") : null,
      islandRows ? this.fields.number("Profondeur de l'îlot", "islandDepth") : null,
      el("h3", { class: "panel-title" }, "Matières et finitions"), this.fields.select("Façades", plan.frontMaterial ?? "lacquer-white", materials, (v) => this.set({ frontMaterial: v })),
      this.fields.select("Plan de travail en", plan.worktopMaterial ?? "solid-oak", materials, (v) => this.set({ worktopMaterial: v })), this.fields.look(),
      this.fields.check("Crédence", "splashback"), plan.splashback !== false ? this.fields.check("Crédence seulement sous la hotte", "splashbackHoodOnly") : null,
      this.fields.check("Plinthes", "kick"), this.fields.check("Joues de finition aux bouts libres (colonnes, meubles hauts)", "endPanels"), ...this.fields.cap(),
      wallsCheck(this.editor, planId, plan, (patch) => this.set(patch), () => this.draw()),
      this.fields.select("Retour du plan aux bouts libres", plan.worktopEnds ? (plan.worktopJoint ?? "top") : "none", [["none", "Aucun"], ["top", "Jusqu'au sol, le plan par-dessus"], ["side", "Jusqu'au sol, le retour par-dessus"], ["miter", "Jusqu'au sol, coupe d'onglet (45°)"]], (v) => this.set(v === "none" ? { worktopEnds: false } : { worktopEnds: true, worktopJoint: v as NonNullable<KitchenFloorPlan["worktopJoint"]> })),
      el("h3", { class: "panel-title" }, "Pour « Proposer une cuisine »"),
      el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "Comme dans l'Implantation ; ils servent quand vous cliquez « Proposer une cuisine »."),
      this.fields.select("Façades des bas", plan.fronts ?? "mixed", [["mixed", "Tiroirs et portes, en alternance"], ["drawers", "Tiroirs partout"], ["doors", "Portes partout"]], (v) => this.set({ fronts: v as KitchenFloorPlan["fronts"] })),
      this.fields.check("Meubles hauts au-dessus", "wallUnits"),
      this.fields.check("Électroménager (évier, lave-vaisselle, plaque, four, hotte)", "appliances"),
      this.fields.check("Colonne réfrigérateur", "fridge"),
      plan.appliances !== false ? this.fields.check("Four en colonne (sinon sous la plaque)", "ovenColumn") : null,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      ok,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** The surveyed room it stands in: wall A on one of its walls, or the sizes typed here. */
  private roomChoice(): HTMLElement | null {
    const rooms = planRooms(this.editor.doc);
    if (!rooms.length) return null;
    const current = this.plan.room ? `${this.plan.room.id}:${this.plan.room.wall}` : "";
    const options: [string, string][] = [["", "Cotes tapées ici"], ...rooms.flatMap((room) => room.walls.map((_, i): [string, string] => [`${room.id}:${i}`, `${room.name}, ${wallName(i)}`]))];
    return this.fields.select("Mur A dans la pièce", current, options, (value) => {
      const [id, wall] = value.split(":");
      const room = rooms.find((r) => r.id === id);
      const next = room ? linkedKitchen(this.plan, room, Number(wall)) : unlinkedKitchen(this.plan);
      if (typeof next === "string") return this.editor.notify(next, "error");
      typed = !room;
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
    if (lost.length && !(await askConfirm(`Ce plan n'a plus : ${lost.join(", ")}. Ses meubles seront supprimés. Continuer ?`, "Appliquer"))) {
      // Refused: the plan as it is in the project.
      const kept = kitchenPlanIn(this.editor.doc, planId);
      if (kept) this.plan = { ...kept };
      return this.draw();
    }
    const made = withKitchenChanged(this.editor.doc, planId, this.plan);
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.editor.notify(made.problems.length ? `Plan modifié. ${made.problems.join(" ")}` : "Plan modifié : la cuisine a suivi.", made.problems.length ? "info" : "success");
    this.draw();
  }

  /** A setting of the plan being changed, applied a moment later. */
  private changeSoon(planId: string): void {
    window.clearTimeout(this.changeTimer);
    this.changeTimer = window.setTimeout(() => void this.change(planId), 400);
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
      const inside = count ? el("p", { class: "border-t border-gray-100 pt-1.5 text-gray-600 dark:border-gray-800 dark:text-gray-300", "data-run-inside": run.id }, `${count} meuble${count > 1 ? "s" : ""}${free > 0 ? ` · ${formatLength(free, unit)} libres` : ""}`) : null;
      return zoneCard(`run:${run.label}`, run.label, formatLength(run.zone.run.length, unit), [see, go], inside, { "data-run-card": run.id });
    };
    const propose = el("button", { type: "button", class: WIDE, "data-propose": "" }, "Proposer une cuisine");
    const dossier = el("button", { type: "button", class: WIDE, "data-kitchen-dossier-open": "", title: "Plan coté, chaque linéaire vu de face et la liste des meubles, en PDF pour le client" }, "Dossier de cuisine (PDF)");
    dossier.addEventListener("click", () => openKitchenDossier(this.editor, planId));
    propose.title = "Remplit tous les linéaires comme l'Implantation : modules de 60 cm d'abord, puis le plus grand qui tient, un fileur, l'électroménager à sa place";
    propose.addEventListener("click", () => void this.propose(planId, plan));
    const change = el("button", { type: "button", class: WIDE }, "Modifier le plan");
    change.addEventListener("click", () => {
      this.plan = { ...plan };
      this.editing = true;
      this.draw();
    });
    const finish = () => (hasDock() ? showPanel("properties") : this.close());
    const warn = kitchenStarted(plan) ? [...layout.ergonomics.warn, ...layout.notes] : [];
    const rows: (HTMLElement | null)[] = [
      panelHeader("Plan de cuisine", finish),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Cliquez un linéaire pour l'aménager meuble par meuble."),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, kitchenSchema(plan, (r) => [r.label], (r) => this.openRun(planId, r), layout.fills, kitchenMarks(doc, plan))),
      el("ul", { class: "space-y-1.5", "aria-label": "Linéaires du plan" }, ...kitchenRuns(plan).map(row)),
      propose,
      kitchenStarted(plan) ? dossier : null,
      isolatedSketch() === planId ? showAllButton(() => this.draw()) : null,
      // Titled parts fold, one open at a time, all closed at first.
      kitchenStarted(plan) && layout.ergonomics.ok.length ? this.folds.fold("ergonomics", `Ergonomie (${layout.ergonomics.ok.length})`, () => layout.ergonomics.ok.map((m) => el("p", { class: "text-emerald-700 dark:text-emerald-300" }, `• ${m}`))) : null,
      warn.length ? this.folds.fold("checks", `À revoir (${warn.length})`, () => warn.map((m) => el("p", { class: "text-amber-900 dark:text-amber-100" }, m))) : null,
      this.folds.fold("price", "Prix du projet", () => [quoteButton()], el("span", { class: "font-mono font-medium", "data-live-total": "" })),
      change,
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
    isolateFeatures(planId, run.label, () => runFeatures(shownDoc(this.editor), kitchenPlanIn(shownDoc(this.editor), planId) ?? plan, run.id), front);
    this.draw();
  }

  /** A run opened in its editor, on the plan as it is in the project. */
  openRun(planId: string, run: KitchenRun, show = true, chosen: string | null = null, fold: string | null = null, other: RunEditor["otherChosen"] = null): void {
    const plan = kitchenPlanIn(this.editor.doc, planId);
    if (!plan) return;
    this.runPlan = planId;
    // Another wall opened while one is isolated: it is the one seen.
    if (show && seen && seen.run !== run.id && isolatedSketch() === planId) this.seeRun(planId, run);
    this.runEditor = new RunEditor({
      editor: this.editor, plan, planId, run, room: kitchenRoomInfo(this.editor.doc, plan), chosen, fold, other, focus: !!document.activeElement?.closest("[data-run-strip]"),
      redraw: () => this.draw(),
      changed: () => this.storeRunSoon(planId, run),
      back: () => void this.leaveRun(planId, run),
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
    // What is waiting is stored first.
    if (editor?.dirty && !(await this.storeRun(planId, from))) return;
    const run = target();
    if (run) this.openRun(planId, run);
  }

  /** Each change of the run is stored a moment after the last one (no « OK »): the kitchen made again, one undo step. */
  private storeRunSoon(planId: string, run: KitchenRun): void {
    window.clearTimeout(this.runTimer);
    this.runTimer = window.setTimeout(() => void this.storeRun(planId, run), 500);
  }

  /** What the run editor has, stored now; it stays open. False: refused (said why). */
  private async storeRun(planId: string, run: KitchenRun): Promise<boolean> {
    window.clearTimeout(this.runTimer);
    const editor = this.runEditor;
    if (!editor?.dirty || editor.runId !== run.id) return true;
    const plan = kitchenPlanIn(this.editor.doc, planId);
    if (!plan) return false;
    const [items, rest, corners] = editor.pending();
    const built = withKitchenBuilt(this.editor.doc, planId, { runs: { ...plan.runs, [run.id]: items }, rest: { ...plan.rest, [run.id]: rest }, ...corners });
    if (typeof built === "string") {
      this.editor.notify(built, "error");
      return false;
    }
    const placed = withCaissonsPlaced(built.doc, planId);
    const problems = [...built.problems, ...placed.problems.map((m) => `${run.label} : ${m}`)].filter((m) => m.startsWith(`${run.label} :`));
    // Stored: the editor follows the project again.
    editor.dirty = false;
    await this.editor.change(placed.doc);
    if (!kitchenStarted(plan)) this.frame();
    this.editor.notify(problems.length ? `${run.label} aménagé. ${problems.join(" ")}` : `${run.label} aménagé : la cuisine est refaite.`, problems.length ? "info" : "success");
    this.draw();
    return true;
  }

  /** The cross of the run: what is waiting is stored, then the run closes. */
  private async leaveRun(planId: string, run: KitchenRun): Promise<void> {
    await this.storeRun(planId, run);
    this.runEditor = null;
    await endPreview(this.editor);
    this.draw();
  }

}

/** « Tout montrer »: everything back in the view. */
function showAllButton(after: () => void): HTMLElement {
  const b = el("button", { type: "button", class: WIDE, "data-show-all": "" }, "Tout montrer");
  b.addEventListener("click", () => (showAll(), after()));
  return b;
}

export function bindKitchenPlan(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  // The plan following the 3D (and the appliances their cabinets) is a rule of the document: document/doc-normalizers.ts.
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
      if (current?.openRunInfo()?.dirty) return editor.notify("Un linéaire est en train d'être enregistré : un instant.", "info");
      editValue(editor, label, d.b - d.a, (mm) => withRunDim(editor.doc, at.plan, at.run, d.edit!, mm), true);
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
  editor.afterRender(() => {
    paintDims();
    if (tool) tool.refresh();
    else if (hasDock() && kitchenPlanOf(editor.doc)) open(undefined, true);
  });
}
