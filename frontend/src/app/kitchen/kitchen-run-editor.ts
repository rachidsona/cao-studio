/**
 * « Linéaire — mur A » : un linéaire du Plan de cuisine aménagé meuble par meuble, sur sa bande de face à l'échelle
 * (app/kitchen-run-strip.ts). On ajoute un meuble du catalogue, un des siens (« Mes meubles ») ou un appareil, après celui
 * qui est choisi, on le glisse pour le changer de place, on l'échange contre un autre modèle, on change sa largeur ; les
 * fileurs se calculent seuls (features/kitchen-run-items.ts) et ce que les appareils demandent s'affiche en dessous.
 * Chaque changement se voit aussitôt dans la 3D, en aperçu (app/kitchen-plan-tool.ts) ; rien ne change dans le projet avant
 * OK, qui le garde en refaisant toute la cuisine en une seule annulation (document/kitchen-floor.ts) ; Annuler revient.
 */
import { kitchenFromPlan, type KitchenRoomInfo } from "../../document/kitchen-plan-build";
import { itemsMoved, unitsMoved } from "../../document/kitchen-moves";
import { kitchenSizes, runGeometry, type KitchenRun, type RestSide } from "../../document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import type { CatalogEntry } from "../../document/kitchen-catalog";
import { applianceOf, entryItem, FILLER, FILLER_WALL, fillRun, insertItem, isFiller, isSpace, itemEntry, itemSize, newItem, rowOf, runModels, sizeLimits, spaceLeft, WIDTHS } from "../../features/kitchen-run-items";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { Folds } from "../../ui/fold";
import { familyModels, familyTabs, modelRow } from "./kitchen-catalog-view";
import { withCorner, type CornerSetting } from "../../document/kitchen-corners";
import { cornerChoice } from "./kitchen-corner-choice";
import { quoteButton } from "../workshop/live-price";
import { BRASS } from "./unit-elevation";
import { showAll } from "../zone-view";
import { runStrip } from "./kitchen-run-strip";
import { handAppliances } from "../../document/kitchen-hand-appliances";
import { myUnits } from "./my-units";
import { multiRows, pickAllRow } from "./kitchen-run-multi-view";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-7 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";
const WIDTH = "h-6 min-w-7 border border-gray-200 px-1 font-mono text-[11px] text-gray-600 hover:border-sky-500 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:text-white";

type Family = "base" | "wall" | "tall" | "appliance" | "mine";
const FAMILIES: [Family, string][] = [["base", "Bas"], ["wall", "Hauts"], ["tall", "Colonnes"], ["appliance", "Électro."], ["mine", "Mes meubles"]];

export interface RunEditorHost {
  editor: Editor;
  plan: KitchenFloorPlan;
  run: KitchenRun;
  room?: KitchenRoomInfo;
  /** The unit chosen when it opens. */
  chosen?: string | null;
  redraw(): void;
  /** Something changed: the 3D shows it, not yet recorded. */
  changed(): void;
  apply(items: KitchenRunItem[], rest: RestSide, corners: CornerSetting): void;
  /** The other runs of the plan, to open one of them. */
  runs: KitchenRun[];
  go(runId: string): void;
  /** This run alone in the view, from the front, with its sizes; and whether it is so. */
  see(): void;
  seen(): boolean;
  back(): void;
}


export class RunEditor {
  /** The corners chosen here, not yet applied. */
  private corners: CornerSetting = {};
  private items: KitchenRunItem[];
  private rest: RestSide;
  private chosen: string | null = null;
  /** The units chosen together (two or more), set as one (app/kitchen-run-multi-view.ts). */
  private picked: string[] = [];
  private family: Family = "base";
  /** The width of the next filler put by hand (mm). */
  private fillerWidth = 50;
  private readonly folds = new Folds(() => this.host.redraw());
  /** Something changed since it opened. */
  dirty = false;

  constructor(private readonly host: RunEditorHost) {
    this.items = structuredClone(host.plan.runs?.[host.run.id] ?? []);
    this.chosen = this.items.some((i) => i.id === host.chosen) ? host.chosen! : null;
    this.rest = runGeometry(host.plan, host.run).rest;
  }

  get runId(): string {
    return this.host.run.id;
  }

  /** The item chosen on the strip. */
  get chosenItem(): string | null {
    return this.chosen;
  }

  private change(items: KitchenRunItem[], chosen = this.chosen, picked = this.picked): void {
    this.items = items;
    this.chosen = chosen;
    this.picked = picked.filter((id) => items.some((i) => i.id === id));
    this.touched();
  }

  /** Changed since it opened: drawn again here, and shown in the 3D. */
  private touched(): void {
    this.dirty = true;
    this.host.redraw();
    this.host.changed();
  }

  private geometry() {
    const { run, room } = this.host;
    return runGeometry(this.current(), run, room?.[run.id]);
  }

  /** A new item after the one chosen when it is of its row, else at the end of its row. */
  private add(model: string, width: number, own?: KitchenRunItem["own"]): void {
    this.put(newItem(this.items, model, width, own));
  }

  private put(item: KitchenRunItem): void {
    this.change(insertItem(this.items, item, this.chosen), item.id);
  }

  /** A unit of « Meubles de cuisine », added like one of the palette, not applied before OK. */
  addEntry(entry: CatalogEntry): void {
    this.put(entryItem(this.items, entry));
  }

  /** The item put at this place among those of its row. */
  private move(id: string, index: number): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const row = rowOf(itemEntry(item));
    const others = this.items.filter((i) => i !== item);
    // Among the units of its row as the strip shows them: the room kept free is not one.
    const same = others.map((i, k) => [i, k] as const).filter(([i]) => rowOf(itemEntry(i)) === row && !isSpace(i));
    const at = index >= same.length ? (same.at(-1)?.[1] ?? others.length - 1) + 1 : same[index]![1];
    this.change([...others.slice(0, at), item, ...others.slice(at)], id);
  }

  /** The plan as it would be: this run's rest and the corners chosen here. */
  private current(): KitchenFloorPlan {
    const { plan, run } = this.host;
    return { ...plan, rest: { ...plan.rest, [run.id]: this.rest }, ...this.corners };
  }

  render(): HTMLElement[] {
    const { run, editor } = this.host;
    const plan = this.current();
    const unit = editor.unit;
    const g = this.geometry();
    const s = kitchenSizes(plan);
    const fill = fillRun(g, this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    const strip = runStrip({ plan, run, geometry: g, fill, chosen: this.chosen, picked: this.picked, pick: (id, add) => {
        // A unit picked on the strip: its settings open; with Maj, Ctrl or ⌘, it joins those chosen (or leaves them).
        if (add) {
          const was = this.picked.length ? this.picked : this.chosen ? [this.chosen] : [];
          this.picked = was.includes(id) ? was.filter((x) => x !== id) : [...was, id];
          this.chosen = this.picked.length === 1 ? this.picked[0]! : null;
          if (this.picked.length < 2) this.picked = [];
        } else {
          this.picked = [];
          this.chosen = this.chosen === id ? null : id;
        }
        this.folds.open = "chosen";
        this.host.redraw();
      }, move: (id, index) => this.move(id, index), resize: (id, width) => this.change(this.items.map((i) => (i.id === id ? { ...i, width } : i))), corner: () => ((this.folds.open = "corners"), this.host.redraw()), appliances: handAppliances(editor.doc, this.host.plan, run) });
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-run-cancel": "" }, "Annuler");
    cancel.addEventListener("click", () => this.host.back());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium", "data-run-ok": "" }, "OK");
    ok.addEventListener("click", () => this.host.apply(this.items, this.rest, this.corners));
    const clear = el("button", { type: "button", class: WIDE, disabled: !this.items.length }, "Vider le linéaire");
    clear.addEventListener("click", () => this.change([], null));
    const used = fill.placed.filter((p) => p.row === "base").reduce((sum, p) => sum + p.item.width, 0);
    const f = this.folds;
    const chosen = fill.placed.find((p) => p.item.id === this.chosen)?.item ?? this.items.find((i) => i.id === this.chosen);
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, `Linéaire — ${run.label.toLowerCase()}`),
      this.walls(),
      this.seeButton(),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${formatLength(run.length, unit)} de mur, ${formatLength(Math.max(0, g.base[1] - g.base[0]), unit)} pour les meubles bas, ${formatLength(used, unit)} pris. Glissez un meuble pour le changer de place.`),
      el("div", { class: "border border-gray-200 bg-white p-1 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200", "data-run-strip": run.id }, strip),
      this.dirty ? null : this.keepMoves(),
      // Every titled part folds; one open at a time, all closed at first.
      f.fold("space", `Place libre : ${spaceLeft(fill, (mm) => formatLength(mm, unit), run.wall)}`, () => [this.restChoice(), this.spaceRows()]),
      this.picked.length > 1
        ? f.fold("chosen", `Meubles choisis (${this.picked.length})`, () => multiRows({ plan, items: this.items, picked: this.picked, fill, unit, change: (items, picked) => this.change(items, null, picked), notify: (m, k) => this.host.editor.notify(m, k) }).filter((r): r is HTMLElement => r !== null))
        : f.fold("chosen", chosen ? `Meuble choisi : ${itemEntry(chosen).name} · ${formatLength(chosen.width, unit)}` : "Meuble choisi", () => [this.selected(chosen), pickAllRow(this.items, run.wall, (ids) => ((this.picked = ids), (this.chosen = null), this.host.redraw()))]),
      f.fold("add", "Ajouter des meubles", () => this.catalog()),
      f.fold("fillers", "Fileurs", () => this.fillerRows()),
      run.left !== "free" || run.right !== "free"
        ? f.fold("corners", run.left !== "free" && run.right !== "free" ? "Les angles" : "L'angle", () => [
            cornerChoice(plan, run, unit, (joint, c) => {
              this.corners = withCorner(this.current(), joint, c);
              this.touched();
            }, () => this.host.redraw(), false),
          ])
        : null,
      fill.problems.length ? f.fold("checks", `À revoir (${fill.problems.length})`, () => fill.problems.map((m) => el("p", { class: "text-amber-900 dark:text-amber-100" }, m))) : null,
      f.fold("price", "Prix du projet", () => [quoteButton()], el("span", { class: "font-mono font-medium", "data-live-total": "" })),
      clear,
      this.dirty ? el("p", { class: "border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100", "data-run-preview": "" }, "Aperçu dans la 3D : OK garde ces changements, Annuler revient à la cuisine d'avant.") : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** Where the rest of the base row goes, by the room left: each choice with what it makes there, fillers or room open. */
  private restChoice(): HTMLElement {
    const { run, room, editor } = this.host;
    const unit = editor.unit;
    const length = (mm: number) => formatLength(mm, unit);
    const s = kitchenSizes(this.host.plan);
    const heights = { worktop: this.host.plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop };
    const what = (side: RestSide): string => {
      const plan = this.current();
      const f = fillRun(runGeometry({ ...plan, rest: { ...plan.rest, [run.id]: side } }, run, room?.[run.id]), this.items, heights);
      const widths = [...new Set(f.fillers.map(([a, b]) => length(b - a)))];
      const fillers = f.fillers.length ? `${f.fillers.length > 1 ? `${f.fillers.length} fileurs` : "1 fileur"} de ${widths.join(" et ")}` : "";
      const open = f.free.length ? `${f.free.map(([a, b]) => length(b - a)).join(" + ")} libres` : "";
      const at = f.walls.filter((w) => w >= 1);
      const walls = at.length ? `${at.length > 1 ? "2 fileurs muraux" : "1 fileur mural"} de ${[...new Set(at.map(length))].join(" et ")}` : "";
      return [walls, fillers, open].filter(Boolean).join(", ") || "rien à combler";
    };
    // Between the walls and the corner units: only with a corner unit on a run going to the wall.
    const movable = runGeometry(this.current(), run, room?.[run.id]).movable.some(Boolean);
    const options: [RestSide, string][] = [["start", "À gauche"], ["both", "Partagé en deux"], ["end", "À droite"], ...(movable ? [["walls", "Contre les murs"] as [RestSide, string]] : [])];
    return el(
      "div",
      { class: "space-y-1" },
      el("p", { class: "text-gray-600 dark:text-gray-300" }, "Le reste du mur va :"),
      el(
        "div",
        { class: `grid ${options.length > 3 ? "grid-cols-2" : "grid-cols-3"} gap-1`, role: "group", "aria-label": "Le reste va" },
        ...options.map(([side, label]) => {
          const on = side === this.rest;
          const b = el("button", { type: "button", "aria-pressed": String(on), "data-rest": side, class: `border px-1 py-1 text-center ${on ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, el("span", { class: "block font-medium" }, label), el("span", { class: "block text-[10px] leading-tight text-gray-500 dark:text-gray-400" }, what(side)));
          b.addEventListener("click", () => {
            this.rest = side;
            this.touched();
          });
          return b;
        }),
      ),
    );
  }

  /** Units pushed along the wall in the 3D before the plan followed them: a button keeps them where they stand. */
  private keepMoves(): HTMLElement | null {
    const { plan, run, room, editor } = this.host;
    const moved = unitsMoved(editor.doc, plan, run, kitchenFromPlan(plan, room).units.filter((u) => u.run === run.id));
    const s = kitchenSizes(plan);
    const kept = Object.keys(moved).length ? itemsMoved(this.geometry(), this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }, moved) : null;
    if (!kept) return null;
    const b = el("button", { type: "button", class: `${SMALL} w-full`, "data-keep-moves": "" }, "Garder leurs places");
    b.addEventListener("click", () => this.change(kept));
    return el("div", { class: "space-y-1 border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100" }, el("p", {}, `${Object.keys(moved).length > 1 ? `${Object.keys(moved).length} meubles ont été poussés` : "Un meuble a été poussé"} le long du mur dans la 3D : le plan peut les garder là, avec la place libre qu'ils laissent.`), b);
  }

  /** The room kept free where units were pushed in the 3D: each, its width typed or taken out (its units then close up). */
  private spaceRows(): HTMLElement | null {
    const spaces = this.items.filter(isSpace);
    if (!spaces.length) return null;
    const unit = this.host.editor.unit;
    const rows = spaces.map((item) => {
      const row = rowOf(itemEntry(item));
      const same = this.items.filter((i) => rowOf(itemEntry(i)) === row);
      const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(item.width, unit), 4), "aria-label": `Espace libre (${UNIT_LABELS[unit]})`, "data-space-width": item.id });
      input.addEventListener("keydown", (event) => event.stopPropagation());
      input.addEventListener("change", () => {
        const parsed = parseNumber(input.value);
        const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
        if (mm >= 1 && mm <= 6000) this.change(this.items.map((i) => (i.id === item.id ? { ...i, width: mm } : i)));
        else input.setAttribute("aria-invalid", "true");
      });
      const out = el("button", { type: "button", class: SMALL, "data-space-remove": item.id, title: "Les meubles d'après se resserrent" }, "Supprimer");
      out.addEventListener("click", () => this.change(this.items.filter((i) => i.id !== item.id)));
      return el("div", { class: "flex items-center gap-1" }, el("span", { class: "flex-1" }, `${row === "wall" ? "Haut" : "Bas"} · place ${same.indexOf(item) + 1}/${same.length}`), input, out);
    });
    return el("div", { class: "space-y-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-spaces": String(spaces.length) }, el("p", { class: "font-medium" }, "Espaces gardés"), el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "Laissés là où des meubles ont été poussés dans la 3D."), ...rows);
  }

  /** The changes not yet applied: the units, where the rest goes, the corners. */
  pending(): [KitchenRunItem[], RestSide, CornerSetting] {
    return [this.items, this.rest, this.corners];
  }

  /** « Voir ce mur isolé », or « Tout montrer » when it is. */
  private seeButton(): HTMLElement {
    const seen = this.host.seen();
    const b = el("button", { type: "button", class: WIDE, "data-see-run": this.host.run.id, title: "Seuls ses meubles, de face, avec leurs cotes ; rien ne change dans le projet" }, seen ? "Tout montrer" : `Voir ${this.host.run.label.charAt(0).toLowerCase()}${this.host.run.label.slice(1)} isolé`);
    b.addEventListener("click", () => {
      if (seen) showAll();
      else this.host.see();
      this.host.redraw();
    });
    return b;
  }

  /** One button per run of the plan: this one pressed, the others open theirs. */
  private walls(): HTMLElement | null {
    const { runs, run } = this.host;
    if (runs.length < 2) return null;
    return el(
      "div",
      // Kept in sight while the panel scrolls.
      { class: "sticky top-0 z-10 -mx-2.5 flex flex-wrap gap-1 border-b border-gray-200 bg-white px-2.5 py-1.5 dark:border-gray-700 dark:bg-gray-900", role: "group", "aria-label": "Voir un autre linéaire" },
      ...runs.map((r) => {
        const here = r.id === run.id;
        const b = el("button", { type: "button", "aria-pressed": String(here), "data-go-run": r.id, title: here ? `${r.label} est ouvert` : `Voir ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}`, class: `h-7 flex-1 border px-2 font-medium whitespace-nowrap ${here ? "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, r.label);
        if (!here) b.addEventListener("click", () => this.host.go(r.id));
        return b;
      }),
    );
  }

  /** The item chosen: its width, another model in its place, a step left or right, or out. */
  private selected(item: KitchenRunItem | undefined): HTMLElement | null {
    if (!item) return el("p", { class: "text-gray-500 dark:text-gray-400" }, "Cliquez un meuble de la bande pour le régler ; un meuble ajouté se met après lui. Maj + clic en choisit plusieurs, pour leur donner une mesure commune.");
    const entry = itemEntry(item);
    const unit = this.host.editor.unit;
    const app = applianceOf(item);
    const replace = (patch: Partial<KitchenRunItem>) => this.change(this.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    // An appliance comes in its widths; a unit is made to measure: width, height (not under the worktop), depth.
    const widths = el("select", { class: SELECT, "aria-label": "Largeur" }, ...[...new Set([...(app?.widths ?? WIDTHS), item.width])].sort((a, b) => a - b).map((w) => el("option", { value: String(w), selected: w === item.width }, formatLength(w, unit))));
    widths.addEventListener("change", () => replace({ width: Number(widths.value) }));
    const sizes = app ? [el("label", { class: ROW }, "Largeur", widths)] : this.sizeFields(item, entry, replace);
    const row = rowOf(entry);
    const models = runModels().filter((m) => (m.kind === "wall") === (row === "wall"));
    const swap = el("select", { class: SELECT, "aria-label": "Échanger contre" }, ...(item.own ? [el("option", { value: "", selected: true }, entry.name)] : []), ...models.map((m) => el("option", { value: m.model, selected: m.model === item.model }, m.name)));
    swap.addEventListener("change", () => {
      const model = models.find((m) => m.model === swap.value);
      if (model) replace({ model: model.model, width: model.widths.includes(item.width) ? item.width : model.widths.includes(600) ? 600 : model.widths[0]!, own: undefined });
    });
    const same = this.items.filter((i) => rowOf(itemEntry(i)) === row && !isSpace(i));
    const index = same.indexOf(item);
    const step = (label: string, title: string, to: number) => {
      const b = el("button", { type: "button", class: SMALL, title, disabled: to < 0 || to >= same.length }, label);
      b.addEventListener("click", () => this.move(item.id, to));
      return b;
    };
    const out = el("button", { type: "button", class: SMALL }, "Retirer");
    out.addEventListener("click", () => this.change(this.items.filter((i) => i.id !== item.id), null));
    return el(
      "div",
      { class: "space-y-1.5 border border-sky-200 p-1.5 dark:border-sky-900", "data-run-item": item.id },
      item.height !== undefined || item.depth !== undefined || !WIDTHS.includes(item.width) ? el("p", { class: "font-medium text-sky-700 dark:text-sky-300" }, "Sur mesure") : null,
      ...sizes,
      isFiller(item) ? null : el("label", { class: ROW }, "Échanger", swap),
      el("div", { class: "flex gap-1" }, step("←", "Un cran à gauche", index - 1), step("→", "Un cran à droite", index + 1), el("span", { class: "flex-1" }), out),
    );
  }

  /** A unit's width, height and depth, typed (in the display unit) within what it may be, with the usual widths a click away. */
  private sizeFields(item: KitchenRunItem, entry: ReturnType<typeof itemEntry>, replace: (patch: Partial<KitchenRunItem>) => void): HTMLElement[] {
    const unit = this.host.editor.unit;
    const plan = this.current();
    const size = itemSize(plan, item, entry);
    const limits = sizeLimits(plan, entry);
    const field = (label: string, key: "width" | "height" | "depth", value: number, [lo, hi]: [number, number]) => {
      const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(value, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})`, "data-size": key });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
        const ok = mm >= lo && mm <= hi;
        input.setAttribute("aria-invalid", String(!ok));
        input.title = ok ? "" : `De ${formatLength(lo, unit)} à ${formatLength(hi, unit)}.`;
        if (ok && mm !== value) replace({ [key]: mm });
      };
      input.addEventListener("change", apply);
      input.addEventListener("blur", () => this.host.redraw());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          input.blur();
        }
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    // A filler: its width only.
    if (isFiller(item)) return [field("Largeur", "width", item.width, limits.width)];
    const usual = el(
      "div",
      { class: "flex flex-wrap justify-end gap-1", "aria-label": "Largeurs courantes" },
      ...WIDTHS.map((w) => {
        const b = el("button", { type: "button", class: `${WIDTH} ${w === item.width ? "border-sky-500 text-gray-900 dark:text-white" : ""}`, "data-width": String(w) }, formatLength(w, unit).replace(/\s?(mm|cm|m)$/, ""));
        b.addEventListener("click", () => replace({ width: w }));
        return b;
      }),
    );
    const own = item.height !== undefined || item.depth !== undefined;
    const reset = el("button", { type: "button", class: SMALL, disabled: !own, title: "La hauteur et la profondeur du modèle et du plan" }, "Cotes du modèle");
    reset.addEventListener("click", () => replace({ height: undefined, depth: undefined }));
    return [
      field("Largeur", "width", item.width, limits.width),
      usual,
      limits.height ? field("Hauteur", "height", size.height, limits.height) : el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, `Hauteur ${formatLength(size.height, unit)} : celle du plan de travail.`),
      field("Profondeur", "depth", size.depth, limits.depth),
      el("div", { class: "flex justify-end" }, reset),
    ];
  }

  /**
   * Fillers put by hand, low (between plinth and worktop) and up (the wall row): at the start of the row, after the unit
   * chosen, or at its end, at the width typed. They take their place on the run as a unit does; the rest is still shared.
   */
  private fillerRows(): HTMLElement[] {
    const unit = this.host.editor.unit;
    const input = el("input", { type: "text", inputmode: "decimal", class: FIELD, value: trim(toDisplay(this.fillerWidth, unit), 4), "aria-label": `Largeur du fileur (${UNIT_LABELS[unit]})`, "data-filler-width": "" });
    const read = () => {
      const parsed = parseNumber(input.value);
      const mm = parsed === null ? NaN : Math.round(fromDisplay(parsed, unit) * 10) / 10;
      const ok = mm >= 10 && mm <= 300;
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) this.fillerWidth = mm;
      return ok;
    };
    input.addEventListener("change", read);
    input.addEventListener("keydown", (event) => event.stopPropagation());
    const chosen = this.items.find((i) => i.id === this.chosen);
    const rows: ["base" | "wall", string][] = [["base", "En bas"], ...(this.host.run.wall ? ([["wall", "En haut"]] as ["wall", string][]) : [])];
    return [
      el("label", { class: ROW }, `Largeur (${UNIT_LABELS[unit]})`, input),
      el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400" }, "De 1 à 30 cm. Un fileur posé se règle en le cliquant sur la bande, et se supprime dans la liste ci-dessous."),
      ...rows.map(([row, label]) => {
        const model = row === "wall" ? FILLER_WALL : FILLER;
        const put = (where: "start" | "after" | "end") => {
          if (!read()) return this.host.editor.notify("Un fileur fait de 1 à 30 cm.", "error");
          const item = newItem(this.items, model, this.fillerWidth);
          const first = this.items.findIndex((i) => rowOf(itemEntry(i)) === row);
          const items = where === "start" ? [...this.items.slice(0, first < 0 ? this.items.length : first), item, ...this.items.slice(first < 0 ? this.items.length : first)] : insertItem(this.items, item, where === "after" ? this.chosen : null);
          this.change(items, item.id);
        };
        const button = (where: "start" | "after" | "end", text: string, disabled = false) => {
          const b = el("button", { type: "button", class: `${SMALL} flex-1`, disabled, "data-filler-add": `${row}:${where}` }, text);
          b.addEventListener("click", () => put(where));
          return b;
        };
        const after = !!chosen && rowOf(itemEntry(chosen)) === row;
        return el("div", { class: "space-y-1" }, el("p", { class: "font-medium" }, label), el("div", { class: "flex gap-1" }, button("start", "Au début"), button("after", "Après le choisi", !after), button("end", "À la fin")));
      }),
      this.placedFillers(),
    ];
  }

  /** The fillers put by hand on this run, each with its button to take it out, and one to take them all out. */
  private placedFillers(): HTMLElement {
    const unit = this.host.editor.unit;
    // Low ones first, then up, each in its order along the run.
    const hand = (i: KitchenRunItem) => isFiller(i) && !isSpace(i);
    const placed = [...this.items.filter((i) => hand(i) && rowOf(itemEntry(i)) !== "wall"), ...this.items.filter((i) => hand(i) && rowOf(itemEntry(i)) === "wall")];
    if (!placed.length) return el("p", { class: "text-[11px] text-gray-500 dark:text-gray-400", "data-fillers-placed": "0" }, "Aucun fileur posé sur ce linéaire.");
    const remove = (ids: string[]) => this.change(this.items.filter((i) => !ids.includes(i.id)), ids.includes(this.chosen ?? "") ? null : this.chosen);
    const rows = placed.map((item) => {
      const row = rowOf(itemEntry(item));
      const same = this.items.filter((i) => rowOf(itemEntry(i)) === row);
      const where = `${row === "wall" ? "Haut" : "Bas"} · ${formatLength(item.width, unit)} · place ${same.indexOf(item) + 1}/${same.length}`;
      const b = el("button", { type: "button", class: SMALL, "data-filler-remove": item.id, title: "Supprimer ce fileur" }, "Supprimer");
      b.addEventListener("click", () => remove([item.id]));
      return el("div", { class: `flex items-center gap-1 ${item.id === this.chosen ? "text-sky-700 dark:text-sky-300" : ""}` }, el("span", { class: "flex-1" }, where), b);
    });
    const all = el("button", { type: "button", class: `${SMALL} w-full`, "data-filler-remove-all": "" }, placed.length > 1 ? `Supprimer les ${placed.length} fileurs` : "Supprimer le fileur");
    all.addEventListener("click", () => remove(placed.map((i) => i.id)));
    return el("div", { class: "space-y-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-fillers-placed": String(placed.length) }, el("p", { class: "font-medium" }, "Fileurs posés"), ...rows, all);
  }

  /** What one adds, as « Meubles de cuisine » shows it: each model drawn, by family; one's own; the appliances. */
  private catalog(): HTMLElement[] {
    const unit = this.host.editor.unit;
    const wall = this.host.run.wall;
    const add = (e: CatalogEntry) => this.addEntry(e);
    const tabs = familyTabs(FAMILIES.filter(([f]) => wall || f !== "wall"), this.family, (f) => ((this.family = f), this.host.redraw()), "Ajouter");
    let rows: HTMLElement[];
    if (this.family === "mine") {
      const own = myUnits().filter((e) => wall || e.kind !== "wall");
      rows = own.length ? own.map((e) => modelRow([e], unit, add, "data-add")) : [el("p", { class: "py-2 text-gray-500 dark:text-gray-400" }, "Aucun meuble à vous : décrivez-les dans « Meubles de cuisine », onglet « Mes meubles ».")];
    } else rows = familyModels(this.family, wall).map((entries) => modelRow(entries, unit, add, "data-add"));
    const box = el("div", {}, tabs, el("div", { "aria-label": "Modèles à ajouter" }, ...rows));
    box.style.setProperty("--brass", BRASS);
    return [box];
  }
}
