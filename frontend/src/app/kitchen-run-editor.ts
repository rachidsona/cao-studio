/**
 * « Linéaire — mur A » : un linéaire du Plan de cuisine aménagé meuble par meuble, sur sa bande de face à l'échelle
 * (app/kitchen-run-strip.ts). On ajoute un meuble du catalogue, un des siens (« Mes meubles ») ou un appareil, après celui
 * qui est choisi, on le glisse pour le changer de place, on l'échange contre un autre modèle, on change sa largeur ; les
 * fileurs se calculent seuls (features/kitchen-run-items.ts) et ce que les appareils demandent s'affiche en dessous.
 * Rien ne change dans le projet avant OK, qui refait toute la cuisine en une seule annulation (document/kitchen-floor.ts).
 */
import type { KitchenRoomInfo } from "../document/kitchen-plan-build";
import { kitchenSizes, runGeometry, type KitchenRun, type RestSide } from "../document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../document/types";
import { applianceOf, fillRun, itemEntry, newItem, rowOf, runModels, WIDTHS } from "../features/kitchen-run-items";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { Editor } from "./editor";
import { runStrip } from "./kitchen-run-strip";
import { myUnits } from "./my-units";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
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
  redraw(): void;
  apply(items: KitchenRunItem[], rest: RestSide): void;
  back(): void;
}

export class RunEditor {
  private items: KitchenRunItem[];
  private rest: RestSide;
  private chosen: string | null = null;
  private family: Family = "base";
  /** Something changed since it opened. */
  dirty = false;

  constructor(private readonly host: RunEditorHost) {
    this.items = structuredClone(host.plan.runs?.[host.run.id] ?? []);
    this.rest = runGeometry(host.plan, host.run).rest;
  }

  get runId(): string {
    return this.host.run.id;
  }

  private change(items: KitchenRunItem[], chosen = this.chosen): void {
    this.items = items;
    this.chosen = chosen;
    this.dirty = true;
    this.host.redraw();
  }

  private geometry() {
    const { plan, run, room } = this.host;
    return runGeometry({ ...plan, rest: { ...plan.rest, [run.id]: this.rest } }, run, room?.[run.id]);
  }

  /** A new item after the one chosen when it is of its row, else at the end of its row. */
  private add(model: string, width: number, own?: KitchenRunItem["own"]): void {
    const item = newItem(this.items, model, width, own);
    const row = rowOf(itemEntry(item));
    const chosen = this.items.findIndex((i) => i.id === this.chosen);
    const at = chosen >= 0 && rowOf(itemEntry(this.items[chosen]!)) === row ? chosen + 1 : this.items.reduce((last, i, k) => (rowOf(itemEntry(i)) === row ? k + 1 : last), this.items.length);
    this.change([...this.items.slice(0, at), item, ...this.items.slice(at)], item.id);
  }

  /** The item put at this place among those of its row. */
  private move(id: string, index: number): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const row = rowOf(itemEntry(item));
    const others = this.items.filter((i) => i !== item);
    const same = others.map((i, k) => [i, k] as const).filter(([i]) => rowOf(itemEntry(i)) === row);
    const at = index >= same.length ? (same.at(-1)?.[1] ?? others.length - 1) + 1 : same[index]![1];
    this.change([...others.slice(0, at), item, ...others.slice(at)], id);
  }

  render(): HTMLElement[] {
    const { plan, run, editor } = this.host;
    const unit = editor.unit;
    const g = this.geometry();
    const s = kitchenSizes(plan);
    const fill = fillRun(g, this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    const strip = runStrip({ plan, run, geometry: g, fill, chosen: this.chosen, pick: (id) => ((this.chosen = this.chosen === id ? null : id), this.host.redraw()), move: (id, index) => this.move(id, index) });
    const rest = el("select", { class: SELECT, "aria-label": "Le reste va" }, ...([["end", "À la fin du mur"], ["start", "Au début du mur"], ["both", "Des deux côtés"]] as const).map(([v, label]) => el("option", { value: v, selected: v === this.rest }, label)));
    rest.addEventListener("change", () => {
      this.rest = rest.value as RestSide;
      this.dirty = true;
      this.host.redraw();
    });
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    cancel.addEventListener("click", () => this.host.back());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium", "data-run-ok": "" }, "OK");
    ok.addEventListener("click", () => this.host.apply(this.items, this.rest));
    const clear = el("button", { type: "button", class: WIDE, disabled: !this.items.length }, "Vider le linéaire");
    clear.addEventListener("click", () => this.change([], null));
    const used = fill.placed.filter((p) => p.row === "base").reduce((sum, p) => sum + p.item.width, 0);
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, `Linéaire — ${run.label.toLowerCase()}`),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${formatLength(run.length, unit)} de mur, ${formatLength(Math.max(0, g.base[1] - g.base[0]), unit)} pour les meubles bas, ${formatLength(used, unit)} pris. Glissez un meuble pour le changer de place.`),
      el("div", { class: "border border-gray-200 bg-white p-1 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200", "data-run-strip": run.id }, strip),
      el("p", { class: "flex justify-between gap-2 font-medium" }, "Prix du projet", el("span", { "data-live-total": "" })),
      this.selected(fill.placed.find((p) => p.item.id === this.chosen)?.item ?? this.items.find((i) => i.id === this.chosen)),
      ...this.palette(),
      el("label", { class: ROW }, "Le reste va", rest),
      fill.problems.length ? el("div", { class: "space-y-1 bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", "data-run-checks": "" }, el("p", { class: "font-medium" }, "À revoir"), ...fill.problems.map((m) => el("p", {}, m))) : null,
      clear,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    return rows.filter((r): r is HTMLElement => r !== null);
  }

  /** The item chosen: its width, another model in its place, a step left or right, or out. */
  private selected(item: KitchenRunItem | undefined): HTMLElement | null {
    if (!item) return el("p", { class: "text-gray-500 dark:text-gray-400" }, "Cliquez un meuble de la bande pour le régler ; un meuble ajouté se met après lui.");
    const entry = itemEntry(item);
    const unit = this.host.editor.unit;
    const app = applianceOf(item);
    const replace = (patch: Partial<KitchenRunItem>) => this.change(this.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const widths = el("select", { class: SELECT, "aria-label": "Largeur" }, ...[...new Set([...(app?.widths ?? WIDTHS), item.width])].sort((a, b) => a - b).map((w) => el("option", { value: String(w), selected: w === item.width }, formatLength(w, unit))));
    widths.addEventListener("change", () => replace({ width: Number(widths.value) }));
    const row = rowOf(entry);
    const models = runModels().filter((m) => (m.kind === "wall") === (row === "wall"));
    const swap = el("select", { class: SELECT, "aria-label": "Échanger contre" }, ...(item.own ? [el("option", { value: "", selected: true }, entry.name)] : []), ...models.map((m) => el("option", { value: m.model, selected: m.model === item.model }, m.name)));
    swap.addEventListener("change", () => {
      const model = models.find((m) => m.model === swap.value);
      if (model) replace({ model: model.model, width: model.widths.includes(item.width) ? item.width : model.widths.includes(600) ? 600 : model.widths[0]!, own: undefined });
    });
    const same = this.items.filter((i) => rowOf(itemEntry(i)) === row);
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
      el("p", { class: "font-medium" }, `${entry.name} · ${formatLength(item.width, unit)}`),
      el("label", { class: ROW }, "Largeur", widths),
      el("label", { class: ROW }, "Échanger", swap),
      el("div", { class: "flex gap-1" }, step("←", "Un cran à gauche", index - 1), step("→", "Un cran à droite", index + 1), el("span", { class: "flex-1" }), out),
    );
  }

  /** What one adds, by family: each model and its widths; one's own; the appliances. */
  private palette(): HTMLElement[] {
    const unit = this.host.editor.unit;
    const wall = this.host.run.wall;
    const families = FAMILIES.filter(([f]) => wall || f !== "wall");
    const tabs = el(
      "div",
      { role: "tablist", "aria-label": "Ajouter", class: "flex border-b border-gray-200 dark:border-gray-700" },
      ...families.map(([key, label]) => {
        const tab = el("button", { type: "button", role: "tab", "aria-selected": String(key === this.family), class: `-mb-px flex-1 border-b-2 px-0.5 py-1.5 text-[11px] whitespace-nowrap ${key === this.family ? "border-sky-500 font-medium" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}` }, label);
        tab.addEventListener("click", () => ((this.family = key), this.host.redraw()));
        return tab;
      }),
    );
    const width = (label: string, title: string, key: string, add: () => void) => {
      const b = el("button", { type: "button", class: WIDTH, title, "data-add": key }, label);
      b.addEventListener("click", add);
      return b;
    };
    const short = (mm: number) => formatLength(mm, unit).replace(/\s?(mm|cm|m)$/, "");
    let lines: HTMLElement[];
    if (this.family === "mine") {
      const own = myUnits().filter((e) => wall || e.kind !== "wall");
      lines = own.length ? own.map((e) => el("div", { class: "flex items-center justify-between gap-2" }, el("span", { class: "min-w-0 truncate" }, e.name), width(short(e.width), `Ajouter « ${e.name} »`, e.id, () => this.add(e.id, e.width, e)))) : [el("p", { class: "text-gray-500 dark:text-gray-400" }, "Aucun meuble à vous : décrivez-les dans « Meubles de cuisine », onglet « Mes meubles ».")];
    } else {
      const models = runModels().filter((m) => (this.family === "appliance" ? m.appliance && (wall || m.kind !== "wall") : !m.appliance && m.kind === this.family));
      lines = models.map((m) => el("div", { class: "flex flex-wrap items-center gap-1" }, el("span", { class: "min-w-0 flex-1 basis-24" }, m.name), ...m.widths.map((w) => width(short(w), `Ajouter « ${m.name} » de ${formatLength(w, unit)}`, `${m.model}-${w}`, () => this.add(m.model, w)))));
    }
    return [tabs, el("div", { class: "max-h-48 space-y-1 overflow-y-auto", "aria-label": "Modèles à ajouter" }, ...lines)];
  }
}
