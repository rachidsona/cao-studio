/**
 * "Réseau rectangulaire" tool of the sketch (as Fusion's rectangular pattern): the user picks points, lines,
 * circles or arcs (whole contours too), then sets two directions — the first at an angle (0° = along X), the
 * second perpendicular to it — each with a quantity (the original included) and a step or a distance. The copies
 * are shown dashed before OK; confirming is one undo step. The maths are in sketch-array.ts.
 */
import { panelDefaults } from "../document/panel-defaults";
import { RESERVED_IDS } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import type { Vec2 } from "./edit";
import { hitTest, toggleTarget } from "./hit";
import { pointPos } from "./edit";
import { withContours } from "./move";
import { arrayElements, copiedElements, type ArrayOutcome, type SketchGrid } from "./sketch-array";
import type { Annotation } from "./annotations";
import { divideRectangle, gapAnnotations, rectangleAround, rectangleOfCurve, spreadAxis, type BoardSpec, type SketchRectangle } from "./sketch-divide";
import type { Preview } from "./tools";
import type { SketchGeometry } from "../document/sketch";
import { placePanel } from "../ui/dock";

export interface ArrayHost {
  geometry(): SketchGeometry;
  /** Elements highlighted in the sketch; shared with the sketch mode (read the current set each time). */
  selection: Set<string>;
  container(): HTMLElement;
  unit(): DisplayUnit;
  /** Pick distance in sketch units (mm). */
  tolerance(): number;
  /** Stores the new geometry as one undo step; false when it was refused. */
  apply(geometry: SketchGeometry, success: string): boolean;
  /** The preview or the selection changed (redraw). */
  changed(): void;
  /** The tool ended (confirmed or cancelled). */
  closed(): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
}

interface Direction {
  count: number;
  step: number;
  distance: number;
}

const FIELD =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";
const QUANTITIES = Array.from({ length: 31 }, (_, i) => i + 1);

export class SketchArrayTool {
  preview: Preview | null = null;
  /** The measures between the sides and the lines spread in a rectangle, drawn with the preview. */
  annotations: Annotation[] = [];
  private d1: Direction = { count: 2, step: 0, distance: 0 };
  private d2: Direction = { count: 1, step: 0, distance: 0 };
  private place: "step" | "spread" = "step";
  private angle = 0;
  /** "grid": a grid of copies; "inside": lines spread at equal distances inside a rectangle. */
  private type: "grid" | "inside" = "grid";
  private lines = 3;
  private spread: "auto" | "x" | "y" = "auto";
  private attach = true;
  /** What is made equal: the openings between boards (thickness and side as in "Panneaux"), or the spacing of the lines. */
  private equalize: "openings" | "lines" = "openings";
  /** A side of the rectangle the user chose, or null to take the one around the selection. */
  private rectSide: string | null = null;
  private picking = false;
  private outcome: ArrayOutcome | null = null;
  private done = false;
  private readonly panel: HTMLElement;

  constructor(private readonly host: ArrayHost) {
    this.panel = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur " +
        "max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Réseau",
    });
    // The panel must not start a sketch gesture when it is clicked.
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(host.container(), this.panel);
  }

  /** Starts with the elements already selected in the sketch (if any). */
  start(): void {
    for (const id of RESERVED_IDS) this.host.selection.delete(id);
    this.fitSteps();
    this.recompute();
  }

  /** Re-reads the sketch (after an undo/redo). */
  sync(): void {
    const g = this.host.geometry();
    const known = new Set([...g.points.map((p) => p.id), ...g.curves.map((c) => c.id)]);
    for (const id of [...this.host.selection]) if (!known.has(id)) this.host.selection.delete(id);
    this.recompute();
  }

  /** The size of what is copied along each direction: the copies start side by side. */
  private fitSteps(): void {
    const g = this.host.geometry();
    const { points } = copiedElements(g, this.host.selection);
    const pos = points.map((id) => pointPos(g, id));
    const span = (axis: 0 | 1) => (pos.length ? Math.max(...pos.map((p) => p[axis])) - Math.min(...pos.map((p) => p[axis])) : 0);
    const [w, h] = [span(0), span(1)];
    // Along a direction at `angle`, the extent is that of the box projected on it.
    const a = (this.angle * Math.PI) / 180;
    const along1 = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
    const along2 = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    this.d1.step = Number((along1 || 10).toFixed(4));
    this.d2.step = Number((along2 || 10).toFixed(4));
    this.d1.distance = this.d1.step * Math.max(this.d1.count - 1, 1);
    this.d2.distance = this.d2.step * Math.max(this.d2.count - 1, 1);
  }

  private grid(): SketchGrid {
    const a = (this.angle * Math.PI) / 180;
    const [u, v]: [Vec2, Vec2] = [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]];
    const length = (d: Direction) => (this.place === "step" ? d.step : d.distance / Math.max(d.count - 1, 1));
    return {
      step1: [u[0] * length(this.d1), u[1] * length(this.d1)],
      count1: this.d1.count - 1,
      step2: [v[0] * length(this.d2), v[1] * length(this.d2)],
      count2: this.d2.count - 1,
    };
  }

  /** The rectangle the lines are spread in: the chosen one, else the smallest around the selection. */
  private rectangle(): SketchRectangle | null {
    const g = this.host.geometry();
    return (this.rectSide ? rectangleOfCurve(g, this.rectSide) : null) ?? rectangleAround(g, this.host.selection);
  }

  /** The boards the openings are made equal for, or null to space the lines themselves. */
  private board(): BoardSpec | null {
    return this.equalize === "openings" && panelDefaults.thickness > 0 ? { thickness: panelDefaults.thickness, align: panelDefaults.align } : null;
  }

  private computeInside(): ArrayOutcome {
    const g = this.host.geometry();
    const rect = this.rectangle();
    if (!rect) return { ok: false, reason: "Aucun rectangle autour de la sélection : dessinez-le, ou touchez « Choisir le rectangle »." };
    const axis = this.spread === "auto" ? spreadAxis(g, this.host.selection) : this.spread === "x" ? 0 : 1;
    const board = this.board();
    const out = divideRectangle(g, this.host.selection, rect, { count: this.lines, axis, attach: this.attach, board });
    this.annotations = out.ok ? gapAnnotations(rect, axis, this.lines, this.host.unit(), board) : [];
    return out;
  }

  private recompute(): void {
    const selected = this.host.selection.size > 0;
    this.annotations = [];
    this.outcome = !selected ? null : this.type === "inside" ? this.computeInside() : arrayElements(this.host.geometry(), this.host.selection, this.grid());
    this.preview = this.outcome?.ok ? this.outcome.preview : null;
    this.draw();
    this.host.changed();
  }

  get ready(): boolean {
    return !!this.outcome && this.outcome.ok;
  }

  // ---- panel ------------------------------------------------------------------------

  private draw(): void {
    if (this.done) return;
    // A recompute while a field is being edited must not replace it: redraw once it loses focus.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && this.panel.contains(active)) {
      active.addEventListener("focusout", () => this.draw(), { once: true });
      return;
    }
    const unit = this.host.unit();
    const quantity = (label: string, d: Direction) => {
      const select = el("select", { class: FIELD, "aria-label": label }, ...QUANTITIES.map((n) => el("option", { value: String(n), selected: n === d.count }, String(n))));
      select.addEventListener("change", () => {
        d.count = Number(select.value);
        this.recompute();
      });
      return el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, label, select);
    };
    const number = (label: string, value: number, suffix: string, show: (v: number) => number, set: (v: number) => void) => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(show(value), 4), "aria-label": label });
      const apply = () => {
        const parsed = parseNumber(input.value);
        input.setAttribute("aria-invalid", String(parsed === null));
        if (parsed !== null) set(parsed);
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          apply();
          input.blur();
        }
      });
      return el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, `${label} (${suffix})`, input);
    };
    const length = (label: string, d: Direction) =>
      this.place === "step"
        ? number(label, d.step, UNIT_LABELS[unit], (v) => toDisplay(v, unit), (v) => ((d.step = fromDisplay(v, unit)), this.recompute()))
        : number(label, d.distance, UNIT_LABELS[unit], (v) => toDisplay(v, unit), (v) => ((d.distance = fromDisplay(v, unit)), this.recompute()));
    const place = el(
      "select",
      { class: FIELD, "aria-label": "Placement" },
      el("option", { value: "step", selected: this.place === "step" }, "Un pas entre copies"),
      el("option", { value: "spread", selected: this.place === "spread" }, "Réparties sur une distance"),
    );
    place.addEventListener("change", () => {
      this.place = place.value as "step" | "spread";
      this.recompute();
    });
    const cancel = el("button", { type: "button", class: "h-8 flex-1 border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    cancel.addEventListener("click", () => this.cancel());
    const ok = el("button", { type: "button", class: "h-8 flex-1 btn-accent font-medium disabled:opacity-40", disabled: !this.ready }, "OK");
    ok.addEventListener("click", () => this.confirm());
    const contours = el("button", { type: "button", class: "h-8 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Ajouter les contours entiers");
    contours.addEventListener("click", () => {
      for (const id of withContours(this.host.geometry(), this.host.selection)) this.host.selection.add(id);
      this.fitSteps();
      this.recompute();
    });
    const inside = this.type === "inside";
    const message = !this.host.selection.size ? (inside ? "Cliquez la ligne à répartir (par exemple un côté du rectangle)." : "Cliquez les points, lignes, cercles ou arcs à copier.") : this.outcome && !this.outcome.ok ? this.outcome.reason : null;
    const kind = el(
      "select",
      { class: FIELD, "aria-label": "Type de réseau" },
      el("option", { value: "grid", selected: !inside }, "Rectangulaire (grille)"),
      el("option", { value: "inside", selected: inside }, "Linéaire dans un rectangle"),
    );
    kind.addEventListener("change", () => {
      this.type = kind.value as "grid" | "inside";
      this.picking = false;
      this.recompute();
    });
    const rows: (HTMLElement | null)[] = [
      el("h2", { class: "panel-title" }, "Réseau"),
      kind,
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `${this.host.selection.size} élément${this.host.selection.size > 1 ? "s" : ""} choisi${this.host.selection.size > 1 ? "s" : ""}.`),
      ...(inside ? this.insideRows(unit, number) : [
      this.host.selection.size ? contours : null,
      place,
      el("h3", { class: "panel-title pt-1" }, "Direction 1"),
      number("Angle", this.angle, "°", (v) => v, (v) => ((this.angle = v), this.fitSteps(), this.recompute())),
      quantity("Quantité", this.d1),
      length("Pas 1", this.d1),
      el("h3", { class: "panel-title pt-1" }, "Direction 2 (perpendiculaire)"),
      quantity("Quantité 2", this.d2),
      length("Pas 2", this.d2),
      ]),
      this.outcome?.ok ? el("p", { class: "text-gray-600 dark:text-gray-300" }, `${this.outcome.copies} copie${this.outcome.copies > 1 ? "s" : ""}.`) : null,
      message ? el("p", { class: " bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, message) : null,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  /** The rows of "Linéaire dans un rectangle": which rectangle, along which axis, how many lines, tied to the sides. */
  private insideRows(unit: DisplayUnit, number: (label: string, value: number, suffix: string, show: (v: number) => number, set: (v: number) => void) => HTMLElement): (HTMLElement | null)[] {
    const rect = this.rectangle();
    const size = rect ? `${formatLength(rect.max[0] - rect.min[0], unit)} × ${formatLength(rect.max[1] - rect.min[1], unit)}` : "aucun";
    const choose = el("button", { type: "button", class: `h-8 w-full border ${this.picking ? "border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100" : "border-gray-300"} hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800`, "aria-pressed": String(this.picking) }, this.picking ? "Cliquez un côté du rectangle…" : "Choisir le rectangle");
    choose.addEventListener("click", () => {
      this.picking = !this.picking;
      this.draw();
    });
    const axis = el(
      "select",
      { class: FIELD, "aria-label": "Répartir selon" },
      el("option", { value: "auto", selected: this.spread === "auto" }, "Automatique (selon la ligne)"),
      el("option", { value: "x", selected: this.spread === "x" }, "Selon X (lignes verticales)"),
      el("option", { value: "y", selected: this.spread === "y" }, "Selon Y (lignes horizontales)"),
    );
    axis.addEventListener("change", () => {
      this.spread = axis.value as "auto" | "x" | "y";
      this.recompute();
    });
    const count = el("select", { class: FIELD, "aria-label": "Nombre de lignes" }, ...QUANTITIES.slice(0, 30).map((n) => el("option", { value: String(n), selected: n === this.lines }, String(n))));
    count.addEventListener("change", () => {
      this.lines = Number(count.value);
      this.recompute();
    });
    const attach = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: this.attach });
    attach.addEventListener("change", () => {
      this.attach = attach.checked;
      this.recompute();
    });
    const equal = el(
      "select",
      { class: FIELD, "aria-label": "Parts égales" },
      el("option", { value: "openings", selected: this.equalize === "openings" }, "Les ouvertures entre panneaux"),
      el("option", { value: "lines", selected: this.equalize === "lines" }, "Les lignes (axes)"),
    );
    equal.addEventListener("change", () => {
      this.equalize = equal.value as "openings" | "lines";
      this.recompute();
    });
    const side = el(
      "select",
      { class: FIELD, "aria-label": "Panneaux du contour" },
      el("option", { value: "inside", selected: panelDefaults.align === "inside" }, "Dans le contour"),
      el("option", { value: "center", selected: panelDefaults.align === "center" }, "Centrés sur le contour"),
      el("option", { value: "outside", selected: panelDefaults.align === "outside" }, "Hors du contour"),
    );
    side.addEventListener("change", () => {
      panelDefaults.align = side.value as typeof panelDefaults.align;
      this.recompute();
    });
    const boards = this.equalize === "openings"
      ? [
          number("Épaisseur", panelDefaults.thickness, UNIT_LABELS[unit], (v) => toDisplay(v, unit), (v) => {
            if (fromDisplay(v, unit) > 0) panelDefaults.thickness = fromDisplay(v, unit);
            this.recompute();
          }),
          el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, "Panneaux", side),
        ]
      : [];
    return [
      el("p", { class: "text-gray-600 dark:text-gray-300" }, `Rectangle : ${size}.`),
      choose,
      el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, "Répartir", axis),
      el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, "Lignes", count),
      el("label", { class: "grid grid-cols-[6rem_1fr] items-center gap-1.5" }, "Égaliser", equal),
      ...boards,
      el("label", { class: "flex min-h-8 items-center gap-2" }, attach, "D'un côté à l'autre, liées aux côtés"),
      el("p", { class: "text-[11px] text-gray-500" }, this.equalize === "openings" ? "n lignes font n + 1 ouvertures égales entre les panneaux (ceux de l'outil Panneaux : même épaisseur et même côté)." : "n lignes font n + 1 espaces égaux entre les axes."),
    ];
  }

  // ---- pointer ----------------------------------------------------------------------

  /** A click: adds or removes the element under the pointer (a point, else a curve); or, choosing the rectangle, picks one of its sides. */
  click(p: Vec2): void {
    if (this.picking) {
      const side = hitTest(this.host.geometry(), p, this.host.tolerance()).find((h) => h.kind === "line" && rectangleOfCurve(this.host.geometry(), h.id));
      if (!side) return this.host.notify("Cliquez un côté d'un rectangle.", "info");
      this.rectSide = side.id;
      this.picking = false;
      return this.recompute();
    }
    const hits = hitTest(this.host.geometry(), p, this.host.tolerance()).filter((h) => !RESERVED_IDS.has(h.id));
    const target = toggleTarget(hits, this.host.selection);
    if (!target) return;
    if (this.host.selection.has(target.id)) this.host.selection.delete(target.id);
    else this.host.selection.add(target.id);
    this.fitSteps();
    this.recompute();
  }

  // ---- end --------------------------------------------------------------------------

  confirm(): void {
    if (this.done) return;
    if (!this.outcome || !this.outcome.ok) {
      this.host.notify(this.outcome && !this.outcome.ok ? this.outcome.reason : "Cliquez les éléments à copier.", "error");
      return;
    }
    const n = this.outcome.copies;
    if (!this.host.apply(this.outcome.geometry, `${n} copie${n > 1 ? "s" : ""} créée${n > 1 ? "s" : ""}.`)) return;
    this.finish();
  }

  cancel(): void {
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  /** Removes the panel without notifying the host (the sketch mode is switching tools itself). */
  dispose(): void {
    this.done = true;
    this.preview = null;
    this.annotations = [];
    this.panel.remove();
  }
}
