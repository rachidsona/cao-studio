/**
 * « Plan de dressing » : un dressing commence par son schéma vu de dessus. On choisit un modèle, on règle ses cotes
 * (document/plan-layout.ts), et OK pose le plan au sol ; puis chaque zone se clique, dans le schéma ou dans la liste : elle
 * reçoit sa Répartition, ouverte aussitôt dans son outil pour régler ses cases, et se rouvre de la même façon. L'outil
 * rouvert retrouve le plan du projet, pour passer à la zone suivante ou le changer : tout ce qui est fait dessus suit.
 * Cliquer l'esquisse d'un plan, dans le navigateur ou la vue, ouvre l'outil sur ce plan.
 */
import { planChecks } from "../../document/dressing-check";
import { fillChoices, planOf, withCornerDoors, withPlan, withPlanChanged, withPlanWalls, withZonePartition, withZoneSliding, zoneDone, zonesLost, zoneStep, type FillChoice } from "../../document/plan-layout";
import { avoidingPlan, linkedPlan, planObstacles, planRooms, roomOf, unlinkedPlan, type PlanObstacle } from "../../document/plan-room";
import { pullDownState, withPullDowns } from "../../document/plan-pulldown";
import { cornerJoints, PLAN, PLAN_MODELS, planLines, planProblem, planZones, type PlanField, type PlanModel, type PlanZone } from "../../document/plan-shapes";
import { findFeature } from "../../document/operations";
import type { DressingPlan, SketchFeature } from "../../document/types";
import { wallName } from "../../features/room-plan";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { askConfirm } from "../../ui/confirm-dialog";
import { hasDock, placePanel, showPanel } from "../../ui/dock";
import { el } from "../../ui/dom";
import { asCards, panelHeader, zoneCard } from "../../ui/panel-close";
import { planSchema } from "./plan-schema";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { paintPrice } from "../workshop/live-price";
import { needsPanel } from "./plan-needs-panel";
import { wallsSection } from "./plan-walls-panel";
import { insideTools, topSection } from "./plan-top-panel";
import { isolatedSketch, isolateZone, showAll } from "../zone-view";

const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";
const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: the last plan set. */
let last: DressingPlan = { ...PLAN };

/** What is done inside a zone, each tool opened on it from the plan (the niche clicked there gets it). */

export class PlanLayoutTool {
  private plan: DressingPlan = { ...last };
  /** The plan of the project is being changed, rather than its zones worked on. */
  private editing = false;
  /** A setting of the plan being changed, waiting to be applied. */
  private changeTimer: number | undefined;
  /** The needs of the client are being typed. */
  private needing = false;
  /** The free zone being filled, the width asked for its cases (mm), and whether what is left goes at its start. */
  private filling: PlanZone | null = null;
  private fillWidth = 600;
  private fillFirst = false;
  readonly panel: HTMLElement;
  /** The document last drawn, and whether it had a plan: when its plan goes, the tool goes. */
  private drawn: unknown = null;
  private hadPlan = false;

  constructor(
    private readonly editor: Editor,
    container: HTMLElement,
    private readonly closed: () => void,
    /** The sketch of the plan to show; absent: the one of the project. */
    readonly chosen?: string,
    /** Opened by itself, behind what is being looked at. */
    quiet = false,
  ) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-72 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Plan de dressing",
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(container, this.panel, { first: true, quiet });
    this.draw();
  }

  /** The document changed: the plan shown follows it, even behind another tab. */
  refresh(): void {
    if (this.editor.doc === this.drawn) return;
    if (this.hadPlan && !this.placed()) this.close();
    else this.draw();
  }

  close(): void {
    this.panel.remove();
    this.closed();
  }

  private placed(): SketchFeature | undefined {
    const chosen = this.chosen ? findFeature(this.editor.doc, this.chosen) : undefined;
    return chosen?.type === "sketch" && chosen.dressingPlan ? chosen : planOf(this.editor.doc);
  }

  private draw(): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type !== "checkbox" && this.panel.contains(active)) return;
    const placed = this.placed();
    this.drawn = this.editor.doc;
    this.hadPlan ||= !!placed;
    // A plan made before a setting existed takes its usual value.
    const plan = placed?.dressingPlan ? { ...PLAN, ...placed.dressingPlan } : null;
    if (placed && plan && this.needing) this.panel.replaceChildren(...needsPanel(placed.id, plan, this.editor, () => {
      this.needing = false;
      this.draw();
    }));
    else if (placed && plan && this.filling) this.panel.replaceChildren(...this.fill(placed.id, plan, this.filling));
    else this.panel.replaceChildren(...(placed && plan && !this.editing ? this.zones(placed.id, plan) : this.settings(placed?.id))), asCards(this.panel);
    paintPrice();
  }

  private marks(plan: DressingPlan): PlanObstacle[] {
    const room = roomOf(this.editor.doc, plan);
    return room ? planObstacles(plan, room) : [];
  }

  // ---- first: the model and its sizes -------------------------------------------------

  private settings(planId?: string): HTMLElement[] {
    const plan = this.plan;
    const unit = this.editor.unit;
    const model = PLAN_MODELS[plan.model];
    const set = (patch: Partial<DressingPlan>) => {
      this.plan = last = { ...this.plan, ...patch };
      this.draw();
      if (this.editing && planId) this.changeSoon(planId);
    };
    const number = (label: string, key: PlanField | "lengthA" | "depth" | "cornerA" | "cornerB" | "height" | "plinth" | "thickness" | "islandLength" | "islandDepth" | "roofLow", allowZero = false) => {
      const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(plan[key], unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && (allowZero ? parsed >= 0 : parsed > 0);
        input.setAttribute("aria-invalid", String(!ok));
        if (ok && fromDisplay(parsed, unit) !== plan[key]) set({ [key]: fromDisplay(parsed, unit) });
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
    };
    const models = el(
      "div",
      { class: "grid grid-cols-4 gap-1", role: "group", "aria-label": "Modèles" },
      ...(Object.keys(PLAN_MODELS) as PlanModel[]).map((key) => {
        const button = el("button", { type: "button", title: PLAN_MODELS[key].label, "aria-label": PLAN_MODELS[key].label, "aria-pressed": String(key === plan.model), class: `border p-1 ${key === plan.model ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, planSchema({ ...PLAN, model: key }, null));
        button.addEventListener("click", () => set({ model: key }));
        return button;
      }),
    );
    const problem = planProblem(plan);
    // A plan being changed takes each setting at once (no « Appliquer »); the cross goes back to its zones. A new one
    // is made by « Créer le plan ».
    const close = () => {
      if (!this.editing) return this.close();
      this.editing = false;
      this.draw();
    };
    const ok = this.editing ? null : el("button", { type: "button", class: "h-8 w-full btn-accent font-medium disabled:opacity-40", disabled: problem !== null }, "Créer le plan");
    ok?.addEventListener("click", () => void this.create());
    const rows: (HTMLElement | null)[] = [
      panelHeader("Plan de dressing", close),
      models,
      el("p", { class: "font-medium text-gray-700 dark:text-gray-200" }, model.label),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, problem ? null : planSchema(plan, (z) => (z.kind === "corner" ? [z.label] : [z.label, formatLength(z.run.length, unit)]), undefined, undefined, this.marks(plan))),
      this.roomChoice(),
      ...this.roomOptions(),
      ...this.joints(set),
      number("Longueur mur A", "lengthA"),
      ...(Object.entries(model.fields) as [PlanField, string][]).map(([key, label]) => number(label, key)),
      number("Profondeur", "depth"),
      model.cut.length ? number("Angle sur le mur A", "cornerA") : null,
      model.cut.length ? number("Angle sur l'autre mur", "cornerB") : null,
      number(plan.roof ? "Hauteur (côté haut)" : "Hauteur", "height"),
      number("Socle", "plinth", true),
      number("Épaisseur panneaux", "thickness"),
      ...this.options(number, set),
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      ok,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** The surveyed room this plan stands in: wall A on one of its walls, or the sizes typed here. */
  private roomChoice(): HTMLElement | null {
    const rooms = planRooms(this.editor.doc);
    if (!rooms.length || this.plan.model === "back") return null;
    const current = this.plan.room ? `${this.plan.room.id}:${this.plan.room.wall}` : "";
    const options = rooms.flatMap((room) => room.walls.map((_, i) => el("option", { value: `${room.id}:${i}`, selected: current === `${room.id}:${i}` }, `${room.name}, ${wallName(i)}`)));
    const choice = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Mur A dans la pièce" }, el("option", { value: "", selected: !current }, "Cotes tapées ici"), ...options);
    choice.addEventListener("change", () => {
      const [id, wall] = choice.value.split(":");
      const room = rooms.find((r) => r.id === id);
      const next = room ? linkedPlan(this.plan, room, Number(wall)) : unlinkedPlan(this.plan);
      if (typeof next === "string") this.editor.notify(next, "error");
      else this.plan = last = next;
      this.draw();
    });
    return el("label", { class: ROW }, "Mur A dans la pièce", choice);
  }

  /** Keeping clear of a surveyed room's openings; or, with no room, walls drawn behind the plan. */
  private roomOptions(): HTMLElement[] {
    const plan = this.plan;
    const room = roomOf(this.editor.doc, plan);
    const box = (label: string, checked: boolean, change: (on: boolean) => void) => {
      const input = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked });
      input.addEventListener("change", () => change(input.checked));
      return el("label", { class: "flex min-h-8 items-center gap-2" }, input, label);
    };
    if (room) {
      return [box("Éviter portes, fenêtres et plafonds bas", plan.avoid === true, (on) => {
        const { spans: _spans, low: _low, ...open } = plan;
        const next = on ? avoidingPlan({ ...open, avoid: true }, room) : { ...open, avoid: false };
        if (typeof next === "string") this.editor.notify(next, "error");
        else this.plan = last = next;
        this.draw();
      })];
    }
    if (plan.model === "back") return [];
    return [box("Dessiner les murs", plan.walls === true, (on) => {
      this.plan = last = { ...plan, walls: on };
      this.draw();
    })];
  }

  /** At each square corner, the wall that runs through; the other stops against it. */
  private joints(set: (patch: Partial<DressingPlan>) => void): HTMLElement[] {
    const plan = this.plan;
    return cornerJoints(plan).map(({ joint, label, walls }) => {
      const choice = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": label }, ...walls.map((wall, i) => el("option", { value: String(i), selected: (plan.through?.[joint] === true) === (i === 1) }, `${wall} passe`)));
      choice.addEventListener("change", () => set({ through: { ...plan.through, [joint]: choice.value === "1" } }));
      return el("label", { class: ROW }, label, choice);
    });
  }

  /** What most models can have on top: an island in front of wall A, a sloped ceiling over all of it. */
  private options(number: (label: string, key: "aisle" | "islandLength" | "islandDepth" | "roofLow") => HTMLElement, set: (patch: Partial<DressingPlan>) => void): HTMLElement[] {
    const plan = this.plan;
    const island = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: plan.island === true, "aria-label": "Îlot central" });
    island.addEventListener("change", () => set({ island: island.checked }));
    const roof = el(
      "select",
      { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Rampant" },
      ...([["", "Aucun"], ["left", "Bas à gauche"], ["right", "Bas à droite"], ["wall", "Bas contre le mur A"]] as const).map(([value, label]) => el("option", { value, selected: (plan.roof ?? "") === value }, label)),
    );
    roof.addEventListener("change", () => {
      const { roof: _old, ...rest } = this.plan;
      this.plan = last = { ...rest, ...(roof.value ? { roof: roof.value as "left" | "right" | "wall" } : {}) };
      this.draw();
    });
    const rows: (HTMLElement | null)[] = [
      el("label", { class: ROW }, "Rampant", roof),
      plan.roof ? number("Bas du rampant", "roofLow") : null,
      PLAN_MODELS[plan.model].noIsland ? null : el("label", { class: "flex min-h-8 items-center gap-2" }, island, "Îlot central"),
      plan.island && !PLAN_MODELS[plan.model].noIsland ? number("Passage devant l'îlot", "aisle") : null,
      plan.island && !PLAN_MODELS[plan.model].noIsland ? number("Longueur îlot", "islandLength") : null,
      plan.island && !PLAN_MODELS[plan.model].noIsland ? number("Profondeur îlot", "islandDepth") : null,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  private async create(): Promise<void> {
    const problem = planProblem(this.plan);
    if (problem) return this.editor.notify(problem, "error");
    const made = withPlan(this.editor.doc, this.plan);
    await this.editor.change(this.plan.walls ? withPlanWalls(made.doc, made.id, true) : made.doc);
    this.editor.notify("Plan du dressing posé : cliquez une zone pour la répartir.", "success");
    this.draw();
  }

  private async change(planId: string): Promise<void> {
    const lost = zonesLost(this.editor.doc, planId, this.plan);
    if (lost.length && !(await askConfirm(`Ce plan n'a plus : ${lost.join(", ")}. Ce qui y est fait sera supprimé. Continuer ?`, "Appliquer"))) {
      // Refused: the plan as it is in the project.
      const kept = (findFeature(this.editor.doc, planId) as SketchFeature | undefined)?.dressingPlan;
      if (kept) this.plan = { ...kept };
      return this.draw();
    }
    const made = withPlanChanged(this.editor.doc, planId, this.plan);
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.editor.notify(made.problems.length ? `Plan modifié. ${made.problems.join(" ")}` : "Plan modifié : ce qui est fait dessus a suivi.", made.problems.length ? "info" : "success");
    this.draw();
  }

  /** A setting of the plan being changed, applied a moment later. */
  private changeSoon(planId: string): void {
    window.clearTimeout(this.changeTimer);
    this.changeTimer = window.setTimeout(() => void this.change(planId), 400);
  }

  // ---- then: the zones of the plan ----------------------------------------------------

  private zones(planId: string, plan: DressingPlan): HTMLElement[] {
    const doc = this.editor.doc;
    const unit = this.editor.unit;
    const done = (z: PlanZone) => zoneDone(doc, plan, z.id);
    const zones = planZones(plan);
    const row = (zone: PlanZone) => {
      const go = el("button", { type: "button", class: SMALL }, done(zone) ? "Modifier" : "Répartition");
      go.addEventListener("click", () => void this.make(planId, plan, zone));
      const fill = el("button", { type: "button", class: SMALL }, "Remplir");
      fill.addEventListener("click", () => {
        this.filling = zone;
        this.draw();
      });
      const see = el("button", { type: "button", class: SMALL, title: "Isole cette zone, de face, avec ses cotes, pour y travailler" }, "Voir");
      see.addEventListener("click", () => {
        isolateZone(plan, zone.id, zone.label);
        this.draw();
      });
      // Its inside's tools (the zone alone, the tool open on it), in a card folded by its title (not by its buttons).
      const sketch = plan.made?.[zone.id];
      const inside = done(zone) && sketch ? insideTools(zone.label, zone.id, sketch, this.editor, () => isolateZone(plan, zone.id, zone.label)) : null;
      return zoneCard(`zone:${zone.label}`, zone.label, formatLength(zone.run.length, unit), [zone.kind === "run" && !done(zone) ? fill : null, done(zone) ? see : null, go], inside, { "data-zone-card": zone.id });
    };
    const showAllButton = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Tout montrer");
    showAllButton.addEventListener("click", () => {
      showAll();
      this.draw();
    });
    const needs = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Remplir selon les besoins");
    needs.addEventListener("click", () => {
      this.needing = true;
      this.draw();
    });
    const door = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: plan.cornerDoor === true });
    door.addEventListener("change", () => void this.editor.change(withCornerDoors(this.editor.doc, planId, door.checked)).then(() => this.draw()));
    const change = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-panel-loose": "" }, "Modifier le plan");
    change.addEventListener("click", () => {
      this.plan = { ...plan };
      this.editing = true;
      this.draw();
    });
    const finish = () => (hasDock() ? showPanel("properties") : this.close());
    const rows: (HTMLElement | null)[] = [
      panelHeader("Plan de dressing", finish),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Cliquez une zone pour la répartir."),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, planSchema(plan, (z) => [z.label], (z) => void this.make(planId, plan, z), done, this.marks(plan))),
      el("p", { class: "flex justify-between gap-2 font-medium" }, "Prix du projet", el("span", { "data-live-total": "" })),
      el("ul", { class: "space-y-2", "aria-label": "Zones du plan" }, ...zones.map(row)),
      isolatedSketch() ? showAllButton : null,
      needs,
      ...this.sliding(planId, plan, zones),
      ...topSection(planId, plan, zones, this.editor, () => this.draw()),
      ...wallsSection(planId, plan, zones, this.editor, () => this.draw()),
      ...this.pullDowns(planId, plan),
      ...this.checks(plan),
      zones.some((z) => z.kind === "corner") ? el("label", { class: "flex min-h-8 items-center gap-2", "data-panel-loose": "" }, door, PLAN_MODELS[plan.model].round ? "Porte cintrée sur l'arrondi" : PLAN_MODELS[plan.model].ell ? "Deux portes sur le coin en L" : "Porte sur le pan coupé") : null,
      change,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** Sliding doors, zone by zone: how many, or none. */
  private sliding(planId: string, plan: DressingPlan, zones: PlanZone[]): HTMLElement[] {
    const rows = zones.filter((z) => z.kind === "run").map((zone) => {
      const count = plan.sliding?.[zone.id] ?? 0;
      const choice = el("select", { class: "h-7 w-full border border-gray-300 bg-white px-1 text-xs disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900", "aria-label": `Portes coulissantes, ${zone.label}`, disabled: plan.roof !== undefined }, ...[0, 2, 3, 4, 5, 6].map((n) => el("option", { value: String(n), selected: n === count }, n ? `${n} vantaux` : "Aucune")));
      choice.addEventListener("change", () => void this.editor.change(withZoneSliding(this.editor.doc, planId, zone, Number(choice.value))).then(() => this.draw()));
      return el("label", { class: ROW }, zone.label, choice);
    });
    return [el("h3", { class: "panel-title", title: plan.roof ? "Un rail de porte coulissante doit être de niveau : pas sous un rampant." : "Deux rails et des vantaux qui se recouvrent de 3 cm" }, "Portes coulissantes"), ...rows];
  }

  /** The rods out of reach: a pull-down rod for each, added or brought up to date in one click. */
  private pullDowns(planId: string, plan: DressingPlan): HTMLElement[] {
    const { wanted, stale } = pullDownState(this.editor.doc, plan);
    if (!stale) return [];
    const add = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, wanted.length ? `Penderies escamotables (${wanted.length})` : "Retirer les penderies escamotables");
    add.title = "Les tringles à plus de 1,90 m ne s'atteignent pas sans marchepied : une penderie escamotable les descend.";
    add.addEventListener("click", () => void this.editor.change(withPullDowns(this.editor.doc, plan)).then(() => this.draw()));
    return [el("h3", { class: "panel-title" }, "Penderies escamotables"), add];
  }

  /** What the plan leaves to look at, as it stands. */
  private checks(plan: DressingPlan): HTMLElement[] {
    const found = planChecks(this.editor.doc, plan);
    return found.length ? [el("div", { class: "space-y-1 bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", "data-plan-checks": "" }, el("p", { class: "font-medium" }, "À vérifier"), ...found.map((message) => el("p", {}, message)))] : [];
  }

  // ---- a free zone filled to size -----------------------------------------------------

  private fill(planId: string, plan: DressingPlan, zone: PlanZone): HTMLElement[] {
    const unit = this.editor.unit;
    const width = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(this.fillWidth, unit), 4), "aria-label": `Largeur des caissons (${UNIT_LABELS[unit]})` });
    const apply = () => {
      const parsed = parseNumber(width.value);
      const ok = parsed !== null && parsed > 0;
      width.setAttribute("aria-invalid", String(!ok));
      if (ok) this.fillWidth = fromDisplay(parsed, unit);
    };
    width.addEventListener("change", apply);
    width.addEventListener("blur", () => this.draw());
    width.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        width.blur();
      }
    });
    const side = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Place du reste" }, el("option", { value: "end", selected: !this.fillFirst }, "À la fin du mur"), el("option", { value: "start", selected: this.fillFirst }, "Au début du mur"));
    side.addEventListener("change", () => {
      this.fillFirst = side.value === "start";
      this.draw();
    });
    const choices = fillChoices(zone.run.length, plan.thickness, this.fillWidth, this.fillFirst);
    const options = choices.map((choice) => {
      const pick = el("button", { type: "button", class: `${SMALL} h-auto min-h-8 w-full py-1 text-left` }, choice.label);
      pick.addEventListener("click", () => void this.filled(planId, zone, choice));
      return pick;
    });
    const back = () => {
      this.filling = null;
      this.draw();
    };
    return [
      panelHeader(`Remplir : ${zone.label}`, back),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${formatLength(zone.run.length, unit)} à remplir, côtés compris. Choisissez la largeur intérieure des caissons.`),
      el("label", { class: ROW }, `Largeur des caissons (${UNIT_LABELS[unit]})`, width),
      el("label", { class: ROW }, "Le reste va", side),
      ...(options.length ? options : [el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, "Cette largeur ne tient pas dans cette zone.")]),
    ];
  }

  private async filled(planId: string, zone: PlanZone, choice: FillChoice): Promise<void> {
    const made = withZonePartition(this.editor.doc, planId, zone, choice);
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.editor.notify(`${zone.label} remplie : ${choice.label}.`, "success");
    this.filling = null;
    this.draw();
  }

  /** A zone clicked: its Répartition, made if need be, opened in its tool. */
  private async make(planId: string, plan: DressingPlan, zone: PlanZone): Promise<void> {
    let target = zoneStep(this.editor.doc, plan, zone.id);
    if (!target) {
      const made = withZonePartition(this.editor.doc, planId, zone);
      if (typeof made === "string") return this.editor.notify(made, "error");
      await this.editor.change(made.doc);
      target = made;
    }
    // Its cases are set in the tool of the Répartition, as any other; the plan stays in its tab, or comes back from its button.
    if (!hasDock()) this.close();
    this.editor.sketches.editOffset(target.sketch, target.step);
  }
}

export function bindPlanLayout(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let tool: PlanLayoutTool | null = null;
  const open = (chosen?: string, quiet = false) => {
    tool?.close();
    tool = new PlanLayoutTool(editor, container, () => (tool = null), chosen, quiet);
  };
  /** A sketch chosen: when it is a plan, its tool, unless it is the one open or another tool is at work in a sketch. */
  const show = (id: string | null | undefined) => {
    const sketch = id ? findFeature(editor.doc, id) : undefined;
    if (sketch?.type !== "sketch" || !sketch.dressingPlan || editor.sketches.active) return;
    if (tool?.chosen !== sketch.id) open(sketch.id);
    else showPanel(tool.panel);
  };
  root.querySelector('[data-workshop="dressing-plan"]')?.addEventListener("click", () => open());
  root.addEventListener("cad:feature-selected", (event) => show((event as CustomEvent<string | null>).detail));
  // In the view, a line or an area of the plan is picked rather than its sketch.
  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    show(selection.sketches[0] ?? selection.sketch[0]?.sketchId);
  };
  // On a wide screen, the plan of the project keeps its tab beside Sélection, whatever tool is at work.
  editor.afterRender(() => {
    if (tool) tool.refresh();
    else if (hasDock() && planOf(editor.doc)) open(undefined, true);
  });
}
