/**
 * Assistant « Dressing » : un dressing entier le long d'un mur (I), de deux murs en angle (L) ou de trois (U), en
 * nombres — longueurs, hauteur, profondeur, socle — et le programme de chaque mur, module par module (penderie
 * longue, double penderie, étagères, tiroirs et étagères, penderie et tiroirs). Le calcul est dans
 * document/dressing-plan.ts : chaque mur devient une Répartition avec ses Étagères, Penderies et Tiroirs, des étapes
 * ordinaires de l'historique qu'on retouche ensuite niche par niche. Tout arrive en une seule annulation ; les murs vont
 * sur le calque « Pièce », hors du débit et du devis. Sur une Pièce relevée, il en prend les murs, s'arrête avant
 * portes et fenêtres et s'abaisse sous une retombée ou un rampant (features/room-runs.ts). Portes battantes ou
 * coulissantes, accessoires et hauteurs hors de portée : document/dressing-extras.ts.
 */
import { DRESSING, MODULES, defaultProgram, dressingDocument, dressingProblem, partitionInput, wallRun, wallsOf, type DressingResult, type DressingSettings, type ModuleKind, type WallName } from "../document/dressing-plan";
import type { CadDocument, Feature, RoomFeature } from "../document/types";
import { wallName } from "../features/room-plan";
import { freeStretches, roomRuns, type Placement } from "../features/room-runs";
import { formatLength } from "../measurements/units";
import { partitionLayout } from "../sketcher/partition";
import { CARD } from "../ui/browser";
import { el } from "../ui/dom";
import { toolIcon, trashIcon } from "../ui/icons";
import { PanelTool, type ToolContext } from "./panel-tool";
import { joineryPlans, previewPlans } from "./partition-plan";

/** Kept for the session: the last dressing set. */
let last: DressingSettings = structuredClone(DRESSING);

const MODULE_OPTIONS = (Object.keys(MODULES) as ModuleKind[]).map((k): [string, string] => [k, MODULES[k].label]);
/** The toolbar icon of each module, in the program's tree. */
const MODULE_ICONS: Record<ModuleKind, string> = { long: "i-rod", double: "i-rod", shelves: "i-shelves", drawers: "i-drawers", "rod-drawers": "i-drawers", shoes: "i-shelves", trousers: "i-rod" };
const MAX_MODULES = 10;
const ROW_BUTTON = "flex size-7 shrink-0 items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700";
/** Beyond this, a rod bends: a wider hanging module is said (mm). */
const LONGEST_ROD = 1200;

export class DressingTool extends PanelTool {
  private readonly s: DressingSettings = structuredClone(last);
  private cache: { key: string; doc: CadDocument; result: DressingResult } | null = null;
  /** The walls folded in the program's tree. */
  private readonly folded = new Set<WallName>();
  /** The surveyed room and the wall of it that is the dressing's wall A ("": the lengths typed here). */
  private roomWall = "";

  constructor(ctx: ToolContext) {
    super(ctx, "Dressing", null);
    const room = this.rooms()[0];
    if (room) this.roomWall = `${room.id}:0`;
  }

  private rooms(): RoomFeature[] {
    return this.ctx.doc().features.filter((f): f is RoomFeature => f.type === "room" && !f.suppressed);
  }

  /**
   * The room's walls: their lengths, the stretch of each the dressing may take (up to a door or a window) and the
   * height under a low ceiling, set into the settings; where it goes in the room. Null: the lengths typed here.
   */
  private room(): Placement | string | null {
    delete this.s.free;
    delete this.s.heights;
    if (!this.roomWall) return null;
    const [id, index] = this.roomWall.split(":");
    const room = this.rooms().find((r) => r.id === id);
    if (!room) return null;
    const runs = roomRuns(room, Number(index), this.s.layout);
    if (typeof runs === "string") return runs;
    const s = this.s;
    s.lengthA = runs.walls.A!.length;
    if (runs.walls.B) s.lengthB = runs.walls.B.length;
    if (runs.walls.C) s.lengthC = runs.walls.C.length;
    s.height = Math.min(s.height, room.height);
    s.free = {};
    s.heights = {};
    for (const wall of wallsOf(s)) {
      const info = runs.walls[wall]!;
      const low = Math.floor(info.ceiling(0)) - 10;
      if (low < s.height) s.heights[wall] = low;
      const start = wall === "A" ? 0 : s.depth;
      const stretches = freeStretches(info.spans, start, info.length, 0, s.height, 50);
      const blocked = info.spans.find((sp) => sp.to > start && sp.from < info.length && sp.bottom < s.height);
      if (wall === "A" && s.layout === "I") {
        const longest = [...stretches].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
        if (!longest) return `Le ${wallName(info.index)} n'a pas de place libre.`;
        s.free.A = longest;
      } else if (wall === "A" && blocked) return `${blocked.what[0]!.toUpperCase()}${blocked.what.slice(1)} est sur le mur A du dressing : en L et en U il le prend en entier. Choisissez un autre mur A, ou la disposition I.`;
      else if (wall !== "A") {
        const first = stretches[0];
        if (!first || first[0] > start + 1) return `Mur ${wall} : ${blocked?.what ?? "un obstacle"} touche l'angle, il n'y a pas de place.`;
        s.free[wall] = [start, first[1]];
      }
    }
    return runs.place;
  }

  private problem(): string | null {
    const room = this.room();
    return typeof room === "string" ? room : dressingProblem(this.s);
  }

  /** The dressing in the current document (computed once per change of the settings). */
  private plan(): DressingResult {
    const doc = this.ctx.doc();
    const room = this.room();
    const place = room && typeof room !== "string" ? room : undefined;
    const key = JSON.stringify([this.s, place]);
    if (this.cache?.key !== key || this.cache.doc !== doc) this.cache = { key, doc, result: dressingDocument(doc, this.s, place) };
    return this.cache.result;
  }

  private added(): Feature[] {
    const { doc, added } = this.plan();
    return added.map((id) => doc.features.find((f) => f.id === id)).filter((f): f is Feature => f !== undefined);
  }

  protected feature(): Feature | string {
    return this.problem() ?? this.added()[0] ?? "Rien à implanter.";
  }

  protected override companions(): Feature[] {
    return this.problem() ? [] : this.added().slice(1);
  }

  /** Names and materials of the bodies, and the « Pièce » layer of the walls. */
  protected override decorate(doc: CadDocument): CadDocument {
    if (this.problem()) return doc;
    const made = this.plan().doc;
    return { ...doc, bodyNames: made.bodyNames, bodyInfo: made.bodyInfo, ...(made.layers ? { layers: made.layers } : {}) };
  }

  protected override blocker(): string | null {
    if (this.problem()) return null;
    const bad = this.added().map((f) => this.ctx.status(f.id)).find((st) => st && st.state !== "ok");
    return bad ? (bad.message ?? "Ce dressing est impossible.") : null;
  }

  /** The dimensions of each wall, as in a Répartition, follow the panel. */
  protected override schedulePreview(): void {
    super.schedulePreview();
    const { doc, added } = this.plan();
    joineryPlans.current = this.problem() ? [] : previewPlans(doc, added);
    joineryPlans.changed();
  }

  protected override close(): void {
    super.close();
    joineryPlans.current = null;
    joineryPlans.changed();
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
    const long = program.some((k, i) => (k === "long" || k === "double" || k === "rod-drawers") && (widths[i] ?? 0) > LONGEST_ROD);
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
    const problem = this.problem();
    const left = problem ? [] : this.plan().problems;
    const notes = problem ? [] : this.plan().notes;
    const roomOptions: [string, string][] = [["", "Saisies ici"], ...this.rooms().flatMap((r) => r.walls.map((_, i): [string, string] => [`${r.id}:${i}`, `${r.name} : ${wallName(i)} en mur A`]))];
    const fromRoom = !!this.roomWall;
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
      roomOptions.length > 1 ? this.selectRow("Murs", this.roomWall, roomOptions, (v) => ((this.roomWall = v), this.changed())) : null,
      fromRoom && !problem ? this.info(`Murs de la pièce : A ${Math.round(s.lengthA)} mm${s.layout !== "I" ? `, B ${Math.round(s.lengthB)} mm (le mur d'avant)` : ""}${s.layout === "U" ? `, C ${Math.round(s.lengthC)} mm (le mur d'après)` : ""} ; le dressing s'arrête avant portes et fenêtres.`) : null,
      fromRoom ? null : len("Mur A", "lengthA"),
      !fromRoom && s.layout !== "I" ? len("Mur B (gauche)", "lengthB") : null,
      !fromRoom && s.layout === "U" ? len("Mur C (droite)", "lengthC") : null,
      len("Hauteur", "height"),
      len("Profondeur", "depth"),
      len("Épaisseur", "thickness"),
      len("Socle", "plinth"),
      fromRoom ? null : this.checkRow("Dessiner les murs", s.walls, (v) => ((s.walls = v), this.changed())),
      this.selectRow("Portes", s.doors ?? "none", [["none", "Aucune"], ["hinged", "Battantes (une par case)"], ["sliding", "Coulissantes (deux voies)"]], (v) => ((s.doors = v as DressingSettings["doors"]), this.changed())),
      this.checkRow("Penderie escamotable si la tringle est trop haute", !!s.pullDown, (v) => ((s.pullDown = v), this.changed())),
      ...programRows,
      button,
      problem ? null : this.info(wallsOf(s).map((w) => this.summary(w)).join(" ")),
      left.length ? this.info(left.join(" ")) : null,
      notes.length ? this.info(notes.join(" ")) : null,
      this.info("Le mur A part de l'origine vers +X, le dressing devant (Y < 0) ; en L et en U, les murs B et C commencent derrière sa profondeur. Chaque module se retouche ensuite avec Étagères, Cloisons, Penderie et Tiroirs."),
    ];
  }
}
