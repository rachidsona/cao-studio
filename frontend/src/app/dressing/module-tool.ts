/**
 * « Module » dans la vue 3D, comme Étagères (joinery-3d.ts) : un clic sur une niche d'une Répartition — ou plusieurs —,
 * le module choisi (document/dressing-modules.ts), ses cotes réglables, l'aperçu en orange et ce qui ne va pas, puis OK :
 * tout arrive en une seule annulation, en étapes ordinaires de l'historique qu'on retouche ensuite niche par niche. Un
 * module réglé à sa façon se garde dans « Mes modules » (my-modules.ts). L'outil reste pour équiper d'autres niches
 * jusqu'à Échap. Un clic dans un module déjà posé le rouvre (document/module-edit.ts) : ses étagères, ses tiroirs, la
 * hauteur de chaque niche, tout se change, et OK le remplace en une annulation.
 */
import {
  DRAWERS,
  MODULES,
  moduleEquipment,
  moduleHas,
  moduleLayout,
  moduleSizes,
  moduleWarnings,
  ROD,
  withModules,
  type ModuleKind,
  type ModuleLayout,
  type ModuleSizes,
} from "../../document/dressing-modules";
import { moduleOfNiche, withModuleChanged, withoutModule, type PlacedModule } from "../../document/module-edit";
import type { CadDocument, DisplayUnit, SketchFeature, Vec3 } from "../../document/types";
import { nicheGeometry, worldBox } from "../../features/niche-parts";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import type { Vec2 } from "../../sketcher/edit";
import { isPartition, leafNiches } from "../../sketcher/partition-history";
import type { NicheBox } from "../../sketcher/shelves";
import { el } from "../../ui/dom";
import { placePanel } from "../../ui/dock";
import { moduleChoice, moduleList } from "./module-list";
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

/** Kept for the session: the last module (mm). */
const LAST: { kind: ModuleKind; sizes: ModuleSizes; thickness: number } = { kind: "long", sizes: moduleSizes("long"), thickness: 18 };

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[7rem_1fr] items-center gap-1.5";
const SMALL = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

export class ModuleTool {
  private kind = LAST.kind;
  private sizes = { ...LAST.sizes };
  private thickness = LAST.thickness;
  /** The name of the module of « Mes modules » in use. */
  private mine: string | null = null;
  private niches: Chosen[] = [];
  /** The module placed being changed (`niches` holds its niche), and the niche of it that was clicked. */
  private editing: PlacedModule | null = null;
  private clicked: Chosen | null = null;
  private done = false;
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
    this.niches = [];
    this.editing = null;
    this.recompute();
  }

  /** A click in a niche (its centre, sketch coordinates): chooses it, or releases it. */
  click(p: Vec2): void {
    const sketch = this.sketch();
    const leaf = sketch ? leafNiches(sketch).find((n) => p[0] > n.box.x0 && p[0] < n.box.x1 && p[1] > n.box.y0 && p[1] < n.box.y1) : undefined;
    if (!leaf || !sketch) return this.host.notify("Cliquez dans une niche de la répartition.", "info");
    // A module placed comes back to be changed, unless free niches are being chosen.
    const placed = this.niches.length && !this.editing ? null : moduleOfNiche(this.host.doc(), sketch, leaf.partition, leaf.path);
    if (placed) {
      if (placed.step !== this.editing?.step) Object.assign(this, { editing: placed, kind: placed.kind, sizes: { ...placed.sizes }, thickness: placed.thickness, mine: null, niches: [{ partition: placed.partition, path: placed.path, box: placed.box }] });
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
  private laid(): { niche: Chosen; layout: ModuleLayout | null; problem: string | null }[] {
    const sketch = this.sketch();
    return this.niches.map((niche) => {
      const layout = moduleLayout(niche.box, niche.path, this.kind, this.thickness, this.sizes);
      if (typeof layout === "string") return { niche, layout: null, problem: layout };
      const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
      if (typeof geometry === "string") return { niche, layout: null, problem: geometry };
      return { niche, layout, problem: moduleEquipment(geometry, layout, this.sizes).problem };
    });
  }

  /** The shelves OK would make: the preview in volume. */
  pieces(): NicheBox[] {
    return this.laid().flatMap((l) => (l.layout && !l.problem ? l.layout.shelves : []));
  }

  /** The rods and drawers OK would make, as boxes of the world. */
  solids(): [Vec3, Vec3][] {
    const sketch = this.sketch();
    return this.laid().flatMap(({ niche, layout, problem }) => {
      const geometry = nicheGeometry({ partition: niche.partition, niche: niche.path }, sketch);
      if (!layout || problem || typeof geometry === "string") return [];
      return moduleEquipment(geometry, layout, this.sizes).parts.map(({ geometry: here, part }) => {
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
    if (!this.editing) Object.assign(LAST, { kind: this.kind, sizes: { ...this.sizes }, thickness: this.thickness });
    this.draw();
    this.host.changed();
  }

  private setKind(kind: ModuleKind): void {
    this.kind = kind;
    this.sizes = moduleSizes(kind);
    this.mine = null;
    this.recompute();
  }

  private warnings(): string[] {
    const partition = (id: string) => this.sketch()?.offsets?.find((r) => r.id === id);
    const all = this.laid().flatMap(({ niche, layout, problem }) => {
      const record = partition(niche.partition);
      if (!layout || problem || !record || !isPartition(record)) return [];
      return moduleWarnings(layout, record.step.origin[1], record.step.depth ?? 0, this.thickness);
    });
    return [...new Set(all)];
  }

  private draw(): void {
    if (this.done) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const number = (label: string, mm: number, set: (mm: number) => void, allowZero = false): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && (allowZero ? parsed >= 0 : parsed > 0);
        input.setAttribute("aria-invalid", String(!ok));
        if (ok) {
          set(fromDisplay(parsed, unit));
          this.mine = null;
          this.recompute();
        }
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
    const mine = myModules();
    const list = moduleList(this.mine ? null : this.kind, (kind) => this.setKind(kind));
    const owned = mine.length
      ? el(
          "ul",
          { class: "divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700", "aria-label": "Mes modules" },
          ...mine.map((m) =>
            moduleChoice(m.name, m.kind, this.mine === m.name, () => {
              Object.assign(this, { kind: m.kind, sizes: { ...m.sizes }, thickness: m.thickness, mine: m.name });
              this.recompute();
            }, MODULES[m.kind].label),
          ),
        )
      : null;
    const has = moduleHas(this.kind);
    const drawers = el("select", { class: FIELD, "aria-label": "Tiroirs" }, ...Array.from({ length: 8 }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === this.sizes.drawers }, String(i + 1))));
    drawers.addEventListener("change", () => {
      this.sizes.drawers = Number(drawers.value);
      this.mine = null;
      this.recompute();
    });
    const name = el("input", { type: "text", class: `${FIELD} flex-1`, placeholder: "Nom du module", "aria-label": "Nom du module", value: this.mine ?? "" });
    name.addEventListener("keydown", (event) => event.stopPropagation());
    const keep = el("button", { type: "button", class: SMALL }, "Garder");
    keep.addEventListener("click", () => {
      const text = name.value.trim();
      if (!text) return this.host.notify("Donnez un nom à ce module.", "info");
      if (!saveMyModule({ name: text, kind: this.kind, sizes: { ...this.sizes }, thickness: this.thickness })) return this.host.notify("Ce navigateur ne peut pas garder ce module.", "error");
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
    const column = first?.layout?.steps.divisions.at(-1);
    const count = el("select", { class: FIELD, "aria-label": "Étagères" }, ...Array.from({ length: 21 }, (_, i) => el("option", { value: String(i), selected: i === (this.sizes.shelves ?? column?.input.count ?? 0) }, String(i))));
    count.addEventListener("change", () => {
      this.sizes.shelves = Number(count.value);
      delete this.sizes.heights;
      this.mine = null;
      this.recompute();
    });
    const rod = { ...ROD, ...this.sizes.rod };
    const front = { gap: DRAWERS.gap, bottomGap: DRAWERS.gap, betweenGap: DRAWERS.gap, sideGap: DRAWERS.sideGap, thickness: DRAWERS.thickness, handles: DRAWERS.handles, ...this.sizes.front };
    const handles = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: front.handles });
    handles.addEventListener("change", () => {
      this.sizes.front = { ...front, handles: handles.checked };
      this.mine = null;
      this.recompute();
    });
    const level = (key: string, mm: number) => (this.sizes.heights = { ...this.sizes.heights, [key]: mm });
    const leaves = this.niches.length === 1 ? (first?.layout?.leaves ?? []) : [];
    const equal = el("button", { type: "button", class: `${SMALL} w-full` }, "Égaliser les niches");
    equal.addEventListener("click", () => {
      delete this.sizes.heights;
      this.mine = null;
      this.recompute();
    });
    const inside = el("button", { type: "button", class: `${SMALL} w-full` }, "Poser un module dans cette niche seule");
    inside.addEventListener("click", () => Object.assign(this, { editing: null, niches: this.clicked ? [this.clicked] : [] }) && this.recompute());
    const remove = el("button", { type: "button", class: `${SMALL} w-full` }, "Retirer ce module");
    remove.addEventListener("click", () => this.remove());
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: this.niches.length === 0 || problem !== null }, "OK");
    ok.addEventListener("click", () => this.confirm());
    const box = first?.niche.box;
    const heading = !box
      ? "Cliquez une niche de la répartition, ou plusieurs : elles recevront le même module. Cliquez un module posé pour le changer."
      : this.editing
        ? `Niche du module : ${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}. Changez-le, puis OK.`
        : this.niches.length === 1
        ? `Niche choisie : ${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}. Cliquez-en d'autres pour les ajouter, ou la même pour la retirer.`
        : `${this.niches.length} niches choisies.`;
    const rows = [
      el("h3", { class: "font-semibold text-gray-700 dark:text-gray-200" }, this.editing ? `Modifier : ${MODULES[this.editing.kind].label}` : "Module"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, heading),
      list,
      owned ? el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Mes modules") : null,
      owned,
      has.spacing ? el("label", { class: ROW }, "Étagères", count) : null,
      has.spacing
        ? number("Espacement des étagères", this.sizes.spacing, (v) => {
            this.sizes.spacing = v;
            delete this.sizes.shelves;
            delete this.sizes.heights;
          })
        : null,
      leaves.length > 1 ? el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Niches, du bas vers le haut") : null,
      ...(leaves.length > 1 ? leaves.map((leaf, i) => number(`${leaf.fill === "drawers" ? "Tiroirs" : leaf.fill === "rod" ? "Penderie" : "Niche"} ${i + 1}`, leaf.box.y1 - leaf.box.y0, (v) => level(leaf.key, v))) : []),
      this.sizes.heights ? equal : null,
      has.hat ? number("Hauteur du chapeau", this.sizes.hat, (v) => (this.sizes.hat = v)) : null,
      has.drawers ? number("Zone des tiroirs", this.sizes.drawerZone, (v) => (this.sizes.drawerZone = v)) : null,
      has.drawers ? el("label", { class: ROW }, "Tiroirs", drawers) : null,
      has.drawers ? number("Jeu en haut", front.gap, (v) => (this.sizes.front = { ...front, gap: v }), true) : null,
      has.drawers && this.sizes.drawers > 1 ? number("Jeu entre façades", front.betweenGap, (v) => (this.sizes.front = { ...front, betweenGap: v }), true) : null,
      has.drawers ? number("Jeu en bas", front.bottomGap, (v) => (this.sizes.front = { ...front, bottomGap: v }), true) : null,
      has.drawers ? number("Jeu de côté", front.sideGap, (v) => (this.sizes.front = { ...front, sideGap: v }), true) : null,
      has.drawers ? number("Épaisseur façades", front.thickness, (v) => (this.sizes.front = { ...front, thickness: v })) : null,
      has.drawers ? el("label", { class: "flex min-h-8 items-center gap-2" }, handles, "Trous de poignée") : null,
      has.rod ? number("Diamètre tringle", rod.diameter, (v) => (this.sizes.rod = { ...rod, diameter: v })) : null,
      has.rod ? number("Tringle sous le haut", rod.drop, (v) => (this.sizes.rod = { ...rod, drop: v })) : null,
      number("Épaisseur des étagères", this.thickness, (v) => (this.thickness = v)),
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, this.niches.length > 1 ? `Une niche choisie ne peut pas recevoir ce module : ${problem}` : problem) : null,
      ...this.warnings().map((w) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, w)),
      el("div", { class: "flex gap-1.5" }, name, keep, this.mine ? forget : null),
      this.editing ? inside : null,
      this.editing ? remove : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  // ---- end --------------------------------------------------------------------------

  /** OK: the module in every niche chosen, as one undo step; the tool stays for other niches. */
  confirm(): void {
    if (this.done) return;
    const problem = this.laid().find((l) => l.problem)?.problem;
    if (this.niches.length === 0 || problem) return this.host.notify(problem ?? "Cliquez d'abord la niche à équiper.", "error");
    const editing = this.editing;
    const made = editing
      ? withModuleChanged(this.host.doc(), this.host.sketchId(), editing, this.kind, this.thickness, this.sizes)
      : withModules(this.host.doc(), this.host.sketchId(), this.niches, this.kind, this.thickness, this.sizes);
    if (typeof made === "string") return this.host.notify(made, "error");
    const n = this.niches.length;
    this.niches = [];
    this.editing = null;
    this.host.apply(made, editing ? `Module modifié : ${MODULES[this.kind].label.toLowerCase()}.` : `${n > 1 ? `${n} niches équipées` : "Niche équipée"} : ${MODULES[this.kind].label.toLowerCase()}.`);
    this.recompute();
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

  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  dispose(): void {
    this.done = true;
    this.panel.remove();
  }
}
