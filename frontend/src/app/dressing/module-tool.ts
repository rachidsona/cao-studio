/**
 * « Module » dans la vue 3D, comme Étagères (joinery-3d.ts) : un clic sur une niche d'une Répartition — ou plusieurs —,
 * le module choisi (document/dressing-modules.ts), ses cotes réglables, l'aperçu en orange et ce qui ne va pas, puis OK :
 * tout arrive en une seule annulation, en étapes ordinaires de l'historique qu'on retouche ensuite niche par niche. Un
 * module réglé à sa façon se garde dans « Mes modules » (my-modules.ts). L'outil reste pour équiper d'autres niches
 * jusqu'à Échap. Un clic dans un module déjà posé le rouvre (document/module-edit.ts) : ses étagères, ses tiroirs, la
 * hauteur de chaque niche, tout se change, et OK le remplace en une annulation. Des formules (module-formulas.ts)
 * calculent le module sur chaque niche où on le pose, et il se recalcule quand sa niche change (document/module-follow.ts).
 */
import {
  MODULES,
  moduleEquipment,
  moduleLayout,
  moduleSizes,
  moduleWarnings,
  withModules,
  type ModuleKind,
  type ModuleLayout,
  type ModuleSizes,
} from "../../document/dressing-modules";
import { moduleOfNiche, withModuleChanged, withoutModule, type PlacedModule } from "../../document/module-edit";
import { nicheVariables, withProgramModules } from "../../document/module-follow";
import { isProgrammed, resolveProgram, type ModuleProgram, type NicheVariables } from "../../document/module-program";
import type { CadDocument, DisplayUnit, SketchFeature, Vec3 } from "../../document/types";
import { nicheGeometry, worldBox } from "../../features/niche-parts";
import { formatLength } from "../../measurements/units";
import type { Vec2 } from "../../sketcher/edit";
import { isPartition, leafNiches } from "../../sketcher/partition-history";
import type { NicheBox } from "../../sketcher/shelves";
import { el } from "../../ui/dom";
import { placePanel } from "../../ui/dock";
import { panelFooter, panelHeader } from "../../ui/panel-close";
import { moduleChoice, moduleList } from "./module-list";
import { emptyProgram, formulaRows, type ProgramPart } from "./module-formulas";
import { FIELD, moduleOptionRows, SMALL } from "./module-options";
import { myModules, removeMyModule, saveMyModule } from "./my-modules";

export interface ModuleToolHost {
  doc(): CadDocument;
  sketchId(): string;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Stores this document as one undo step. */
  apply(doc: CadDocument, success: string): void;
  changed(): void;
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

type Chosen = { partition: string; path: number[]; box: NicheBox };

type Spec = { kind: ModuleKind; sizes: ModuleSizes; thickness: number };

/** Kept for the session: the last module (mm), and its formulas. */
const LAST: Spec & { program: ProgramPart | null } = { kind: "long", sizes: moduleSizes("long"), thickness: 18, program: null };

const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

export class ModuleTool {
  private kind = LAST.kind;
  private sizes = { ...LAST.sizes };
  private thickness = LAST.thickness;
  /** Its formulas: none, a module the same in every niche. */
  private program: ProgramPart | null = LAST.program ? structuredClone(LAST.program) : null;
  /** The name of the module of « Mes modules » in use. */
  private mine: string | null = null;
  private niches: Chosen[] = [];
  /** The module placed being changed (`niches` holds its niche), and the niche of it that was clicked. */
  private editing: PlacedModule | null = null;
  private clicked: Chosen | null = null;
  private done = false;
  /** Stored a moment after each whole setting (no « OK »), and what was stored last. */
  private storeTimer: number | undefined;
  private storedKey = "";
  private readonly panel: HTMLElement;

  constructor(private readonly host: ModuleToolHost) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 max-h-[calc(100%-1rem)] w-64 space-y-2 overflow-y-auto border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Module",
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  private sketch(): SketchFeature | undefined {
    const f = this.host.doc().features.find((x) => x.id === this.host.sketchId());
    return f?.type === "sketch" ? f : undefined;
  }

  start(): void {
    this.recompute();
  }

  /** The document changed under the tool (undo, redo): the niches chosen may be gone. */
  sync(): void {
    // The module being changed, read again (an undo takes its values back); else nothing chosen.
    const sketch = this.sketch();
    const placed = this.editing && sketch ? moduleOfNiche(this.host.doc(), sketch, this.editing.partition, [...this.editing.path, 0]) : null;
    if (placed) this.follow(placed);
    else Object.assign(this, { niches: [], editing: null });
    this.storedKey = this.key();
    this.recompute();
  }

  /** The module placed, as it is now, is the one changed. */
  private follow(placed: PlacedModule): void {
    // A module programmed comes back as its program: the module when no condition holds, and its formulas.
    const f = placed.formula?.program;
    const program = f ? structuredClone({ params: f.params, rules: f.rules, formulas: f.formulas }) : null;
    const spec = f ? { kind: f.kind, sizes: structuredClone(f.sizes), thickness: f.thickness } : { kind: placed.kind, sizes: { ...placed.sizes }, thickness: placed.thickness };
    Object.assign(this, { editing: placed, ...spec, program, niches: [{ partition: placed.partition, path: placed.path, box: placed.box }] });
  }

  /** The program as it would be laid now (its formulas may be none yet). */
  private whole(): ModuleProgram | null {
    return this.program ? { kind: this.kind, sizes: this.sizes, thickness: this.thickness, ...this.program } : null;
  }

  /** The program, if there is something to work out. */
  private programmed(): ModuleProgram | null {
    const whole = this.whole();
    return whole && isProgrammed(whole) ? whole : null;
  }

  private variables(n: Chosen): NicheVariables {
    return nicheVariables(this.sketch(), n.partition, n.box);
  }

  /** What this niche gets: the module set, or what its formulas make of it (a string: why they cannot). */
  private spec(n: Chosen): Spec | string {
    const programmed = this.programmed();
    return programmed ? resolveProgram(programmed, this.variables(n)) : { kind: this.kind, sizes: this.sizes, thickness: this.thickness };
  }

  /** What would be stored: the module, its sizes, its niches. */
  private key(): string {
    return JSON.stringify([this.kind, this.sizes, this.thickness, this.program, this.niches.map((n) => n.path), this.editing?.step ?? null]);
  }

  /** A whole setting (a niche chosen, nothing wrong) is stored a moment later. */
  private schedule(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    if (this.done || this.niches.length === 0 || this.key() === this.storedKey || this.laid().some((l) => l.problem)) return;
    // Niches being picked (several clicks may share one module): a little longer before it is stored.
    this.storeTimer = window.setTimeout(() => ((this.storeTimer = undefined), this.store()), this.editing ? 400 : 1200);
  }

  /** A click in a niche (its centre, sketch coordinates): chooses it, or releases it. */
  click(p: Vec2): void {
    const sketch = this.sketch();
    const leaf = sketch ? leafNiches(sketch).find((n) => p[0] > n.box.x0 && p[0] < n.box.x1 && p[1] > n.box.y0 && p[1] < n.box.y1) : undefined;
    if (!leaf || !sketch) return this.host.notify("Cliquez dans une niche de la répartition.", "info");
    // A module placed comes back to be changed, unless free niches are being chosen.
    const placed = this.niches.length && !this.editing ? null : moduleOfNiche(this.host.doc(), sketch, leaf.partition, leaf.path);
    if (placed) {
      if (placed.step !== this.editing?.step) {
        this.follow(placed);
        this.mine = null;
        // As it is: nothing to store until something changes.
        this.storedKey = this.key();
      }
      this.clicked = { partition: leaf.partition, path: leaf.path, box: leaf.box };
      return this.recompute();
    }
    if (this.editing) Object.assign(this, { editing: null, niches: [] });
    const at = this.niches.findIndex((n) => same(n.box, leaf.box));
    if (at >= 0) this.niches.splice(at, 1);
    else this.niches.push({ partition: leaf.partition, path: leaf.path, box: leaf.box });
    this.recompute();
  }

  chosen(): NicheBox[] {
    const root = this.editing?.box;
    const sketch = this.sketch();
    if (root && sketch) return leafNiches(sketch).map((n) => n.box).filter((b) => b.x0 > root.x0 - 1e-6 && b.y0 > root.y0 - 1e-6 && b.x1 < root.x1 + 1e-6 && b.y1 < root.y1 + 1e-6);
    return this.niches.map((n) => n.box);
  }

  /** Each niche chosen with its module, or why it does not fit. */
  private laid(): { niche: Chosen; spec: Spec; layout: ModuleLayout | null; problem: string | null }[] {
    const sketch = this.sketch();
    return this.niches.map((niche) => {
      const spec = this.spec(niche);
      if (typeof spec === "string") return { niche, spec: { kind: this.kind, sizes: this.sizes, thickness: this.thickness }, layout: null, problem: spec };
      const layout = moduleLayout(niche.box, niche.path, spec.kind, spec.thickness, spec.sizes);
      if (typeof layout === "string") return { niche, spec, layout: null, problem: layout };
      const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
      if (typeof geometry === "string") return { niche, spec, layout: null, problem: geometry };
      return { niche, spec, layout, problem: moduleEquipment(geometry, layout, spec.sizes).problem };
    });
  }

  /** The shelves OK would make: the preview in volume. */
  pieces(): NicheBox[] {
    return this.laid().flatMap((l) => (l.layout && !l.problem ? l.layout.shelves : []));
  }

  /** The rods and drawers OK would make, as boxes of the world. */
  solids(): [Vec3, Vec3][] {
    const sketch = this.sketch();
    return this.laid().flatMap(({ niche, spec, layout, problem }) => {
      const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
      if (!layout || problem || typeof geometry === "string") return [];
      return moduleEquipment(geometry, layout, spec.sizes).parts.map(({ geometry: here, part }) => {
        if (part.kind === "box") return worldBox(here, part);
        const r = part.radius ?? 1;
        return worldBox(here, { from: [part.from[0], part.from[1] - r, part.from[2] - r], to: [part.to[0], part.to[1] + r, part.to[2] + r] });
      });
    });
  }

  /** The niches chosen with what OK would make of each: the dimensions in the view follow the panel. */
  divided(): { box: NicheBox; into: NicheBox[] }[] {
    return this.laid().flatMap((l) => (l.layout && !l.problem ? [{ box: l.niche.box, into: l.layout.niches }] : []));
  }

  // ---- panel ------------------------------------------------------------------------

  private recompute(): void {
    if (!this.editing) Object.assign(LAST, { kind: this.kind, sizes: { ...this.sizes }, thickness: this.thickness, program: this.program ? structuredClone(this.program) : null });
    this.draw();
    this.host.changed();
    this.schedule();
  }

  private setKind(kind: ModuleKind): void {
    this.kind = kind;
    this.sizes = moduleSizes(kind);
    this.mine = null;
    this.recompute();
  }

  private warnings(): string[] {
    const partition = (id: string) => this.sketch()?.offsets?.find((r) => r.id === id);
    const all = this.laid().flatMap(({ niche, spec, layout, problem }) => {
      const record = partition(niche.partition);
      if (!layout || problem || !record || !isPartition(record)) return [];
      return moduleWarnings(layout, record.step.origin[1], record.step.depth ?? 0, spec.thickness);
    });
    return [...new Set(all)];
  }

  private draw(): void {
    if (this.done) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const mine = myModules();
    const list = moduleList(this.mine ? null : this.kind, (kind) => this.setKind(kind));
    const owned = mine.length
      ? el(
          "ul",
          { class: "divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700", "aria-label": "Mes modules" },
          ...mine.map((m) =>
            moduleChoice(m.name, m.kind, this.mine === m.name, () => {
              Object.assign(this, { kind: m.kind, sizes: { ...m.sizes }, thickness: m.thickness, mine: m.name, program: m.program ? structuredClone(m.program) : null });
              this.recompute();
            }, `${MODULES[m.kind].label}${m.program ? " · à formules" : ""}`),
          ),
        )
      : null;
    const name = el("input", { type: "text", class: `${FIELD} flex-1`, placeholder: "Nom du module", "aria-label": "Nom du module", value: this.mine ?? "" });
    name.addEventListener("keydown", (event) => event.stopPropagation());
    const keep = el("button", { type: "button", class: SMALL }, "Garder");
    keep.addEventListener("click", () => {
      const text = name.value.trim();
      if (!text) return this.host.notify("Donnez un nom à ce module.", "info");
      const program = this.program ? { program: structuredClone(this.program) } : {};
      if (!saveMyModule({ name: text, kind: this.kind, sizes: { ...this.sizes }, thickness: this.thickness, ...program })) return this.host.notify("Ce navigateur ne peut pas garder ce module.", "error");
      this.mine = text;
      name.blur();
      this.host.notify(`Module « ${text} » gardé dans Mes modules.`, "success");
      this.draw();
    });
    const forget = el("button", { type: "button", class: SMALL }, "Retirer");
    forget.addEventListener("click", () => {
      if (this.mine) removeMyModule(this.mine);
      this.mine = null;
      this.draw();
    });

    const laid = this.laid();
    const problem = laid.find((l) => l.problem)?.problem ?? null;
    const first = laid[0];
    // Its settings (module-options.ts): each one changed is the module's own, no longer one of « Mes modules ».
    const options = moduleOptionRows({
      kind: this.kind,
      sizes: this.sizes,
      unit,
      layout: first?.layout ?? null,
      levels: this.niches.length === 1 && !this.programmed(),
      ruled: new Set(Object.keys(this.program?.formulas ?? {})),
      thickness: { value: this.thickness, set: (mm) => (this.thickness = mm) },
      changed: () => {
        this.mine = null;
        this.recompute();
      },
      redraw: () => this.draw(),
    });
    // Its formulas (module-formulas.ts), the result shown on the first niche chosen.
    const edited = (program: ProgramPart | null) => {
      Object.assign(this, { program, mine: null });
      this.recompute();
    };
    const formulas = formulaRows({
      program: this.whole(),
      niche: first ? this.variables(first.niche) : null,
      unit,
      open: () => edited(emptyProgram()),
      close: () => edited(null),
      changed: () => edited(this.program),
      redraw: () => this.draw(),
    });
    const inside = el("button", { type: "button", class: `${SMALL} w-full` }, "Poser un module dans cette niche seule");
    inside.addEventListener("click", () => Object.assign(this, { editing: null, niches: this.clicked ? [this.clicked] : [] }) && this.recompute());
    const remove = el("button", { type: "button", class: `${SMALL} w-full` }, "Retirer ce module");
    remove.addEventListener("click", () => this.remove());
    const box = first?.niche.box;
    const heading = !box
      ? "Cliquez une niche de la répartition, ou plusieurs : elles recevront le même module. Cliquez un module posé pour le changer."
      : this.editing
        ? `Niche du module : ${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}. Chaque réglage changé est enregistré aussitôt.`
        : this.niches.length === 1
        ? `Niche choisie : ${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}. Cliquez-en d'autres pour les ajouter, ou la même pour la retirer.`
        : `${this.niches.length} niches choisies.`;
    const rows = [
      panelHeader(this.editing ? `Modifier : ${MODULES[this.editing.kind].label}` : "Module", () => this.cancel(), "h3"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, heading),
      list,
      owned ? el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Mes modules") : null,
      owned,
      ...options,
      ...formulas,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, this.niches.length > 1 ? `Une niche choisie ne peut pas recevoir ce module : ${problem}` : problem) : null,
      ...this.warnings().map((w) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, w)),
      el("div", { class: "flex gap-1.5" }, name, keep, this.mine ? forget : null),
      this.editing ? inside : null,
      this.editing ? remove : null,
      // OK keeps the module now, the tool staying for other niches; « Terminer » closes it.
      panelFooter(() => this.cancel(), () => this.confirm(), this.niches.length === 0 || problem !== null),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  // ---- end --------------------------------------------------------------------------

  /** Entrée: stored now. */
  confirm(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    this.store();
  }

  /**
   * The module in every niche chosen (or the one changed), as one undo step; the tool stays. A module just placed in
   * one niche stays chosen: what is changed next changes it.
   */
  private store(): void {
    if (this.done) return;
    const problem = this.laid().find((l) => l.problem)?.problem;
    if (this.niches.length === 0 || problem) return this.host.notify(problem ?? "Cliquez d'abord la niche à équiper.", "error");
    const editing = this.editing;
    const programmed = this.programmed();
    const made = editing ? this.changedModule(editing, programmed) : programmed ? withProgramModules(this.host.doc(), this.host.sketchId(), this.niches, structuredClone(programmed)) : withModules(this.host.doc(), this.host.sketchId(), this.niches, this.kind, this.thickness, this.sizes);
    if (typeof made === "string") return this.host.notify(made, "error");
    const n = this.niches.length;
    const one = this.niches.length === 1 ? this.niches[0]! : editing ? { partition: editing.partition, path: editing.path, box: editing.box } : null;
    this.niches = [];
    this.editing = null;
    const label = `${MODULES[this.kind].label.toLowerCase()}${programmed ? " à formules" : ""}`;
    this.host.apply(made, editing ? `Module modifié : ${label}.` : `${n > 1 ? `${n} niches équipées` : "Niche équipée"} : ${label}.`);
    const sketch = this.sketch();
    const placed = one && sketch ? moduleOfNiche(this.host.doc(), sketch, one.partition, [...one.path, 0]) : null;
    if (placed) this.follow(placed);
    this.storedKey = this.key();
    this.recompute();
  }

  /** The module placed, changed: worked out on its niche when it has formulas, and keeping them. */
  private changedModule(editing: PlacedModule, programmed: ModuleProgram | null): CadDocument | string {
    const niche = { partition: editing.partition, path: editing.path, box: editing.box };
    const spec = this.spec(niche);
    if (typeof spec === "string") return spec;
    const formula = programmed ? { program: structuredClone(programmed), at: this.variables(niche) } : undefined;
    return withModuleChanged(this.host.doc(), this.host.sketchId(), editing, spec.kind, spec.thickness, spec.sizes, formula);
  }

  /** The module placed taken away: its niche is free again, as one undo step. */
  private remove(): void {
    if (!this.editing) return;
    const made = withoutModule(this.host.doc(), this.host.sketchId(), this.editing);
    const name = MODULES[this.editing.kind].label.toLowerCase();
    this.niches = [];
    this.editing = null;
    this.host.apply(made, `Module retiré : ${name}.`);
    this.recompute();
  }

  /** The cross, or Échap: closes; a setting still waiting is stored first. */
  cancel(): void {
    if (this.done) return;
    if (this.storeTimer !== undefined) this.confirm();
    this.dispose();
    this.host.closed();
  }

  dispose(): void {
    window.clearTimeout(this.storeTimer);
    this.done = true;
    this.panel.remove();
  }
}
