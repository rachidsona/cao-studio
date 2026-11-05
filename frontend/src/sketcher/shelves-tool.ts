/**
 * « Étagères » tool of the sketch (as Polyboard's division of a compartment): click one niche — a closed rectangular
 * area, a case of a « Répartition » — or several (a click on a chosen one releases it), set how many shelves, their thickness and how the niches share the height
 * (equal, or the bottom or the top one with a given height); the shelves are shown dashed before OK. The result is a
 * set of niches, each of which can be clicked and divided again; the tool stays until Échap. Confirming is one undo
 * step. « Cloisons » is the same tool across: upright panels dividing the niche from left to right. The maths are in
 * shelves.ts.
 */
import type { OffsetRecord, SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import type { Vec2 } from "./edit";
import type { Region } from "./loops";
import { extrusionOption } from "./extrusion-option";
import { extrusionGroups, idsFrom, isShelves, nicheAt, pathKey, rebuildChain, shelvesRecord } from "./partition-history";
import type { ExtrusionGroup, SketchExtrusion } from "./mode";
import { boundaryCurves, regionAt } from "./region-pick";
import { addShelves, MAX_SHELVES, nicheBox, partBox, shelfLayout, shelfLines, type NicheBox, type ShelfInput, type ShelfLayout, type ShelfMode } from "./shelves";
import type { Preview } from "./tools";

export interface ShelvesHost {
  geometry(): SketchGeometry;
  /** The closed areas of the sketch (what a click inside a shape chooses). */
  regions(): Region[];
  /** Curves highlighted in the sketch; shared with the sketch mode (read the current set each time). */
  selection: Set<string>;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Stores the new geometry as one undo step (with the shelves extruded when asked); false when it was refused. */
  apply(geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion): boolean;
  /** An id for a new step of the history, unique in the document. */
  offsetId(): string;
  /** The preview or the selection changed (redraw). */
  changed(): void;
  /** The tool ended. */
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Kept for the session: the last values (mm), of the shelves and of the cloisons. */
const LAST: Record<"shelves" | "cloisons", ShelfInput> = {
  shelves: { count: 1, thickness: 18, mode: "equal", fixed: 300 },
  cloisons: { count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true },
};

/** The words of each tool. */
const WORDS = {
  shelves: { title: "Étagères", one: "étagère", many: "étagères", these: "ces étagères", way: "du bas vers le haut", size: "hauteurs", first: "Celle du bas fixe", second: "Celle du haut fixe", fixed: "Hauteur fixe", between: "Entre le dessous et une étagère, entre deux étagères ou entre une étagère et le dessus : une niche, que vous pouvez diviser à son tour." },
  cloisons: { title: "Cloisons", one: "cloison", many: "cloisons", these: "ces cloisons", way: "de gauche à droite", size: "largeurs", first: "Celle de gauche fixe", second: "Celle de droite fixe", fixed: "Largeur fixe", between: "Entre un côté et une cloison, ou entre deux cloisons : une niche, que vous pouvez diviser à son tour (par des étagères ou d'autres cloisons)." },
};

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";

export class ShelvesTool {
  preview: Preview | null = null;
  readonly kind: "shelves" | "cloisons";
  private readonly words: (typeof WORDS)["shelves"];
  private input: ShelfInput;
  /** The niches chosen, each with the curves of its sides (to highlight it). */
  private niches: { box: NicheBox; curves: string[] }[] = [];
  /** The shelves of each niche chosen (or why it is impossible), in the same order. */
  private layouts: (ShelfLayout | string)[] = [];
  private done = false;
  private readonly panel: HTMLElement;

  /** `editing`: the division of a niche to make again (its niche is chosen, its values come back). `vertical`: cloisons. */
  constructor(
    private readonly host: ShelvesHost,
    private readonly editing: OffsetRecord | null = null,
    vertical = false,
  ) {
    this.kind = (editing && isShelves(editing) ? editing.step.input.vertical : vertical) ? "cloisons" : "shelves";
    this.words = WORDS[this.kind];
    this.input = { ...LAST[this.kind] };
    if (editing && isShelves(editing)) {
      this.input = { ...editing.step.input };
      extrusionOption.on = editing.step.depth !== undefined;
      if (editing.step.depth !== undefined) extrusionOption.depth = editing.step.depth;
    }
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": this.words.title,
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  start(): void {
    // Changing a division: its niche is the one it divides (found again from the partition).
    if (this.editing && isShelves(this.editing)) {
      const rebuilt = rebuildChain(this.host.geometry(), this.editing.step.of);
      const node = typeof rebuilt === "string" ? undefined : rebuilt.niches.get(pathKey(this.editing.step.niche));
      if (node) this.niches = [{ box: node.box, curves: [] }];
      else this.host.notify(`La niche de ${this.words.these} n'existe plus.`, "error");
    }
    this.recompute();
  }

  /** The sketch changed under the tool (undo, redo): the niches chosen may be gone. */
  sync(): void {
    this.niches = [];
    this.host.selection.clear();
    this.recompute();
  }

  /** A click: chooses the niche under the pointer (the smallest closed area that is a rectangle), or releases it. */
  click(p: Vec2): void {
    if (this.editing) return this.host.notify(`On change les ${this.words.many} de leur niche ; terminez pour en choisir d'autres.`, "info");
    const region = regionAt(this.host.regions(), p);
    if (!region) return this.host.notify("Cliquez dans une niche : une zone fermée entre deux côtés.", "info");
    const box = nicheBox(region);
    if (!box) return this.host.notify(`Cette zone n'est pas un rectangle : une ${this.words.one} se pose dans une niche rectangulaire.`, "info");
    const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
    const at = this.niches.findIndex((n) => same(n.box, box));
    if (at >= 0) this.niches.splice(at, 1);
    else this.niches.push({ box, curves: boundaryCurves(this.host.geometry(), region) });
    // The niches are highlighted by their sides.
    this.host.selection.clear();
    for (const niche of this.niches) for (const id of niche.curves) this.host.selection.add(id);
    this.recompute();
  }

  /** The niches chosen (sketch coordinates). */
  chosen(): NicheBox[] {
    return this.niches.map((n) => n.box);
  }

  /** The shelves (or cloisons) OK would make, as boxes of the sketch: the preview in volume of the 3D view. */
  pieces(): NicheBox[] {
    return this.niches.flatMap((n, i) => {
      const layout = this.layouts[i];
      return layout && typeof layout === "object" ? layout.shelves.map((span) => partBox(n.box, span, layout)) : [];
    });
  }

  /** The niches chosen with what OK would make of each: the dimensions in the view follow the panel. */
  divided(): { box: NicheBox; into: NicheBox[] }[] {
    return this.niches.flatMap((n, i) => {
      const layout = this.layouts[i];
      return layout && typeof layout === "object" ? [{ box: n.box, into: layout.niches.map((span) => partBox(n.box, span, layout)) }] : [];
    });
  }

  // ---- computing and drawing --------------------------------------------------------

  private recompute(): void {
    if (!this.editing) Object.assign(LAST[this.kind], this.input);
    this.layouts = this.niches.map((n) => shelfLayout(n.box, this.input));
    // Every niche gets the same division, drawn dashed; one that cannot be divided is reported.
    const lines = this.niches.flatMap((n, i) => {
      const layout = this.layouts[i];
      return layout && typeof layout === "object" ? shelfLines(n.box, layout) : [];
    });
    this.preview = lines.length ? { lines, circles: [], arcs: [] } : null;
    this.draw();
    this.host.changed();
  }

  private draw(): void {
    if (this.done) return;
    // A result arriving while a field is being edited must not replace it.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const number = (label: string, mm: number, set: (mm: number) => void): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": `${label} (${UNIT_LABELS[unit]})` });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && parsed > 0;
        input.setAttribute("aria-invalid", String(!ok));
        if (ok) set(fromDisplay(parsed, unit));
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          input.blur();
        }
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    const count = el("select", { class: FIELD, "aria-label": this.words.title }, ...Array.from({ length: MAX_SHELVES }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === this.input.count }, String(i + 1))));
    count.addEventListener("change", () => {
      this.input.count = Number(count.value);
      this.recompute();
    });
    const mode = el(
      "select",
      { class: FIELD, "aria-label": "Niches" },
      el("option", { value: "equal", selected: this.input.mode === "equal" }, "Égales"),
      el("option", { value: "bottom", selected: this.input.mode === "bottom" }, this.words.first),
      el("option", { value: "top", selected: this.input.mode === "top" }, this.words.second),
      this.input.mode === "set" ? el("option", { value: "set", selected: true }, "Réglées avec l'outil Niche") : null,
    );
    mode.addEventListener("change", () => {
      this.input.mode = mode.value as ShelfMode;
      this.recompute();
    });
    const check = (label: string, checked: boolean, set: (v: boolean) => void): HTMLElement => {
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked });
      box.addEventListener("change", () => set(box.checked));
      return el("label", { class: "flex min-h-8 items-center gap-2" }, box, label);
    };
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    cancel.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: this.niches.length === 0 || this.layouts.some((l) => typeof l === "string") }, "OK");
    ok.addEventListener("click", () => this.confirm());

    const first = this.niches[0]?.box;
    const size = first ? `${formatLength(first.x1 - first.x0, unit)} × ${formatLength(first.y1 - first.y0, unit)}` : null;
    const problem = this.layouts.find((l): l is string => typeof l === "string");
    const heightsOf = (layout: ShelfLayout | string | undefined) => (layout && typeof layout === "object" ? layout.niches.map(([a, b]) => formatLength(b - a, unit)).join(" · ") : "");
    const shown = heightsOf(this.layouts[0]);
    const same = this.layouts.every((l) => heightsOf(l) === shown);
    const result =
      shown && !problem
        ? this.niches.length === 1 || same
          ? `${this.layouts[0] && typeof this.layouts[0] === "object" ? this.layouts[0].niches.length : 0} niches${new Set(shown.split(" · ")).size === 1 ? ` de ${shown.split(" · ")[0]}` : ` : ${shown}`} (${this.words.way})${this.niches.length > 1 ? `, dans chacune des ${this.niches.length} niches` : ""}.`
          : `${this.niches.length} niches choisies, de ${this.words.size} différentes : chacune est divisée.`
        : null;
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, this.editing ? `Modifier : ${this.editing.name}` : this.words.title),
      el(
        "p",
        { class: "text-gray-600 dark:text-gray-300" },
        this.niches.length === 0
          ? `Cliquez une niche (une zone fermée entre deux côtés) à diviser par des ${this.words.many} ; cliquez-en plusieurs pour leur mettre les mêmes ${this.words.many}.`
          : this.editing
            ? `Niche de ${this.words.these} : ${size}. Réglez-les, puis OK : la répartition est refaite avec elles.`
            : this.niches.length === 1
              ? `Niche choisie : ${size}. Cliquez-en d'autres pour les ajouter, ou la même pour la retirer.`
              : `${this.niches.length} niches choisies. Cliquez-en d'autres pour les ajouter, ou une choisie pour la retirer.`,
      ),
      el("label", { class: ROW }, this.words.title, count),
      number("Épaisseur", this.input.thickness, (v) => ((this.input.thickness = v), this.recompute())),
      el("label", { class: ROW }, "Niches", mode),
      this.input.mode === "bottom" || this.input.mode === "top" ? number(this.words.fixed, this.input.fixed, (v) => ((this.input.fixed = v), this.recompute())) : null,
      check(`Extruder les ${this.words.many}`, extrusionOption.on, (v) => ((extrusionOption.on = v), this.draw())),
      extrusionOption.on ? number("Profondeur", extrusionOption.depth, (v) => ((extrusionOption.depth = v), this.draw())) : null,
      result ? el("p", { class: " bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100" }, result) : null,
      problem ? el("p", { class: " bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, this.niches.length > 1 ? `Une niche choisie ne peut pas être divisée : ${problem}` : problem) : null,
      el("p", { class: "text-[11px] text-gray-500" }, this.words.between),
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  // ---- end --------------------------------------------------------------------------

  /**
   * OK: the shelves are drawn in every niche chosen. A niche of a « Répartition » gets a step of its history (made
   * again with it); another area just gets its lines. The tool stays, to divide others (or the ones just made).
   */
  confirm(): void {
    if (this.done) return;
    const problem = this.layouts.find((l): l is string => typeof l === "string");
    if (this.niches.length === 0 || problem) {
      this.host.notify(problem ?? "Cliquez d'abord la niche à diviser.", "error");
      return;
    }
    if (this.editing) return this.confirmEdit();
    const g = this.host.geometry();
    const depth = extrusionOption.on ? extrusionOption.depth : undefined;
    // Left to right, bottom to top: the shelves are numbered in that order.
    const order = this.niches.map((n, i) => ({ box: n.box, layout: this.layouts[i] as ShelfLayout })).sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
    const ids = idsFrom(this.host.offsetId(), order.length);
    const offsets = [...(g.offsets ?? [])];
    const added = new Set<string>();
    const partitions = new Set<string>();
    const plain: typeof order = [];
    order.forEach((o, i) => {
      const at = nicheAt(g, o.box);
      if (!at) return void plain.push(o);
      const used = offsets.map((r) => new RegExp(`^${this.words.title} (\\d+)$`).exec(r.name)?.[1]).filter((n): n is string => n !== undefined).map(Number);
      offsets.push(shelvesRecord(ids[i] as string, `${this.words.title} ${Math.max(0, ...used) + 1}`, at.partition, at.path, this.input, depth));
      added.add(ids[i] as string);
      partitions.add(at.partition);
    });
    let geometry: SketchGeometry = { ...g, offsets };
    const groups: ExtrusionGroup[] = [];
    for (const partition of partitions) {
      const rebuilt = rebuildChain(geometry, partition);
      if (typeof rebuilt === "string") return this.host.notify(rebuilt, "error");
      geometry = rebuilt.geometry;
      groups.push(...extrusionGroups(g.offsets ?? [], rebuilt, added));
    }
    // Areas that are not niches of a partition: the lines only (nothing to make again).
    for (const { box, layout } of plain) {
      geometry = addShelves(geometry, box, layout);
      if (depth !== undefined) {
        const centre = (b: NicheBox): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        groups.push({ distance: depth, elements: layout.shelves.map((span) => ({ probe: centre(partBox(box, span, layout)), name: layout.vertical ? "Cloison" : "Étagère", numbered: true })) });
      }
    }
    const n = order.reduce((sum, o) => sum + o.layout.shelves.length, 0);
    const where = order.length > 1 ? ` dans ${order.length} niches` : "";
    const extruded: SketchExtrusion | undefined = groups.length ? { groups } : undefined;
    if (!this.host.apply(geometry, `${n} ${this.words.one}${n > 1 ? "s" : ""}${where}${depth !== undefined ? `, extrudées de ${formatLength(depth, this.host.unit())}` : ""}.`, extruded)) return;
    this.niches = [];
    this.host.selection.clear();
    this.recompute();
  }

  /** OK on a division being changed: its step takes the new values, and the partition is made again from its steps. */
  private confirmEdit(): void {
    const rec = this.editing;
    if (!rec || !isShelves(rec)) return;
    const g = this.host.geometry();
    const depth = extrusionOption.on ? extrusionOption.depth : undefined;
    const step = { kind: "shelves" as const, of: rec.step.of, niche: rec.step.niche, input: { ...this.input }, ...(depth !== undefined ? { depth } : {}) };
    const rebuilt = rebuildChain({ ...g, offsets: (g.offsets ?? []).map((r) => (r.id === rec.id ? { ...r, step } : r)) }, rec.step.of);
    if (typeof rebuilt === "string") return this.host.notify(rebuilt, "error");
    const groups = extrusionGroups(g.offsets ?? [], rebuilt);
    const n = this.input.count;
    if (!this.host.apply(rebuilt.geometry, `${rec.name} : ${n} ${this.words.one}${n > 1 ? "s" : ""}${rebuilt.dropped.length ? ` — ${rebuilt.problems.join(" ")}` : ""}.`, groups.length ? { groups } : undefined)) return;
    this.cancel();
  }

  /** Échap or « Terminer ». */
  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.host.selection.clear();
    this.host.closed();
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    this.done = true;
    this.preview = null;
    this.panel.remove();
  }
}
