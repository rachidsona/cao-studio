/**
 * « Niche » dans la vue 3D, à côté d'Étagères et Cloisons : un clic sur une niche d'une Répartition, sa hauteur, et les
 * autres niches de la même division gardent la leur ou se partagent le reste. La hauteur est celle de la division qui
 * fait cette niche (partition-history.ts) : chaque niche réglée y reste fixée, et ce qui suit sa niche — étagères,
 * tiroirs, penderie — suit. L'aperçu et les cotes de la vue suivent le champ ; OK est une annulation, et l'outil reste
 * pour d'autres niches jusqu'à Échap.
 */
import type { OffsetRecord, ShelfParams, SketchGeometry } from "../../document/sketch";
import type { DisplayUnit } from "../../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../../measurements/units";
import type { Vec2 } from "../../sketcher/edit";
import type { SketchExtrusion } from "../../sketcher/mode";
import { extrusionGroups, heightStep, isShelves, leafNiches, pathKey, rebuildChain, withNicheHeight } from "../../sketcher/partition-history";
import { heldHeights, partBox, shelfLayout, type NicheBox } from "../../sketcher/shelves";
import { el } from "../../ui/dom";
import { panelHeader } from "../../ui/panel-close";
import { placePanel } from "../../ui/dock";

export interface NicheHeightHost {
  geometry(): SketchGeometry;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Stores the new geometry as one undo step, with its bodies made again; false when it was refused. */
  apply(geometry: SketchGeometry, success: string, extrusion?: SketchExtrusion): boolean;
  changed(): void;
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

type Chosen = { partition: string; box: NicheBox; record: OffsetRecord; input: ShelfParams; division: number[]; index: number };

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const ROW = "grid grid-cols-[6rem_1fr] items-center gap-1.5";
const SMALL = "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export class NicheHeightTool {
  private niche: Chosen | null = null;
  /** The height asked for the niche chosen; null: it shares what is left. */
  private height: number | null = null;
  private done = false;
  private readonly panel: HTMLElement;
  /** Stored a moment after the height is changed (no « OK »), and what was stored last. */
  private storeTimer: number | undefined;
  private storedKey = "";

  constructor(private readonly host: NicheHeightHost) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Niche",
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  start(): void {
    this.recompute();
  }

  /** The document changed under the tool (undo, redo): the niche chosen may be gone. */
  sync(): void {
    // The niche chosen, read again from the sketch as it is now.
    this.niche = this.niche ? this.again(this.niche) : null;
    if (this.niche) this.height = this.niche.box.y1 - this.niche.box.y0;
    this.storedKey = this.key();
    this.recompute();
  }

  /** A niche chosen, as the sketch has it now (null: gone). */
  private again(n: Chosen): Chosen | null {
    const g = this.host.geometry();
    const path = [...n.division, n.index];
    const leaf = leafNiches(g).find((l) => l.partition === n.partition && pathKey(l.path) === pathKey(path));
    const step = leaf && heightStep(g, leaf.partition, leaf.path);
    if (!leaf || !step || !isShelves(step.record)) return null;
    return { partition: leaf.partition, box: leaf.box, record: step.record, input: step.record.step.input, division: step.record.step.niche, index: step.index };
  }

  private key(): string {
    return JSON.stringify(this.niche ? [this.niche.partition, this.niche.division, this.niche.index, this.height] : null);
  }

  /** The height changed (and possible) is stored a moment later. */
  private schedule(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    if (this.done || !this.niche || this.key() === this.storedKey) return;
    const made = this.rebuilt();
    if (!made?.rebuilt || made.problem) return;
    this.storeTimer = window.setTimeout(() => ((this.storeTimer = undefined), this.store()), 300);
  }

  /** A click in a niche (its centre, sketch coordinates): chooses it, or releases it. */
  click(p: Vec2): void {
    const g = this.host.geometry();
    const leaf = leafNiches(g).find((n) => p[0] > n.box.x0 && p[0] < n.box.x1 && p[1] > n.box.y0 && p[1] < n.box.y1);
    if (!leaf) return this.host.notify("Cliquez dans une niche de la répartition.", "info");
    const again = this.niche && (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs((this.niche as Chosen).box[k] - leaf.box[k]) < 1e-6);
    this.niche = null;
    if (!again) {
      const step = heightStep(g, leaf.partition, leaf.path);
      if (!step || !isShelves(step.record)) return (this.recompute(), this.host.notify("Cette niche va du dessous au dessus : posez d'abord une étagère pour la découper.", "info"));
      this.niche = { partition: leaf.partition, box: leaf.box, record: step.record, input: step.record.step.input, division: step.record.step.niche, index: step.index };
      this.height = leaf.box.y1 - leaf.box.y0;
    }
    // As it is: nothing to store until its height changes.
    this.storedKey = this.key();
    this.recompute();
  }

  chosen(): NicheBox[] {
    return this.niche ? [this.niche.box] : [];
  }

  /** The input of the division with the height asked. */
  private input(): ShelfParams | null {
    return this.niche && withNicheHeight(this.niche.input, this.niche.index, this.height);
  }

  /** The Répartition made again with the height asked, or why it cannot be. */
  private rebuilt() {
    const input = this.input();
    if (!this.niche || !input) return null;
    const g = this.host.geometry();
    const { record, partition } = this.niche;
    const offsets = (g.offsets ?? []).map((r) => (r.id === record.id && isShelves(r) ? { ...r, step: { ...r.step, input } } : r));
    const rebuilt = rebuildChain({ ...g, offsets }, partition);
    if (typeof rebuilt === "string") return { problem: rebuilt, rebuilt: null, offsets };
    return { problem: rebuilt.problems[0] ?? null, rebuilt, offsets };
  }

  /** The box of the division changed, in the sketch as it is. */
  private divisionBox(): NicheBox | null {
    if (!this.niche) return null;
    const rebuilt = rebuildChain(this.host.geometry(), this.niche.partition);
    return typeof rebuilt === "string" ? null : (rebuilt.niches.get(pathKey(this.niche.division))?.box ?? null);
  }

  /** The shelves OK would make: the preview in volume. */
  pieces(): NicheBox[] {
    const box = this.divisionBox();
    const input = this.input();
    const layout = box && input ? shelfLayout(box, input) : null;
    return box && layout && typeof layout === "object" ? layout.shelves.map((span) => partBox(box, span, layout)) : [];
  }

  /** The division with what OK would make of it: the dimensions in the view follow the field. */
  divided(): { box: NicheBox; into: NicheBox[] }[] {
    const box = this.divisionBox();
    const made = this.rebuilt();
    if (!box || !made?.rebuilt || made.problem) return [];
    const inside = (n: NicheBox) => n.x0 > box.x0 - 1e-6 && n.y0 > box.y0 - 1e-6 && n.x1 < box.x1 + 1e-6 && n.y1 < box.y1 + 1e-6;
    return [{ box, into: leafNiches({ ...this.host.geometry(), offsets: made.offsets }).filter((n) => inside(n.box)).map((n) => n.box) }];
  }

  // ---- panel ------------------------------------------------------------------------

  private recompute(): void {
    this.draw();
    this.host.changed();
    this.schedule();
  }

  private draw(): void {
    if (this.done) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) return;
    const unit = this.host.unit();
    const niche = this.niche;
    const made = this.rebuilt();
    const box = this.divisionBox();
    const input = this.input();
    const layout = box && input ? shelfLayout(box, input) : null;
    const problem = typeof layout === "string" ? layout : (made?.problem ?? null);
    const free = this.height === null ? (typeof layout === "object" && layout && niche ? (layout.niches[niche.index] as [number, number]) : null) : null;
    const field = el("input", {
      type: "text",
      inputmode: "decimal",
      class: `${FIELD} text-right font-mono`,
      value: trim(toDisplay(this.height ?? (free ? free[1] - free[0] : 0), unit), 4),
      "aria-label": `Hauteur (${UNIT_LABELS[unit]})`,
    });
    const apply = () => {
      const parsed = parseNumber(field.value);
      const ok = parsed !== null && parsed > 0;
      field.setAttribute("aria-invalid", String(!ok));
      if (ok) {
        this.height = fromDisplay(parsed, unit);
        this.recompute();
      }
    };
    field.addEventListener("change", apply);
    field.addEventListener("blur", () => this.draw());
    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        field.blur();
      }
    });
    const release = el("button", { type: "button", class: SMALL }, "Partager avec les autres niches");
    release.addEventListener("click", () => {
      this.height = null;
      this.recompute();
    });
    const heights = typeof layout === "object" && layout ? layout.niches.map(([a, b]) => formatLength(b - a, unit)).join(" · ") : null;
    const held = input ? heldHeights(input) : [];
    const rows: (HTMLElement | null)[] = [
      panelHeader("Niche", () => this.cancel()),
      el(
        "p",
        { class: "text-gray-600 dark:text-gray-300" },
        niche
          ? `Niche choisie : ${formatLength(niche.box.x1 - niche.box.x0, unit)} × ${formatLength(niche.box.y1 - niche.box.y0, unit)}.`
          : "Cliquez la niche dont vous voulez changer la hauteur.",
      ),
      niche ? el("label", { class: ROW }, `Hauteur (${UNIT_LABELS[unit]})`, field) : null,
      niche && this.height !== null && heldHeights(niche.input)[niche.index] !== null ? release : null,
      heights && !problem ? el("p", { class: "bg-sky-50 px-2 py-1.5 text-sky-900 dark:bg-sky-950 dark:text-sky-100" }, `${heights} (du bas vers le haut).`) : null,
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      niche ? el("p", { class: "text-[11px] text-gray-500" }, held.some((h, i) => h !== null && i !== niche.index) ? "Les niches déjà réglées gardent leur hauteur ; les autres se partagent le reste." : "Les autres niches se partagent le reste à parts égales.") : null,
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

  /** The niche takes its height, as one undo step; it stays chosen, the tool stays for others. */
  private store(): void {
    if (this.done) return;
    const made = this.rebuilt();
    if (!this.niche || !made) return this.host.notify("Cliquez d'abord une niche.", "error");
    if (!made.rebuilt || made.problem) return this.host.notify(made.problem ?? "Cette hauteur n'est pas possible.", "error");
    const g = this.host.geometry();
    const groups = extrusionGroups(g.offsets ?? [], made.rebuilt);
    const height = this.height;
    const name = this.niche.record.name;
    const chosen = this.niche;
    if (!this.host.apply(made.rebuilt.geometry, `${name} : ${height === null ? "niche partagée avec les autres" : `niche de ${formatLength(height, this.host.unit())}`}.`, groups.length ? { groups } : undefined)) return;
    this.niche = this.again(chosen);
    this.storedKey = this.key();
    this.recompute();
  }

  /** The cross, or Échap: closes; a height still waiting is stored first. */
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
