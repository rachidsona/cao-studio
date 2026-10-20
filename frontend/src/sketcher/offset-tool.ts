/**
 * "Décalage" tool of the sketch: the user picks curves (a click takes the
 * whole connected chain, or just the curve), sets a signed distance, sees the
 * result computed live by the kernel, then confirms. The original curves are
 * kept; confirming adds the offset curves to the sketch as one undo step.
 *
 * State and sequencing only: kernel calls arrive through the host, geometry
 * conversions are in offset.ts and the panel is drawn by ui/offset-panel.ts.
 */
import type { SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import type { OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import { renderOffsetPanel, type OffsetPanelState } from "../ui/offset-panel";
import { el } from "../ui/dom";
import { allConstruction, addOffsetCurves, connectedChain, OffsetSelectionError, offsetPreview, pathsFromCurves } from "./offset";
import type { Preview } from "./tools";

export interface OffsetHost {
  geometry(): SketchGeometry;
  /** Curves highlighted in the sketch; shared with the sketch mode. */
  selection: Set<string>;
  container(): HTMLElement;
  unit(): DisplayUnit;
  compute(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
  /** Stores the new geometry as one undo step; false when it was refused. */
  apply(geometry: SketchGeometry, success: string): boolean;
  /** Called whenever the preview or the selection changed (redraw). */
  changed(): void;
  /** The tool ended (confirmed or cancelled); `created` are the new curves to select. */
  closed(created: string[]): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

/** Last distance used, kept for the next offset of the session (mm). */
let lastDistance = 5;

export class OffsetTool {
  preview: Preview | null = null;
  private distance = lastDistance;
  private flip = false;
  private join: OffsetJoin = "round";
  private chain = true;
  /** "one": a single copy on the chosen side; "both": a copy on each side, at the same distance. */
  private direction: "one" | "both" = "one";
  private collapsed = false;
  private showHelp = false;
  private outcome: OffsetOutcome | null = null;
  private problem: string | null = null;
  private busy = false;
  private paths: OffsetPath[] = [];
  private ticket = 0;
  private latest: Promise<void> = Promise.resolve();
  private done = false;
  private redrawPending = false;
  private readonly panel: HTMLElement;

  constructor(private readonly host: OffsetHost) {
    this.panel = el("div", {
      class: "absolute top-2 right-2 z-30 w-72 max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto",
      role: "dialog",
      "aria-label": "Décalage",
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.container().append(this.panel);
  }

  /** Starts with the curves already selected in the sketch (if any). */
  start(): void {
    this.refresh();
  }

  /** A click on a curve: adds or removes it (with its whole chain when "chaîne" is on). */
  toggle(curveId: string): void {
    const g = this.host.geometry();
    const ids = this.chain ? connectedChain(g, curveId) : [curveId];
    const remove = this.host.selection.has(curveId);
    for (const id of ids) {
      if (remove) this.host.selection.delete(id);
      else this.host.selection.add(id);
    }
    this.refresh();
  }

  /** Re-reads the sketch (after an undo/redo) and recomputes. */
  sync(): void {
    const known = new Set(this.host.geometry().curves.map((c) => c.id));
    for (const id of [...this.host.selection]) if (!known.has(id)) this.host.selection.delete(id);
    this.refresh();
  }

  private curveIds(): string[] {
    const known = new Set(this.host.geometry().curves.map((c) => c.id));
    return [...this.host.selection].filter((id) => known.has(id));
  }

  /** Signed distance sent to the kernel. */
  private signed(): number {
    return this.flip ? -this.distance : this.distance;
  }

  private panelState(): OffsetPanelState {
    const kinds = new Set(this.paths.map((p) => (p.kind === "chain" && !p.closed ? "open" : "closed")));
    return {
      distance: this.distance,
      unit: this.host.unit(),
      flip: this.flip,
      join: this.join,
      chain: this.chain,
      direction: this.direction,
      collapsed: this.collapsed,
      showHelp: this.showHelp,
      selected: this.curveIds().length,
      paths: this.paths.length,
      sides: kinds.size === 0 ? "none" : kinds.size > 1 ? "mixed" : kinds.has("open") ? "open" : "closed",
      busy: this.busy,
      problem: this.problem,
      warnings: this.outcome?.warnings ?? [],
      result: this.outcome ? this.outcome.curves.length : null,
    };
  }

  private draw(): void {
    if (this.done) return;
    // A result arriving while a field is being edited must not replace it: redraw once it loses focus.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "text" && this.panel.contains(active)) {
      if (!this.redrawPending) {
        this.redrawPending = true;
        this.panel.addEventListener(
          "focusout",
          () => {
            this.redrawPending = false;
            this.draw();
          },
          { once: true },
        );
      }
      return;
    }
    renderOffsetPanel(this.panel, this.panelState(), {
      container: this.host.container(),
      setDistance: (value) => {
        this.distance = value;
        lastDistance = Math.abs(value) > 0 ? value : lastDistance;
        this.refresh();
      },
      setFlip: (flip) => {
        this.flip = flip;
        this.refresh();
      },
      setJoin: (join) => {
        this.join = join;
        this.refresh();
      },
      setChain: (chain) => {
        this.chain = chain;
        this.draw();
      },
      setDirection: (direction) => {
        this.direction = direction;
        this.refresh();
      },
      clearSelection: () => {
        this.host.selection.clear();
        this.refresh();
      },
      toggleCollapsed: () => {
        this.collapsed = !this.collapsed;
        this.draw();
      },
      toggleHelp: () => {
        this.showHelp = !this.showHelp;
        this.draw();
      },
      confirm: () => void this.confirm(),
      cancel: () => this.cancel(),
    });
  }

  /** Recomputes the offset for the current selection and parameters (latest request wins). */
  private refresh(): void {
    this.latest = this.run();
    this.draw();
    this.host.changed();
  }

  private async run(): Promise<void> {
    const ticket = ++this.ticket;
    this.problem = null;
    this.paths = [];
    const ids = this.curveIds();
    if (ids.length === 0) return this.settle(ticket, null, null);
    try {
      this.paths = pathsFromCurves(this.host.geometry(), ids);
    } catch (error) {
      return this.settle(ticket, null, error instanceof OffsetSelectionError ? error.message : String(error));
    }
    this.busy = true;
    this.draw();
    try {
      const outcome = await this.compute();
      this.settle(ticket, outcome, null);
    } catch (error) {
      this.settle(ticket, null, error instanceof Error ? error.message : String(error));
    }
  }

  /** One copy on the chosen side, or one on each side (a side that disappears is reported, not fatal). */
  private async compute(): Promise<OffsetOutcome> {
    if (this.direction === "one") return this.host.compute(this.paths, this.signed(), this.join);
    const d = Math.abs(this.distance);
    const results = await Promise.allSettled([this.host.compute(this.paths, d, this.join), this.host.compute(this.paths, -d, this.join)]);
    const done = results.filter((r): r is PromiseFulfilledResult<OffsetOutcome> => r.status === "fulfilled");
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (done.length === 0) throw failed?.reason;
    const warnings = done.flatMap((r) => r.value.warnings);
    if (failed) warnings.push(`Un des deux côtés est ignoré : ${failed.reason instanceof Error ? failed.reason.message : String(failed.reason)}`);
    return { curves: done.flatMap((r) => r.value.curves), warnings };
  }

  private settle(ticket: number, outcome: OffsetOutcome | null, problem: string | null): void {
    if (ticket !== this.ticket || this.done) return; // a newer request replaced this one
    this.busy = false;
    this.outcome = outcome;
    this.problem = problem;
    this.preview = outcome ? offsetPreview(outcome.curves) : null;
    this.draw();
    this.host.changed();
  }

  async confirm(): Promise<void> {
    if (this.done) return;
    await this.latest; // the result shown is the one that gets applied
    if (this.done) return;
    if (!this.outcome || this.curveIds().length === 0) {
      this.host.notify(this.problem ?? "Sélectionnez les lignes, arcs ou cercles à décaler.", "error");
      return;
    }
    const base = this.host.geometry();
    const { geometry, created } = addOffsetCurves(base, this.outcome.curves, allConstruction(base, this.curveIds()));
    if (created.length === 0) {
      this.host.notify("Le décalage n'a produit aucune courbe.", "error");
      return;
    }
    if (!this.host.apply(geometry, `Décalage : ${created.length} courbe(s) ajoutée(s), l'original est conservé.`)) return;
    this.finish(created);
  }

  cancel(): void {
    this.finish([]);
  }

  private finish(created: string[]): void {
    if (this.done) return;
    this.done = true;
    this.ticket++;
    this.preview = null;
    this.panel.remove();
    this.host.closed(created);
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    this.done = true;
    this.ticket++;
    this.preview = null;
    this.panel.remove();
  }
}
