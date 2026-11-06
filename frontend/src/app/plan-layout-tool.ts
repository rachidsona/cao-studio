/**
 * « Plan de dressing » : un dressing commence par son schéma vu de dessus. On choisit un modèle, on règle ses cotes
 * (document/plan-layout.ts), et OK pose le plan au sol ; puis chaque zone se clique, dans le schéma ou dans la liste : elle
 * reçoit sa Répartition, ouverte aussitôt dans son outil pour régler ses cases, et se rouvre de la même façon. L'outil
 * rouvert retrouve le plan du projet, pour passer à la zone suivante ou le changer : tout ce qui est fait dessus suit.
 * Cliquer l'esquisse d'un plan, dans le navigateur ou la vue, ouvre l'outil sur ce plan.
 */
import { fillChoices, PLAN, PLAN_MODELS, planLines, planOf, planProblem, planZones, withCornerDoors, withPlan, withPlanChanged, withZonePartition, zoneDone, zonesLost, zoneStep, type FillChoice, type PlanModel, type PlanZone } from "../document/plan-layout";
import { findFeature } from "../document/operations";
import type { DressingPlan, SketchFeature } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { askConfirm } from "../ui/confirm-dialog";
import { placePanel } from "../ui/dock";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const SVG = "http://www.w3.org/2000/svg";
const FIELD = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[8rem_1fr] items-center gap-1.5";
const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: the last plan set. */
let last: DressingPlan = { ...PLAN };

const svg = (tag: string, attrs: Record<string, string>, ...children: (Node | string)[]): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
};

/** The plan seen from above, wall A at the top; `labels`: its zones named and measured, `pick`: a click chooses a zone. */
export function planSchema(plan: DressingPlan, labels: ((zone: PlanZone) => string[]) | null, pick?: (zone: PlanZone) => void, done?: (zone: PlanZone) => boolean): SVGElement {
  const zones = planZones(plan);
  const points = zones.flatMap((z) => z.outline);
  const [xs, ys] = [points.map((p) => p[0]), points.map((p) => -p[1])];
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0);
  const pad = size * 0.04;
  const node = svg("svg", { viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`, class: "max-h-56 w-full", ...(labels ? { role: "img", "aria-label": "Schéma du plan vu de dessus" } : { "aria-hidden": "true" }) });
  for (const zone of zones) {
    const shape = svg("polygon", { points: zone.outline.map(([x, y]) => `${x},${-y}`).join(" "), fill: done?.(zone) ? "#38bdf866" : "#38bdf822", ...(pick ? { class: "cursor-pointer hover:fill-sky-400/50", "data-zone": zone.id } : {}) });
    if (pick) shape.addEventListener("click", () => pick(zone));
    node.append(shape);
  }
  for (const [[ax, ay], [bx, by]] of planLines(plan)) node.append(svg("line", { x1: String(ax), y1: String(-ay), x2: String(bx), y2: String(-by), stroke: "#38bdf8", "stroke-width": String(size / 300), "pointer-events": "none" }));
  if (labels) {
    for (const zone of zones) {
      const [cx, cy] = zone.outline.reduce(([a, b], [x, y]) => [a + x / zone.outline.length, b + y / zone.outline.length], [0, 0]);
      const lines = labels(zone);
      const height = size / 24;
      lines.forEach((line, i) => node.append(svg("text", { x: String(cx), y: String(-cy + (i - (lines.length - 1) / 2) * height * 1.2), "text-anchor": "middle", "dominant-baseline": "middle", "font-size": String(height), fill: "currentColor", "pointer-events": "none" }, line)));
    }
  }
  return node;
}

export class PlanLayoutTool {
  private plan: DressingPlan = { ...last };
  /** The plan of the project is being changed, rather than its zones worked on. */
  private editing = false;
  /** The free zone being filled, the width asked for its cases (mm), and whether what is left goes at its start. */
  private filling: PlanZone | null = null;
  private fillWidth = 600;
  private fillFirst = false;
  private readonly panel: HTMLElement;

  constructor(
    private readonly editor: Editor,
    container: HTMLElement,
    private readonly closed: () => void,
    /** The sketch of the plan to show; absent: the one of the project. */
    readonly chosen?: string,
  ) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-72 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Plan de dressing",
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(container, this.panel);
    this.draw();
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
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const placed = this.placed();
    // A plan made before a setting existed takes its usual value.
    const plan = placed?.dressingPlan ? { ...PLAN, ...placed.dressingPlan } : null;
    if (placed && plan && this.filling) this.panel.replaceChildren(...this.fill(placed.id, plan, this.filling));
    else this.panel.replaceChildren(...(placed && plan && !this.editing ? this.zones(placed.id, plan) : this.settings(placed?.id)));
  }

  // ---- first: the model and its sizes -------------------------------------------------

  private settings(planId?: string): HTMLElement[] {
    const plan = this.plan;
    const unit = this.editor.unit;
    const model = PLAN_MODELS[plan.model];
    const set = (patch: Partial<DressingPlan>) => {
      this.plan = last = { ...this.plan, ...patch };
      this.draw();
    };
    const number = (label: string, key: "lengthA" | "lengthB" | "lengthC" | "lengthD" | "aisle" | "depth" | "cornerA" | "cornerB" | "height" | "plinth" | "thickness", allowZero = false) => {
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
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, this.editing ? "Annuler" : "Terminer");
    cancel.addEventListener("click", () => {
      if (!this.editing) return this.close();
      this.editing = false;
      this.draw();
    });
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: problem !== null }, this.editing ? "Appliquer" : "Créer le plan");
    ok.addEventListener("click", () => void (this.editing && planId ? this.change(planId) : this.create()));
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Plan de dressing"),
      models,
      el("p", { class: "font-medium text-gray-700 dark:text-gray-200" }, model.label),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, problem ? null : planSchema(plan, (z) => (z.kind === "corner" ? [z.label] : [z.label, formatLength(z.run.length, unit)]))),
      number("Longueur mur A", "lengthA"),
      model.walls.includes("B") ? number("Longueur mur B", "lengthB") : null,
      model.walls.includes("C") ? number("Longueur mur C", "lengthC") : null,
      model.walls.includes("D") ? number("Longueur mur D", "lengthD") : null,
      model.walls.includes("D") ? number("Passage", "aisle") : null,
      number("Profondeur", "depth"),
      model.cut ? number("Angle sur le mur A", "cornerA") : null,
      model.cut ? number("Angle sur l'autre mur", "cornerB") : null,
      number("Hauteur", "height"),
      number("Socle", "plinth", true),
      number("Épaisseur panneaux", "thickness"),
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  private async create(): Promise<void> {
    const problem = planProblem(this.plan);
    if (problem) return this.editor.notify(problem, "error");
    await this.editor.change(withPlan(this.editor.doc, this.plan).doc);
    this.editor.notify("Plan du dressing posé : cliquez une zone pour la répartir.", "success");
    this.draw();
  }

  private async change(planId: string): Promise<void> {
    const lost = zonesLost(this.editor.doc, planId, this.plan);
    if (lost.length && !(await askConfirm(`Ce plan n'a plus : ${lost.join(", ")}. Ce qui y est fait sera supprimé. Continuer ?`, "Appliquer"))) return;
    const made = withPlanChanged(this.editor.doc, planId, this.plan);
    if (typeof made === "string") return this.editor.notify(made, "error");
    await this.editor.change(made.doc);
    this.editor.notify(made.problems.length ? `Plan modifié. ${made.problems.join(" ")}` : "Plan modifié : ce qui est fait dessus a suivi.", made.problems.length ? "info" : "success");
    this.editing = false;
    this.draw();
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
      return el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "min-w-0 flex-1" }, `${zone.label} · ${formatLength(zone.run.length, unit)}`), zone.kind === "run" && !done(zone) ? fill : null, go);
    };
    const door = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: plan.cornerDoor === true });
    door.addEventListener("change", () => void this.editor.change(withCornerDoors(this.editor.doc, planId, door.checked)).then(() => this.draw()));
    const change = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Modifier le plan");
    change.addEventListener("click", () => {
      this.plan = { ...plan };
      this.editing = true;
      this.draw();
    });
    const finish = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    finish.addEventListener("click", () => this.close());
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Plan de dressing"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Cliquez une zone pour la répartir."),
      el("div", { class: "text-gray-700 dark:text-gray-200" }, planSchema(plan, (z) => [z.label], (z) => void this.make(planId, plan, z), done)),
      el("ul", { class: "space-y-1", "aria-label": "Zones du plan" }, ...zones.map(row)),
      zones.some((z) => z.kind === "corner") ? el("label", { class: "flex min-h-8 items-center gap-2" }, door, "Porte sur le pan coupé") : null,
      change,
      finish,
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
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
    const back = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    back.addEventListener("click", () => {
      this.filling = null;
      this.draw();
    });
    return [
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, `Remplir : ${zone.label}`),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${formatLength(zone.run.length, unit)} à remplir, côtés compris. Choisissez la largeur intérieure des caissons.`),
      el("label", { class: ROW }, `Largeur des caissons (${UNIT_LABELS[unit]})`, width),
      el("label", { class: ROW }, "Le reste va", side),
      ...(options.length ? options : [el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, "Cette largeur ne tient pas dans cette zone.")]),
      back,
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
    // Its cases are set in the tool of the Répartition, as any other; the plan comes back from its button.
    this.close();
    this.editor.sketches.editOffset(target.sketch, target.step);
  }
}

export function bindPlanLayout(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  let tool: PlanLayoutTool | null = null;
  const open = (chosen?: string) => {
    tool?.close();
    tool = new PlanLayoutTool(editor, container, () => (tool = null), chosen);
  };
  /** A sketch chosen: when it is a plan, its tool, unless it is the one open or another tool is at work in a sketch. */
  const show = (id: string | null | undefined) => {
    const sketch = id ? findFeature(editor.doc, id) : undefined;
    if (sketch?.type !== "sketch" || !sketch.dressingPlan || editor.sketches.active) return;
    if (tool?.chosen !== sketch.id) open(sketch.id);
  };
  root.querySelector('[data-workshop="dressing-plan"]')?.addEventListener("click", () => open());
  root.addEventListener("cad:feature-selected", (event) => show((event as CustomEvent<string | null>).detail));
  // In the view, a line or an area of the plan is picked rather than its sketch.
  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    show(selection.sketches[0] ?? selection.sketch[0]?.sketchId);
  };
}
