/**
 * Base of the interactive feature tools (revolution, fillet, chamfer,
 * combination, hole on face): a compact panel docked on the right of the
 * view, and a live preview computed by the real kernel. The provisional
 * feature is inserted in a copy of the document that is regenerated (cached
 * features are reused, so only the new operation is computed); the document
 * itself changes as soon as the result is valid: no « OK », no « Annuler ». Each valid setting is stored at once,
 * the tool staying open; while it is, the next settings replace what it stored (one undo step for the whole use of
 * the tool). The cross, or Échap, closes it and keeps what is done; Ctrl + Z takes it back; its step in the history
 * changes it later.
 */
import type { Axis, CadDocument, DisplayUnit, Feature } from "../document/types";
import { updateFeature } from "../document/operations";
import type { GeometryClient } from "../geometry/client";
import type { FeatureStatus } from "../history/recompute";
import { toDisplay, trim, UNIT_LABELS, fromDisplay, parseNumber } from "../measurements/units";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { placePanel } from "../ui/dock";
import { panelHeader } from "../ui/panel-close";

export interface ToolContext {
  viewport: Viewport;
  geometry: GeometryClient;
  /** Area the panel and keypads are placed in (the viewport area). */
  container: HTMLElement;
  doc(): CadDocument;
  unit(): DisplayUnit;
  /** Visible bodies, in history order. */
  bodies(): { id: string; name: string }[];
  status(id: string): FeatureStatus | undefined;
  /** Shows the regeneration of `doc` (null: back to the real document). */
  preview(doc: CadDocument | null): Promise<void>;
  /**
   * Applies the document as one undo step (`after` runs once it is applied); `amend`: in place of the last step
   * (the same use of the tool, set again).
   */
  commit(doc: CadDocument, selectId: string, after?: () => void, amend?: boolean): void;
  /** Opens the extrusion tool on the selected sketch or faces (a tool that draws a closed shape goes on with it). */
  extrude?(): void;
  /** Opens the rotation tool on a body or a sketch, around this axis (a curved arrow of the Move manipulator was taken). */
  turn?(axis: Axis, subject: { kind: "body" | "sketch"; id: string }, event: PointerEvent): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Selects what the tool made, once it closes (its fields shown in the properties, as after « OK »). */
  select?(id: string): void;
  closed(): void;
}

export const COMPACT_INPUT =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";

export abstract class PanelTool implements PointerHandler {
  protected panel: HTMLElement;
  private previewTimer: number | undefined;
  private previewBusy = false;
  private previewPending = false;
  private closedFlag = false;
  /** What this use of the tool stored: the document before it, and the one it made (to set it again in place). */
  private stored: { base: CadDocument; doc: CadDocument; id: string } | null = null;
  private storeTimer: number | undefined;
  /**
   * Whether a valid setting is stored a moment after it is made (the default). False: nothing is stored before OK (or
   * Entrée), and Annuler (Échap, the cross) leaves the document as it was — as Fusion's dialogs.
   */
  protected storesLive = true;
  /** The tool draws its own OK and Annuler (or Terminer): the panel adds none. */
  protected ownButtons = false;

  constructor(
    protected readonly ctx: ToolContext,
    private readonly title: string,
    /** Feature being edited, or null for a new one. */
    protected readonly editing: Feature | null,
  ) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-60 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": title,
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(ctx.container, this.panel);
  }

  /** The provisional feature, or a message explaining what is still missing. */
  protected abstract feature(): Feature | string;
  /** Panel rows specific to the tool. */
  protected abstract rows(): (HTMLElement | null)[];
  /** Title of the panel. */
  protected heading(): string {
    return this.editing ? `Modifier : ${this.editing.name}` : this.title;
  }
  /** A reason the result cannot be validated yet (the preview failed): OK stays disabled. */
  protected blocker(): string | null {
    return null;
  }

  start(): void {
    this.ctx.viewport.setPointerHandler(this);
    this.render();
    this.schedulePreview();
  }

  protected render(): void {
    if (this.closedFlag) return;
    const built = this.feature();
    const hint = typeof built === "string" ? built : null;
    const status = typeof built === "string" ? undefined : this.ctx.status(built.id);
    const problem = status && status.state !== "ok" ? status.message : undefined;
    const rows: (HTMLElement | null)[] = [
      panelHeader(this.heading(), () => this.cancel()),
      ...this.rows(),
      hint ? el("p", { class: " bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, hint) : null,
      problem ? el("p", { class: " bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, problem) : null,
      this.ownButtons ? null : this.footer(hint !== null || problem !== undefined || this.blocker() !== null),
    ];
    const typing = this.typing();
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
    typing?.();
  }

  /**
   * « Terminer » closes the tool (as Échap: what was set stays, or nothing is kept for a tool that waits for OK); « OK »
   * keeps the result and closes (as Entrée), not while it is not whole.
   */
  private footer(blocked: boolean): HTMLElement {
    const done = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-panel-done": "" }, "Terminer");
    done.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: blocked, "data-panel-ok": "" }, "OK");
    ok.addEventListener("click", () => this.finish());
    return el("div", { class: "flex gap-1.5 pt-1" }, done, ok);
  }

  /**
   * A field being typed in, its value not given yet (Entrée, or leaving it, gives it): the panel drawn again meanwhile
   * (a preview ending) keeps what is typed and the caret, instead of putting back the old value.
   */
  private typing(): (() => void) | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || !this.panel.contains(active) || active.value === active.defaultValue) return null;
    const label = active.getAttribute("aria-label");
    if (!label) return null;
    const { value, selectionStart, selectionEnd } = active;
    return () => {
      const next = [...this.panel.querySelectorAll("input")].find((input) => input.getAttribute("aria-label") === label);
      if (!next) return;
      next.value = value;
      next.focus();
      if (next.type === "text") next.setSelectionRange(selectionStart, selectionEnd);
    };
  }

  /** Further new features made with the main one (one per body for Aligner, Étirer), in the same undo step. */
  protected companions(): Feature[] {
    return [];
  }

  /**
   * Document with the provisional feature inserted (or replacing the edited one). A feature whose id is already in
   * the document replaces it (a sketch moved or stretched in place by a Curic tool).
   */
  private provisional(feature: Feature): CadDocument {
    const doc = this.docBefore();
    if (this.editing) return this.decorate(updateFeature(doc, this.editing.id, () => feature));
    const put = (d: CadDocument, f: Feature): CadDocument => (d.features.some((x) => x.id === f.id) ? updateFeature(d, f.id, () => f) : { ...d, features: [...d.features, f] });
    return this.decorate([feature, ...this.companions()].reduce(put, doc));
  }

  /**
   * The document this use of the tool works on: the one before it stored anything, while what it stored is still the
   * document (an undo, or anything else done since, starts again from the document as it is).
   */
  protected docBefore(): CadDocument {
    return this.stored && this.ctx.doc() === this.stored.doc ? this.stored.base : this.ctx.doc();
  }

  /** What else the new feature sets in the document (the materials of its bodies…). */
  protected decorate(doc: CadDocument): CadDocument {
    return doc;
  }

  /**
   * Regenerates the preview: at most one kernel run at a time, the latest
   * change being picked up as soon as the previous run ends (smooth while
   * dragging an arrow, no backlog).
   */
  protected schedulePreview(): void {
    if (this.previewBusy) {
      this.previewPending = true;
      return;
    }
    this.previewBusy = true;
    this.previewTimer = window.setTimeout(() => {
      if (this.closedFlag) return;
      const built = this.feature();
      void this.ctx
        .preview(typeof built === "string" ? null : this.provisional(built))
        .finally(() => {
          this.previewBusy = false;
          if (this.closedFlag) return;
          if (this.previewPending) {
            this.previewPending = false;
            this.schedulePreview();
          } else {
            this.render();
            this.storeSoon();
          }
        });
    }, 30);
  }

  /** The result settled (its preview done, valid): stored a moment later, unless something changes meanwhile. */
  private storeSoon(): void {
    window.clearTimeout(this.storeTimer);
    this.storeTimer = window.setTimeout(() => this.storeNow(), 250);
  }

  /** Stores the result when it is whole: valid, nothing in the way, its preview without error. */
  private storeNow(): void {
    this.storeTimer = undefined;
    if (this.closedFlag || this.previewBusy || !this.storesLive) return;
    const built = this.feature();
    if (typeof built === "string" || this.blocker() !== null) return;
    const status = this.ctx.status(built.id);
    if (status && status.state !== "ok") return;
    this.confirm();
  }

  /**
   * Stores the result now (Entrée, or a moment after each valid setting): one undo step, set again in place while the
   * tool stays open. The tool stays open.
   */
  confirm(): void {
    const built = this.feature();
    if (typeof built === "string") {
      this.ctx.notify(built, "error");
      return;
    }
    const doc = this.provisional(built);
    const now = this.ctx.doc();
    if (JSON.stringify(doc) === JSON.stringify(now)) return;
    const amend = !!this.stored && now === this.stored.doc;
    const base = amend ? this.stored!.base : now;
    this.ctx.commit(doc, built.id, undefined, amend);
    this.stored = { base, doc: this.ctx.doc(), id: built.id };
  }

  /**
   * The document this tool stored was set again in place by something that follows it (an element kept by « Prolonger
   * élément », app/extend-follow.ts): still the tool's own, so its next setting sets it again instead of adding to it.
   */
  adopt(prev: CadDocument, next: CadDocument): void {
    if (this.stored && this.stored.doc === prev) this.stored = { ...this.stored, doc: next };
  }

  /** The work is whole (Entrée, a last click): stored now, and the tool closes. Nothing whole yet: it stays. */
  protected finish(): void {
    const built = this.feature();
    if (typeof built === "string" || this.blocker() !== null) return;
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    this.confirm();
    this.close();
    void this.ctx.preview(null);
    this.selectStored();
  }

  /** What this use of the tool made, selected once it closes. */
  private selectStored(): void {
    const id = this.stored?.id;
    if (id && this.ctx.doc().features.some((f) => f.id === id)) this.ctx.select?.(id);
  }

  /** The cross, or Échap: closes the panel; a setting still waiting is stored first, nothing done is taken back. */
  cancel(): void {
    const waiting = !this.closedFlag && (this.previewBusy || this.previewPending || this.storeTimer !== undefined);
    window.clearTimeout(this.storeTimer);
    this.storeTimer = undefined;
    if (waiting && this.storesLive) {
      const built = this.feature();
      if (typeof built !== "string" && this.blocker() === null) this.confirm();
    }
    this.close();
    void this.ctx.preview(null);
    this.selectStored();
  }

  protected close(): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    window.clearTimeout(this.previewTimer);
    window.clearTimeout(this.storeTimer);
    closeCalculator();
    this.ctx.viewport.setChosen([]);
    this.dispose();
    this.ctx.viewport.setPointerHandler(null);
    this.panel.remove();
    this.ctx.closed();
  }

  /** Releases tool-specific scene objects. */
  protected dispose(): void {}

  handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      this.cancel();
      return true;
    }
    // Entrée: stored now, and the tool closes (as « OK » did).
    if (event.key === "Enter") {
      this.finish();
      return true;
    }
    return false;
  }

  // ---- pointer (tools override what they need) -------------------------------------

  down(_event: PointerEvent): boolean {
    return false;
  }

  move(_event: PointerEvent): void {}

  up(event: PointerEvent, isClick: boolean): boolean {
    if (isClick) this.click(event);
    return isClick;
  }

  protected click(_event: PointerEvent): void {}

  // ---- form helpers ---------------------------------------------------------------

  /** Numeric field in the display unit (or degrees) with a keypad button. */
  /** A number field: a length in the display unit, an angle ("deg"), or a plain number ("plain": a count, a %). */
  protected numberRow(label: string, value: number, given: DisplayUnit | "deg" | "plain", onChange: (v: number) => void, signed = false): HTMLElement {
    const plain = given === "plain";
    const unit = plain ? "deg" : given;
    const isAngle = unit === "deg";
    const shown = isAngle ? value : toDisplay(value, unit);
    const input = el("input", { type: "text", inputmode: "decimal", class: `${COMPACT_INPUT} text-right font-mono`, value: trim(shown, 4), "aria-label": label });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && (signed || parsed > 0);
      input.setAttribute("aria-invalid", String(!ok));
      if (!ok) return;
      // Given: no longer being typed (the panel drawn again does not keep it).
      input.defaultValue = input.value;
      onChange(isAngle ? parsed : fromDisplay(parsed, unit));
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        apply();
        input.blur();
      }
    });
    const keypad = el(
      "button",
      { type: "button", class: "size-8 shrink-0 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Calculatrice", "aria-label": `Saisir ${label}` },
      "⌨",
    );
    keypad.addEventListener("click", () => {
      const r = keypad.getBoundingClientRect();
      openCalculator({
        container: this.ctx.container,
        anchor: { x: r.left - 260, y: r.top + r.height / 2 },
        value,
        unit,
        title: label,
        locked: true,
        allowNegative: signed,
        onSubmit: (v) => {
          onChange(v);
          return true;
        },
      });
    });
    return el(
      "label",
      { class: "grid grid-cols-[5rem_1fr_auto] items-center gap-1.5" },
      `${label}${plain ? "" : isAngle ? " (°)" : ` (${UNIT_LABELS[unit]})`}`,
      input,
      keypad,
    );
  }

  protected selectRow(label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement {
    const select = el("select", { class: COMPACT_INPUT, "aria-label": label }, ...options.map(([v, t]) => el("option", { value: v, selected: v === value }, t)));
    select.addEventListener("change", () => onChange(select.value));
    return el("label", { class: "grid grid-cols-[5rem_1fr] items-center gap-1.5" }, label, select);
  }

  protected checkRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked });
    box.addEventListener("change", () => onChange(box.checked));
    return el("label", { class: "flex min-h-8 items-center gap-2" }, box, label);
  }

  protected info(text: string): HTMLElement {
    return el("p", { class: "text-gray-600 dark:text-gray-300" }, text);
  }
}
