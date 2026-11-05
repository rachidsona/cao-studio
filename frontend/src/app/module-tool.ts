/**
 * « Module » dans la vue 3D, comme Étagères (joinery-3d.ts) : un clic sur une niche d'une Répartition — ou plusieurs —,
 * le module choisi (document/dressing-modules.ts), ses cotes réglables, l'aperçu en orange et ce qui ne va pas, puis OK :
 * tout arrive en une seule annulation, en étapes ordinaires de l'historique qu'on retouche ensuite niche par niche. Un
 * module réglé à sa façon se garde dans « Mes modules » (my-modules.ts). L'outil reste pour équiper d'autres niches
 * jusqu'à Échap.
 */
import {
  MODULES,
  moduleEquipment,
  moduleHas,
  moduleLayout,
  moduleSizes,
  moduleWarnings,
  withModules,
  type ModuleKind,
  type ModuleLayout,
  type ModuleSizes,
} from "../document/dressing-modules";
import type { CadDocument, DisplayUnit, SketchFeature, Vec3 } from "../document/types";
import { nicheGeometry, worldBox } from "../features/niche-parts";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import type { Vec2 } from "../sketcher/edit";
import { isPartition, leafNiches } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
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
  private done = false;
  private readonly panel: HTMLElement;

  constructor(private readonly host: ModuleToolHost) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
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
    this.recompute();
  }

  /** A click in a niche (its centre, sketch coordinates): chooses it, or releases it. */
  click(p: Vec2): void {
    const sketch = this.sketch();
    const leaf = sketch ? leafNiches(sketch).find((n) => p[0] > n.box.x0 && p[0] < n.box.x1 && p[1] > n.box.y0 && p[1] < n.box.y1) : undefined;
    if (!leaf) return this.host.notify("Cliquez dans une niche de la répartition.", "info");
    const at = this.niches.findIndex((n) => same(n.box, leaf.box));
    if (at >= 0) this.niches.splice(at, 1);
    else this.niches.push({ partition: leaf.partition, path: leaf.path, box: leaf.box });
    this.recompute();
  }

  chosen(): NicheBox[] {
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
    Object.assign(LAST, { kind: this.kind, sizes: { ...this.sizes }, thickness: this.thickness });
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
    const number = (label: string, mm: number, set: (mm: number) => void): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && parsed > 0;
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
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: this.niches.length === 0 || problem !== null }, "OK");
    ok.addEventListener("click", () => this.confirm());
    const box = first?.niche.box;
    const heading = !box
      ? "Cliquez une niche de la répartition, ou plusieurs : elles recevront le même module."
      : this.niches.length === 1
        ? `Niche choisie : ${formatLength(box.x1 - box.x0, unit)} × ${formatLength(box.y1 - box.y0, unit)}. Cliquez-en d'autres pour les ajouter, ou la même pour la retirer.`
        : `${this.niches.length} niches choisies.`;
    const rows = [
      el("h3", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Module"),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, heading),
      list,
      owned ? el("p", { class: "font-semibold text-gray-700 dark:text-gray-200" }, "Mes modules") : null,
      owned,
      has.hat ? number("Hauteur du chapeau", this.sizes.hat, (v) => (this.sizes.hat = v)) : null,
      has.drawers ? number("Zone des tiroirs", this.sizes.drawerZone, (v) => (this.sizes.drawerZone = v)) : null,
      has.drawers ? el("label", { class: ROW }, "Tiroirs", drawers) : null,
      has.spacing ? number("Espacement des étagères", this.sizes.spacing, (v) => (this.sizes.spacing = v)) : null,
      number("Épaisseur des étagères", this.thickness, (v) => (this.thickness = v)),
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, this.niches.length > 1 ? `Une niche choisie ne peut pas recevoir ce module : ${problem}` : problem) : null,
      ...this.warnings().map((w) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, w)),
      el("div", { class: "flex gap-1.5" }, name, keep, this.mine ? forget : null),
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
    const made = withModules(this.host.doc(), this.host.sketchId(), this.niches, this.kind, this.thickness, this.sizes);
    if (typeof made === "string") return this.host.notify(made, "error");
    const n = this.niches.length;
    this.niches = [];
    this.host.apply(made, `${n > 1 ? `${n} niches équipées` : "Niche équipée"} : ${MODULES[this.kind].label.toLowerCase()}.`);
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
