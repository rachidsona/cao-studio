/**
 * Base of the interactive feature tools (revolution, fillet, chamfer,
 * combination, hole on face): a compact panel docked on the right of the
 * view, and a live preview computed by the real kernel. The provisional
 * feature is inserted in a copy of the document that is regenerated (cached
 * features are reused, so only the new operation is computed); the document
 * itself only changes when the user confirms.
 */
import type { CadDocument, DisplayUnit, Feature } from "../document/types";
import { updateFeature } from "../document/operations";
import type { GeometryClient } from "../geometry/client";
import type { FeatureStatus } from "../history/recompute";
import { toDisplay, trim, UNIT_LABELS, fromDisplay, parseNumber } from "../measurements/units";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";

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
  /** Applies the final document as one undo step. */
  commit(doc: CadDocument, selectId: string): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  closed(): void;
}

export const COMPACT_INPUT =
  "h-8 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";

export abstract class PanelTool implements PointerHandler {
  protected panel: HTMLElement;
  private previewTimer: number | undefined;
  private previewBusy = false;
  private previewPending = false;
  private closedFlag = false;

  constructor(
    protected readonly ctx: ToolContext,
    private readonly title: string,
    /** Feature being edited, or null for a new one. */
    protected readonly editing: Feature | null,
  ) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-60 space-y-2 rounded-lg border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": title,
    });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    ctx.container.append(this.panel);
  }

  /** The provisional feature, or a message explaining what is still missing. */
  protected abstract feature(): Feature | string;
  /** Panel rows specific to the tool. */
  protected abstract rows(): (HTMLElement | null)[];

  start(): void {
    this.ctx.viewport.setPointerHandler(this);
    this.render();
    this.schedulePreview();
  }

  protected render(): void {
    if (this.closedFlag) return;
    const built = this.feature();
    const hint = typeof built === "string" ? built : null;
    const cancel = el(
      "button",
      { type: "button", class: "h-8 flex-1 rounded-md border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" },
      "Annuler",
    );
    cancel.addEventListener("click", () => this.cancel());
    const ok = el(
      "button",
      { type: "button", class: "h-8 flex-1 rounded-md bg-sky-600 font-medium text-white hover:bg-sky-700 disabled:opacity-40", disabled: hint !== null },
      "OK",
    );
    ok.addEventListener("click", () => this.confirm());
    const status = typeof built === "string" ? undefined : this.ctx.status(built.id);
    const problem = status && status.state !== "ok" ? status.message : undefined;
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, this.editing ? `Modifier : ${this.editing.name}` : this.title),
      ...this.rows(),
      hint ? el("p", { class: "rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, hint) : null,
      problem ? el("p", { class: "rounded-md bg-red-50 px-2 py-1.5 text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, problem) : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  /** Document with the provisional feature inserted (or replacing the edited one). */
  private provisional(feature: Feature): CadDocument {
    const doc = this.ctx.doc();
    if (this.editing) return updateFeature(doc, this.editing.id, () => feature);
    return { ...doc, features: [...doc.features, feature] };
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
          } else this.render();
        });
    }, 30);
  }

  confirm(): void {
    const built = this.feature();
    if (typeof built === "string") {
      this.ctx.notify(built, "error");
      return;
    }
    const doc = this.provisional(built);
    this.close();
    this.ctx.commit(doc, built.id);
  }

  cancel(): void {
    this.close();
    void this.ctx.preview(null);
  }

  protected close(): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    window.clearTimeout(this.previewTimer);
    closeCalculator();
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
    if (event.key === "Enter") {
      this.confirm();
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
  protected numberRow(label: string, value: number, unit: DisplayUnit | "deg", onChange: (v: number) => void, signed = false): HTMLElement {
    const isAngle = unit === "deg";
    const shown = isAngle ? value : toDisplay(value, unit);
    const input = el("input", { type: "text", inputmode: "decimal", class: `${COMPACT_INPUT} text-right font-mono`, value: trim(shown, 4), "aria-label": label });
    const apply = () => {
      const parsed = parseNumber(input.value);
      const ok = parsed !== null && (signed || parsed > 0);
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) onChange(isAngle ? parsed : fromDisplay(parsed, unit));
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
      { type: "button", class: "size-8 shrink-0 rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Calculatrice", "aria-label": `Saisir ${label}` },
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
      `${label}${isAngle ? " (°)" : ` (${UNIT_LABELS[unit]})`}`,
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
