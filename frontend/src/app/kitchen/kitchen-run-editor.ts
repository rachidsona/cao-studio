/**
 * « Linéaire — mur A » : un linéaire du Plan de cuisine aménagé meuble par meuble, sur sa bande de face à l'échelle
 * (app/kitchen-run-strip.ts). On ajoute un meuble du catalogue, un des siens (« Mes meubles ») ou un appareil, après celui
 * qui est choisi, on le glisse pour le changer de place, on l'échange contre un autre modèle, on change sa largeur ; les
 * fileurs se calculent seuls (features/kitchen-run-items.ts) et ce que les appareils demandent s'affiche en dessous.
 * Chaque changement se voit aussitôt dans la 3D, en aperçu (app/kitchen-plan-tool.ts) ; rien ne change dans le projet avant
 * OK, qui le garde en refaisant toute la cuisine en une seule annulation (document/kitchen-floor.ts) ; Annuler revient.
 */
import { fixedPlanClass, fixedPlanToggle } from "../../ui/fixed-plan";
import { kitchenFromPlan, worktopSpans, type KitchenRoomInfo } from "../../document/kitchen-plan-build";
import { itemsMoved, unitsMoved } from "../../document/kitchen-moves";
import { itemSlid } from "../../document/kitchen-slide";
import { jointOf, kitchenSizes, runGeometry, type Joint, type KitchenRun, type RestSide } from "../../document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../document/types";
import type { CatalogEntry } from "../../document/kitchen-catalog";
import { applianceOf, entryItem, fillRun, inKeptRoom, insertItem, isFiller, isSpace, itemEntry, joinedSpaces, newItem, openRoom, rowOf, runModels, sizeLimits, spaceLeft, widestRoom, WIDTHS, type RunFill } from "../../features/kitchen-run-items";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import { el } from "../../ui/dom";
import { panelHeader } from "../../ui/panel-close";
import type { Editor } from "../editor";
import { Folds } from "../../ui/fold";
import { capUnits, familyModels, familyTabs, modelRow } from "./kitchen-catalog-view";
import { kickOf, withCorner, type CornerChange, type CornerSetting } from "../../document/kitchen-corners";
import { cornerChoice, cornerChosen } from "./kitchen-corner-choice";
import { quoteButton } from "../workshop/live-price";
import { BRASS } from "./unit-elevation";
import { showAll } from "../zone-view";
import { runStrip, type StripOther } from "./kitchen-run-strip";
import { editStripWidth } from "./kitchen-strip-edit";
import { handAppliances } from "../../document/kitchen-hand-appliances";
import { myUnits } from "./my-units";
import { missingRows, noRoomFor } from "./kitchen-run-missing";
import { fillerFromGap, fillerRows } from "./kitchen-run-fillers";
import { caissonActions, furnishItem, insideRows } from "./kitchen-unit-inside";
import { heldRows } from "./kitchen-held-rows";
import { widenRows } from "./kitchen-widen-rows";
import { doorsToggle } from "./strip-doors";
import { heldFace } from "./held-face";
import { sizeFields } from "./kitchen-unit-sizes";
import { stripActions, withRoomLeft } from "./kitchen-strip-actions";
import { alignedOver } from "../../features/kitchen-run-align";
import { withApplianceRemoved } from "../../document/appliance-remove";
import { multiRows, pickAllRow } from "./kitchen-run-multi-view";

const SMALL = "h-7 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const WIDE = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-2 text-right font-mono text-xs focus:border-sky-500 focus:outline-none aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const SELECT = "h-7 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";

type Family = "base" | "wall" | "cap" | "tall" | "appliance" | "mine";
const FAMILIES: [Family, string][] = [["base", "Bas"], ["wall", "Hauts"], ["cap", "Casquettes"], ["tall", "Colonnes"], ["appliance", "Électro."], ["mine", "Mes meubles"]];

export interface RunEditorHost {
  editor: Editor;
  plan: KitchenFloorPlan;
  planId: string;
  run: KitchenRun;
  room?: KitchenRoomInfo;
  /** The unit chosen when it opens, and the part of the panel open (the run made again under it: it stays as it was). */
  chosen?: string | null;
  fold?: string | null;
  other?: StripOther | null;
  /** The strip had the keyboard (the run made again under it: Suppr and the arrows still go to what is chosen). */
  focus?: boolean;
  redraw(): void;
  /** Something changed: stored a moment later (no « OK »), the kitchen made again. */
  changed(): void;
  /** The other runs of the plan, to open one of them. */
  runs: KitchenRun[];
  go(runId: string): void;
  /** This run alone in the view, from the front, with its sizes; and whether it is so. */
  see(): void;
  seen(): boolean;
  /** The cross: what is waiting is stored, and the run closes. */
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
  /** What else is chosen on the strip: an appliance put by hand, or the worktop; the worktop taken away or put back here. */
  private other: StripOther | null = null;
  private worktop: boolean | undefined;
  /** What was changed of the run's plinth here: taken away or put back, set back, its look (null: its material's own). */
  private kick: { on?: boolean; back?: number; look?: string | null } = {};
  /** The strip takes the keyboard when it is drawn next: something on it was just chosen or changed. */
  private focusStrip = false;
  private readonly folds = new Folds(() => this.host.redraw());
  /** Something changed and not stored yet (it is, a moment later). */
  dirty = false;

  constructor(private readonly host: RunEditorHost) {
    this.items = structuredClone(host.plan.runs?.[host.run.id] ?? []);
    this.chosen = this.items.some((i) => i.id === host.chosen) ? host.chosen! : null;
    this.rest = runGeometry(host.plan, host.run).rest;
    this.folds.open = host.fold ?? null;
    this.focusStrip = host.focus === true;
    // The plinth or the worktop chosen stays chosen (set back again, another look), if it is still there.
    const other = host.other ?? null;
    this.other = (other?.kind === "kick" ? !kickOf(host.plan, host.run.id).on : other?.kind === "caisson" ? !this.items.some((i) => i.id === other.id && i.furnished) : false) ? null : other;
  }

  /** The title, with the cross that stores what waits and closes the run. */
  private header(title: string): HTMLElement {
    const head = panelHeader(title, () => this.host.back());
    head.querySelector("[data-panel-close]")?.setAttribute("data-run-close", "");
    return head;
  }

  get runId(): string {
    return this.host.run.id;
  }

  /** The item chosen on the strip. */
  get chosenItem(): string | null {
    return this.chosen;
  }

  get openFold(): string | null {
    return this.folds.open;
  }

  get otherChosen(): StripOther | null {
    return this.other;
  }

  private change(items: KitchenRunItem[], chosen = this.chosen, picked = this.picked): void {
    if (chosen && items.some((i) => i.id === chosen && i.furnished)) [this.other, chosen] = [{ kind: "caisson", id: chosen }, null]; // a caisson furnished by hand, moved
    this.items = joinedSpaces(items);
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
    // In the room kept free when it has some wide enough (a unit deleted leaves its place); else after the one chosen.
    const next = inKeptRoom(this.items, item) ?? insertItem(this.items, item, this.chosen);
    // No room for it, even in the room kept free: not added, rather than left on the run unseen.
    const why = noRoomFor(this.fillOf(next), item, this.host.editor.unit, this.fillOf());
    if (why) return this.host.editor.notify(why, "error");
    this.change(next, item.id);
  }

  /** The run filled with these items (its own), as the plan would be. */
  private fillOf(items: readonly KitchenRunItem[] = this.items): RunFill {
    const plan = this.current();
    const s = kitchenSizes(plan);
    return fillRun(this.geometry(), items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
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
    // Among the units of its row as the strip shows them: the room kept free is not one, a caisson furnished there is.
    const same = others.map((i, k) => [i, k] as const).filter(([i]) => rowOf(itemEntry(i)) === row && (!isSpace(i) || !!i.furnished));
    const at = index >= same.length ? (same.at(-1)?.[1] ?? others.length - 1) + 1 : same[index]![1];
    this.change([...others.slice(0, at), item, ...others.slice(at)], id);
  }

  /** A unit dropped in the free room beside it on the strip: put down there, the others where they were (document/kitchen-slide.ts). */
  private slide(id: string, by: number): void {
    const plan = this.current();
    const s = kitchenSizes(plan);
    const made = itemSlid(plan, this.host.run, this.host.room?.[this.host.run.id], this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }, id, by);
    if (typeof made === "string") return (this.host.editor.notify(made, "info"), this.host.redraw());
    this.rest = made.rest;
    this.focusStrip = true;
    this.change(made.items, id, []);
  }

  /** The corners chosen here, and the worktop taken away or put back. */
  private get settings(): CornerSetting {
    const { plan, run } = this.host;
    const k = this.kick;
    return {
      ...this.corners, ...(this.worktop === undefined ? {} : { noWorktop: { ...plan.noWorktop, [run.id]: !this.worktop } }),
      ...(k.on === undefined ? {} : { noKick: { ...plan.noKick, [run.id]: !k.on } }), ...(k.back === undefined ? {} : { kickSetback: { ...plan.kickSetback, [run.id]: k.back } }), ...(k.look === undefined ? {} : { kickLook: k.look ?? undefined }),
    };
  }

  /** The plan as it would be: this run's rest and the corners chosen here. */
  private current(): KitchenFloorPlan {
    const { plan, run } = this.host;
    return { ...plan, rest: { ...plan.rest, [run.id]: this.rest }, ...this.settings };
  }

  render(): HTMLElement[] {
    const { run, editor } = this.host;
    const plan = this.current();
    const unit = editor.unit;
    const g = this.geometry();
    const s = kitchenSizes(plan);
    const fill = fillRun(g, this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
    this.items = fill.items; // a unit put in the room kept free stands there in the run's order too
    const appliances = handAppliances(editor.doc, this.host.plan, run);
    const off = plan.noWorktop?.[run.id] === true;
    // What is chosen on the strip, acted on from under it, by the keyboard or a right click.
    const caisson = caissonActions(editor, (id) => this.items.find((i) => i.id === id)?.furnished, () => this.dirty, () => ((this.other = null), (this.focusStrip = true), this.host.redraw(), this.host.changed()));
    const actions = stripActions({
      items: this.items, chosen: this.chosen, picked: this.picked, other: this.other, worktopOff: off, appliances,
      change: (items, chosen, picked) => ((this.focusStrip = true), this.change(items, chosen, picked ?? [])),
      putAfter: (copy, after) => {
        const next = insertItem(this.items, copy, after);
        const why = noRoomFor(this.fillOf(next), copy, unit, fill);
        if (why) return editor.notify(why, "error");
        this.focusStrip = true;
        this.change(next, copy.id, []);
      },
      move: (id, index) => ((this.focusStrip = true), this.move(id, index)),
      removeAppliance: (id) => {
        this.other = null;
        void editor.change(withApplianceRemoved(editor.doc, id)).then(() => (this.host.redraw(), this.host.changed()));
      },
      ...caisson,
      setWorktop: (on) => ((this.worktop = on), (this.other = null), this.touched()), removeCorner: (side, row) => ((this.other = null), (this.corners = withCorner(this.current(), jointOf(run, side), row === "wall" ? { wall: "none" } : { kind: "dead" })), this.touched()),
      kick: { ...kickOf(plan, run.id), look: plan.kickLook },
      setKick: (change) => ((this.kick = { ...this.kick, ...change }), change.on === false ? (this.other = null) : 0, (this.focusStrip = true), this.touched()),
      align: (id) => {
        const made = alignedOver(g, this.items, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }, id);
        if (typeof made === "string") return editor.notify(made, "info");
        this.focusStrip = true;
        this.change(made.items, id, []);
        editor.notify(`Aligné sur « ${made.on} », bord ${made.side}.`, "success");
      },
    });
    const focus = this.focusStrip;
    this.focusStrip = false;
    const strip = runStrip({ plan, run, geometry: g, fill, boxes: kitchenFromPlan(plan, this.host.room).boxes.filter((b) => b.run === run.id), chosen: this.chosen, picked: this.picked, worktop: off ? [] : worktopSpans(run, fill), other: this.other, focus, held: (sketch, bare) => heldFace(editor.doc, sketch, bare), key: actions.key, menu: actions.menu, pickOther: (what) => {
        // An appliance put by hand, or the worktop: chosen instead of a unit (clicked again: no longer).
        this.other = this.other && JSON.stringify(this.other) === JSON.stringify(what) ? null : what;
        this.chosen = null;
        this.picked = [];
        this.focusStrip = true;
        if (this.other?.kind === "caisson" || this.other?.kind === "corner") this.folds.open = "chosen";
        this.host.redraw();
      }, pick: (id, add) => {
        this.other = null;
        this.focusStrip = true;
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
      }, move: (id, index) => this.move(id, index), slide: (id, by) => this.slide(id, by), resize: (id, width) => this.change(this.items.map((i) => (i.id === id ? { ...i, width } : i))), corner: () => ((this.folds.open = "corners"), this.host.redraw()), appliances, edit: (what, label) => editStripWidth({ plan, run, items: this.items, unit, setItems: (items) => this.change(items), setCorners: (c) => ((this.corners = c), this.touched()) }, what, label), filler: (gap) => { const made = fillerFromGap(this.items, fill, gap); this.focusStrip = true; this.change(made.items, made.id, []); } });
    const clear = el("button", { type: "button", class: WIDE, disabled: !this.items.length }, "Vider le linéaire");
    clear.addEventListener("click", () => this.change([], null));
    const f = this.folds;
    const chosen = fill.placed.find((p) => p.item.id === this.chosen)?.item ?? this.items.find((i) => i.id === this.chosen);
    const setCorner = (joint: Joint, c: CornerChange) => ((this.corners = withCorner(this.current(), joint, c)), this.touched());
    const corner = this.other?.kind === "corner" ? cornerChosen(plan, run, unit, setCorner, () => this.host.redraw(), this.other.side, this.other.row) : null;
    const held = this.other?.kind === "caisson" ? this.items.find((i) => i.id === (this.other as { id: string }).id && i.furnished) : undefined;
    const rows: (HTMLElement | null)[] = [
      this.header(`Linéaire — ${run.label.toLowerCase()}`),
      // The walls and the strip stay in sight while the panel scrolls, as the schema of the dressing plan (« Plan fixe »).
      el("div", { class: `${fixedPlanClass()} -mx-2.5 space-y-1.5 border-b border-gray-200 bg-white px-2.5 pt-1.5 pb-2 dark:border-gray-700 dark:bg-gray-900`, "data-run-fixed": "" },
        // Fixed at the top while the panel scrolls, or scrolling with it (kept for the dressing too).
        el("div", { class: "flex items-center justify-end gap-3" }, doorsToggle(() => this.host.redraw()), fixedPlanToggle(() => this.host.redraw())),
        this.walls(),
        el("div", { class: "border border-gray-200 bg-white p-1 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200", "data-run-strip": run.id }, strip),
      ),
      this.seeButton(),
      actions.bar,
      this.dirty ? null : this.keepMoves(),
      // Every titled part folds; one open at a time, all closed at first.
      f.fold("space", `Place libre : ${spaceLeft(fill, (mm) => formatLength(mm, unit), run.wall)}`, () => [this.restChoice(), widenRows({ plan: this.current(), geometry: this.geometry(), items: this.items, unit, change: (items, id) => this.change(items, id), notify: (m) => this.host.editor.notify(m, "info") }), this.spaceRows()]),
      this.picked.length > 1
        ? f.fold("chosen", `Meubles choisis (${this.picked.length})`, () => multiRows({ plan, items: this.items, picked: this.picked, fill, unit, change: (items, picked) => this.change(items, null, picked), notify: (m, k) => this.host.editor.notify(m, k) }).filter((r): r is HTMLElement => r !== null))
        : corner
        ? f.fold("chosen", `Meuble choisi : ${corner.title}`, () => [corner.body])
        : held
        ? f.fold("chosen", `Meuble choisi : caisson aménagé · ${formatLength(held.width, unit)}`, () => [heldRows({ editor: this.host.editor, plan, item: held, busy: this.dirty, width: (mm) => this.change(this.items.map((i) => (i.id === held.id ? { ...i, width: mm } : i))), open: () => caisson.openCaisson(held.id), done: () => (this.host.redraw(), this.host.changed()), redraw: () => this.host.redraw() })])
        : f.fold("chosen", chosen ? `Meuble choisi : ${itemEntry(chosen).name} · ${formatLength(chosen.width, unit)}` : "Meuble choisi", () => [this.selected(chosen), pickAllRow(this.items, run.wall, (ids) => ((this.picked = ids), (this.chosen = null), this.host.redraw()))]),
      f.fold("add", "Ajouter des meubles", () => this.catalog()),
      f.fold("fillers", "Fileurs", () => this.fillerRows()),
      run.left !== "free" || run.right !== "free"
        ? f.fold("corners", run.left !== "free" && run.right !== "free" ? "Les angles" : "L'angle", () => [cornerChoice(plan, run, unit, setCorner, () => this.host.redraw(), false)])
        : null,
      fill.problems.length ? f.fold("checks", `À revoir (${fill.problems.length})`, () => [...fill.problems.map((m) => el("p", { class: "text-amber-900 dark:text-amber-100" }, m)), ...missingRows(fill, unit, (ids) => this.change(this.items.filter((i) => !ids.includes(i.id)), this.chosen))]) : null,
      f.fold("price", "Prix du projet", () => [quoteButton()], el("span", { class: "font-mono font-medium", "data-live-total": "" })),
      clear,
      this.dirty ? el("p", { class: "border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100", "data-run-preview": "" }, "Enregistré dans un instant : la cuisine est refaite, Ctrl + Z annule.") : null,
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
      const low = openRoom(f, "base");
      const open = low.length ? `${low.map(([a, b]) => length(b - a)).join(" + ")} libres` : "";
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
          const b = el("button", { type: "button", "aria-pressed": String(on), "data-rest": side, class: `border px-1 py-1 text-center ${on ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"}` }, el("span", { class: "block font-medium" }, label), el("span", { class: "block text-3xs leading-tight text-gray-500 dark:text-gray-400" }, what(side)));
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
      return el("div", { class: "flex items-center gap-1" }, el("span", { class: "flex-1" }, `${row === "wall" ? "En haut" : "En bas"}, ${((b) => (b ? `après « ${itemEntry(b).name} »` : "au début"))(same.slice(0, same.indexOf(item)).reverse().find((i) => !isSpace(i)))}`), input, out);
    });
    return el("div", { class: "space-y-1 border-t border-gray-200 pt-1.5 dark:border-gray-700", "data-spaces": String(spaces.length) }, el("p", { class: "font-medium" }, "Espaces gardés"), el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "Les places laissées vides : un meuble supprimé, glissé sur la bande ou poussé dans la 3D. Côte à côte, elles ne font qu'une ; un meuble ajouté s'y met s'il y tient. « Supprimer » referme la place : les meubles d'après se rapprochent."), ...rows);
  }

  /** The changes not yet applied: the units, where the rest goes, the corners. */
  pending(): [KitchenRunItem[], RestSide, CornerSetting] {
    return [this.items, this.rest, this.settings];
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
      // Kept in sight with the strip while the panel scrolls (rows()).
      { class: "flex flex-wrap gap-1", role: "group", "aria-label": "Voir un autre linéaire" },
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
    const sizes = app ? [el("label", { class: ROW }, "Largeur", widths)] : sizeFields({ item, entry, plan: this.current(), unit, replace, redraw: () => this.host.redraw() });
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
    out.addEventListener("click", () => this.change(withRoomLeft(this.items, [item.id]), null));
    return el(
      "div",
      { class: "space-y-1.5 border border-sky-200 p-1.5 dark:border-sky-900", "data-run-item": item.id },
      item.height !== undefined || item.depth !== undefined || !WIDTHS.includes(item.width) ? el("p", { class: "font-medium text-sky-700 dark:text-sky-300" }, "Sur mesure") : null,
      ...sizes,
      isFiller(item) ? null : el("label", { class: ROW }, "Échanger", swap),
      insideRows({ item, entry, replace, ...(this.dirty ? {} : { furnish: () => void furnishItem(this.host.editor, this.host.plan, this.host.run.id, this.host.room, item.id) }) }),
      el("div", { class: "flex gap-1" }, step("←", "Un cran à gauche", index - 1), step("→", "Un cran à droite", index + 1), el("span", { class: "flex-1" }), out),
    );
  }

  /** Fillers put by hand, low and up, and those placed (kitchen-run-fillers.ts). */
  private fillerRows(): HTMLElement[] {
    return fillerRows({ items: this.items, chosen: this.chosen, wall: this.host.run.wall, unit: this.host.editor.unit, width: this.fillerWidth, setWidth: (mm) => (this.fillerWidth = mm), change: (items, chosen) => this.change(items, chosen), notify: (m, k) => this.host.editor.notify(m, k) });
  }

  /** What one adds, as « Meubles de cuisine » shows it: each model drawn, by family; one's own; the appliances. */
  private catalog(): HTMLElement[] {
    const unit = this.host.editor.unit;
    const wall = this.host.run.wall;
    const add = (e: CatalogEntry) => (e.above ? void capUnits(this.host.editor, this.host.planId, e, this.dirty) : this.addEntry(e));
    // A width of one's own, or that of the room left in its row.
    const plan = this.current();
    const fill = this.fillOf();
    const free = { limits: (e: CatalogEntry) => sizeLimits(plan, e).width, room: (e: CatalogEntry) => widestRoom(fill, rowOf(e)) || null };
    const tabs = familyTabs(FAMILIES.filter(([f]) => wall || (f !== "wall" && f !== "cap")), this.family, (f) => ((this.family = f), this.host.redraw()), "Ajouter");
    let rows: HTMLElement[];
    if (this.family === "mine") {
      const own = myUnits().filter((e) => wall || e.kind !== "wall");
      rows = own.length ? own.map((e) => modelRow([e], unit, add, "data-add", free)) : [el("p", { class: "py-2 text-gray-500 dark:text-gray-400" }, "Aucun meuble à vous : décrivez-les dans « Meubles de cuisine », onglet « Mes meubles ».")];
    } else rows = familyModels(this.family, wall).map((entries) => modelRow(entries, unit, add, "data-add", free));
    const box = el("div", {}, tabs, el("div", { "aria-label": "Modèles à ajouter" }, ...rows));
    box.style.setProperty("--brass", BRASS);
    return [box];
  }
}
