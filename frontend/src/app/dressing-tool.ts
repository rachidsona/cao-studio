/**
 * Assistant « Dressing » : un dressing entier le long d'un mur (I), de deux murs en angle (L) ou de trois (U), en
 * nombres — longueurs, hauteur, profondeur, socle — et le programme de chaque mur, module par module (penderie
 * longue, double penderie, étagères, tiroirs et étagères, penderie et tiroirs). Le calcul est dans
 * document/dressing-plan.ts : chaque mur devient une Répartition avec ses Étagères, Penderies et Tiroirs, des étapes
 * ordinaires de l'historique qu'on retouche ensuite niche par niche. Tout arrive en une seule annulation ; les murs vont
 * sur le calque « Pièce », hors du débit et du devis.
 */
import { DRESSING, MODULES, defaultProgram, dressingDocument, dressingProblem, partitionInput, wallRun, wallsOf, type DressingResult, type DressingSettings, type ModuleKind, type WallName } from "../document/dressing-plan";
import type { CadDocument, Feature } from "../document/types";
import { formatLength } from "../measurements/units";
import { partitionLayout } from "../sketcher/partition";
import { CARD } from "../ui/browser";
import { el } from "../ui/dom";
import { toolIcon, trashIcon } from "../ui/icons";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Kept for the session: the last dressing set. */
let last: DressingSettings = structuredClone(DRESSING);

const MODULE_OPTIONS = (Object.keys(MODULES) as ModuleKind[]).map((k): [string, string] => [k, MODULES[k].label]);
/** The toolbar icon of each module, in the program's tree. */
const MODULE_ICONS: Record<ModuleKind, string> = { long: "i-rod", double: "i-rod", shelves: "i-shelves", drawers: "i-drawers", "rod-drawers": "i-drawers" };
const MAX_MODULES = 10;
const ROW_BUTTON = "flex size-7 shrink-0 items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700";
/** Beyond this, a rod bends: a wider hanging module is said (mm). */
const LONGEST_ROD = 1200;

export class DressingTool extends PanelTool {
  private readonly s: DressingSettings = structuredClone(last);
  private cache: { key: string; doc: CadDocument; result: DressingResult } | null = null;
  /** The walls folded in the program's tree. */
  private readonly folded = new Set<WallName>();

  constructor(ctx: ToolContext) {
    super(ctx, "Dressing", null);
  }

  /** The dressing in the current document (computed once per change of the settings). */
  private plan(): DressingResult {
    const doc = this.ctx.doc();
    const key = JSON.stringify(this.s);
    if (this.cache?.key !== key || this.cache.doc !== doc) this.cache = { key, doc, result: dressingDocument(doc, this.s) };
    return this.cache.result;
  }

  private added(): Feature[] {
    const { doc, added } = this.plan();
    return added.map((id) => doc.features.find((f) => f.id === id)).filter((f): f is Feature => f !== undefined);
  }

  protected feature(): Feature | string {
    return dressingProblem(this.s) ?? this.added()[0] ?? "Rien à implanter.";
  }

  protected override companions(): Feature[] {
    return dressingProblem(this.s) ? [] : this.added().slice(1);
  }

  /** Names and materials of the bodies, and the « Pièce » layer of the walls. */
  protected override decorate(doc: CadDocument): CadDocument {
    if (dressingProblem(this.s)) return doc;
    const made = this.plan().doc;
    return { ...doc, bodyNames: made.bodyNames, bodyInfo: made.bodyInfo, ...(made.layers ? { layers: made.layers } : {}) };
  }

  protected override blocker(): string | null {
    if (dressingProblem(this.s)) return null;
    const bad = this.added().map((f) => this.ctx.status(f.id)).find((st) => st && st.state !== "ok");
    return bad ? (bad.message ?? "Ce dressing est impossible.") : null;
  }

  private changed(): void {
    last = structuredClone(this.s);
    this.render();
    this.schedulePreview();
  }

  private setProgram(wall: WallName, program: ModuleKind[]): void {
    this.s.programs[wall] = program;
    this.changed();
  }

  /** A program proposed for every wall, after its length. */
  private propose(): void {
    for (const wall of wallsOf(this.s)) this.s.programs[wall] = defaultProgram(wallRun(this.s, wall).length);
    this.changed();
  }

  /** The widths of the modules of a wall, and the rods too long. */
  private summary(wall: WallName): string {
    const program = this.s.programs[wall];
    const layout = partitionLayout(partitionInput(this.s, wall));
    if (typeof layout === "string") return `Mur ${wall} : ${layout}`;
    const unit = this.ctx.unit();
    const widths = program.length === 1 ? [layout.caseSpans[0]![1] - layout.caseSpans[0]![0]] : layout.caseWidths;
    const long = program.some((k, i) => k !== "shelves" && k !== "drawers" && (widths[i] ?? 0) > LONGEST_ROD);
    return `Mur ${wall} : ${widths.map((w) => formatLength(Math.round(w), unit)).join(" · ")}${long ? ` — une tringle dépasse ${formatLength(LONGEST_ROD, unit)} : ajoutez un module` : ""}.`;
  }

  /**
   * The program drawn as the navigator: in a card, a folder per wall (its modules counted, « + » to add one), and a
   * row per module with its icon, its kind to choose and a bin.
   */
  private programTree(): HTMLElement {
    const s = this.s;
    const folders = wallsOf(s).map((wall) => {
      const program = s.programs[wall];
      const open = !this.folded.has(wall);
      const chevron = el(
        "button",
        { type: "button", class: "size-6 shrink-0 text-base leading-none text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700", title: open ? "Replier" : "Déplier", "aria-expanded": String(open), "aria-label": `${open ? "Replier" : "Déplier"} le mur ${wall}` },
        el("span", { class: `inline-block transition-transform ${open ? "rotate-90" : ""}`, "aria-hidden": "true" }, "▸"),
      );
      chevron.addEventListener("click", () => {
        if (!this.folded.delete(wall)) this.folded.add(wall);
        this.render();
      });
      const add = el("button", { type: "button", class: `${ROW_BUTTON} text-base`, title: "Ajouter un module", "aria-label": `Ajouter un module au mur ${wall}`, disabled: program.length >= MAX_MODULES }, "+");
      add.addEventListener("click", () => {
        const proposed = defaultProgram(wallRun(s, wall).length);
        this.setProgram(wall, [...program, proposed[program.length % proposed.length] ?? "shelves"]);
      });
      const head = el(
        "div",
        { class: "flex min-h-9 items-center gap-1 px-1 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700/60" },
        chevron,
        el("span", { class: "w-7 shrink-0 text-center text-amber-600 dark:text-amber-400", "aria-hidden": "true" }, "▰"),
        el("span", { class: "flex-1 truncate" }, `Mur ${wall}`),
        el("span", { class: "px-1 text-xs text-gray-500 dark:text-gray-400" }, String(program.length)),
        add,
      );
      const rows = program.map((kind, i) => {
        const select = el(
          "select",
          { class: "min-h-8 min-w-0 flex-1 cursor-pointer truncate bg-transparent text-sm focus:outline-none", "aria-label": `Module ${wall}${i + 1}`, "data-select": `${wall}${i}` },
          ...MODULE_OPTIONS.map(([v, t]) => el("option", { value: v, selected: v === kind }, t)),
        );
        select.addEventListener("change", () => this.setProgram(wall, program.map((k, j) => (j === i ? (select.value as ModuleKind) : k))));
        const remove = el("button", { type: "button", class: `${ROW_BUTTON} hover:text-red-600 dark:hover:text-red-400`, title: "Retirer ce module", "aria-label": `Retirer le module ${wall}${i + 1}`, disabled: program.length <= 1 }, trashIcon());
        remove.addEventListener("click", () => this.setProgram(wall, program.filter((_, j) => j !== i)));
        return el(
          "li",
          { class: "flex items-center gap-1 px-1 hover:bg-gray-100 dark:hover:bg-gray-700/60" },
          el("span", { class: "w-7 shrink-0 text-center text-[11px] text-gray-500 dark:text-gray-400" }, `${wall}${i + 1}`),
          toolIcon(MODULE_ICONS[kind], "size-5 shrink-0"),
          select,
          remove,
        );
      });
      return el(
        "li",
        { "data-group": wall },
        head,
        el("ul", { class: "ml-4 space-y-0.5 border-l border-gray-200 pl-1 dark:border-gray-600", ...(open ? {} : { hidden: "" }) }, ...rows),
      );
    });
    return el(
      "div",
      { class: `cad-tree p-1 ${CARD}` },
      el("p", { class: "flex min-h-8 items-center px-2 text-xs font-semibold tracking-wider text-sky-700 uppercase dark:text-sky-400" }, `Programme (${wallsOf(s).reduce((n, w) => n + s.programs[w].length, 0)} modules)`),
      el("ul", { class: "space-y-0.5" }, ...folders),
    );
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const s = this.s;
    const len = (label: string, key: "lengthA" | "lengthB" | "lengthC" | "height" | "depth" | "thickness" | "plinth") =>
      this.numberRow(label, s[key], unit, (v) => ((s[key] = Math.max(0, v)), this.changed()));
    const programRows = [this.programTree()];
    const problem = dressingProblem(s);
    const left = problem ? [] : this.plan().problems;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
    button.textContent = "Proposer un programme selon les longueurs";
    button.addEventListener("click", () => this.propose());
    return [
      this.selectRow("Disposition", s.layout, [["I", "Un mur (I)"], ["L", "Deux murs en angle (L)"], ["U", "Trois murs (U)"]], (v) => {
        s.layout = v as DressingSettings["layout"];
        this.changed();
      }),
      len("Mur A", "lengthA"),
      s.layout !== "I" ? len("Mur B (gauche)", "lengthB") : null,
      s.layout === "U" ? len("Mur C (droite)", "lengthC") : null,
      len("Hauteur", "height"),
      len("Profondeur", "depth"),
      len("Épaisseur", "thickness"),
      len("Socle", "plinth"),
      this.checkRow("Dessiner les murs", s.walls, (v) => ((s.walls = v), this.changed())),
      ...programRows,
      button,
      problem ? null : this.info(wallsOf(s).map((w) => this.summary(w)).join(" ")),
      left.length ? this.info(left.join(" ")) : null,
      this.info("Le mur A part de l'origine vers +X, le dressing devant (Y < 0) ; en L et en U, les murs B et C commencent derrière sa profondeur. Chaque module se retouche ensuite avec Étagères, Cloisons, Penderie et Tiroirs."),
    ];
  }
}
