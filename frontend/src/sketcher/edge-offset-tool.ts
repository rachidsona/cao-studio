/**
 * « Décaler l'arête » of the sketch, as in Shapr3D: no dialog. A click on a sketch curve, a body edge or a body
 * face makes its parallel copy right away, at the last distance used; an arrow on the copy is dragged to set the
 * distance, each change being one undo step. A click on the arrow's label opens the calculator (to work a measure out:
 * « 250 − 180 », « (180 + 20) ÷ 2 »…); a digit typed starts the value in the label itself, which takes the same sums. Another click starts another copy (also of
 * the copy just made); the tool stays until Échap. The distance used last is kept for the next time.
 */
import type { OffsetRecord, SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import type { OffsetCurve, OffsetJoin, OffsetOutcome, OffsetPath } from "../geometry/offset";
import { evaluateExpression, ExpressionError } from "../measurements/expression";
import { formatLength, toDisplay, trim } from "../measurements/units";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { el } from "../ui/dom";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { Viewport } from "../viewport/viewport";
import { removeEntities, type Vec2 } from "./edit";
import type { Vec3 } from "./frame";
import { addOffsetCurves, allConstruction, connectedChain, handleFor, offsetPreview, pathsFromCurves } from "./offset";
import { intoFaceSign, projectedRings, ringsOf } from "./offset-edge";
import type { Preview } from "./tools";

export interface EdgeOffsetHost {
  geometry(): SketchGeometry;
  /** Shows this geometry and preview without storing them (while the arrow is dragged). */
  display(geometry: SketchGeometry, preview: Preview | null): void;
  container(): HTMLElement;
  viewport: Viewport;
  world(p: Vec2): Vec3;
  direction(v: Vec2): Vec3;
  unit(): DisplayUnit;
  compute(paths: OffsetPath[], distance: number, join: OffsetJoin): Promise<OffsetOutcome>;
  /** Stores the geometry as one undo step; false when it was refused. */
  apply(geometry: SketchGeometry, success?: string): boolean;
  newOffsetId(): string;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Échap: the tool ends (the copies made stay). */
  closed(): void;
}

const KEY = "cao.offset-edge.distance";

/** The distance used last (mm, positive: into the face), kept from one session to the next. */
function storedDistance(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value !== 0 ? value : 10;
  } catch {
    return 10;
  }
}

function storeDistance(value: number): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // Private window: the distance is kept for this page only.
  }
}

interface Copy {
  id: string;
  name: string;
  /** Curves copied, and the curves of the copy (none until it is made). */
  source: string[];
  created: string[];
  paths: OffsetPath[];
  /** Kernel sign sending each path into its face. */
  sides: (1 | -1)[];
  distance: number;
}

export class EdgeOffsetTool {
  private copy: Copy | null = null;
  private distance = storedDistance();
  private readonly arrow: ArrowHandle;
  /** While the arrow is dragged: the stored geometry, shown without the copy. */
  private drag: { committed: SketchGeometry; base: SketchGeometry; value: number } | null = null;
  private ticket = 0;
  private done = false;
  /** Storing a copy: the sketch's own refresh must not forget it. */
  private applying = false;
  /** The value being typed, in place of the arrow's label. */
  private field: HTMLInputElement | null = null;

  constructor(private readonly host: EdgeOffsetHost) {
    this.arrow = new ArrowHandle(host.viewport, (anchor) => this.openCalculator(anchor));
  }

  /** A sketch curve clicked: the curve alone (a circle, an arc, a line of a rectangle) is copied. */
  pickCurve(id: string): void {
    const g = this.host.geometry();
    let rings: Vec2[][] = [];
    try {
      rings = ringsOf(pathsFromCurves(g, connectedChain(g, id)));
    } catch {
      // A branching chain: the side is taken from the body edges, if any.
    }
    void this.start([id], rings);
  }

  /** Body edges projected into the sketch (an edge, or every edge of a face), with the face they bound. */
  pickProjected(ids: string[], rings: Vec2[][] = []): void {
    void this.start(ids, rings);
  }

  private async start(source: string[], rings: Vec2[][]): Promise<void> {
    const g = this.host.geometry();
    let paths: OffsetPath[];
    try {
      paths = pathsFromCurves(g, source);
    } catch (error) {
      return this.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
    const faces = rings.length ? rings : projectedRings(g);
    this.copy = { id: this.host.newOffsetId(), name: offsetEdgeName(g), source, created: [], paths, sides: paths.map((p) => intoFaceSign(p, faces)), distance: this.distance };
    await this.make(this.distance);
  }

  /** The copy at this distance, computed by the kernel (null when it vanishes: a too large inward distance). */
  private async curvesAt(copy: Copy, distance: number): Promise<OffsetCurve[] | null> {
    const outcomes = await Promise.all(copy.paths.map((path, i) => this.host.compute([path], copy.sides[i]! * distance, "sharp")));
    const curves = outcomes.flatMap((o) => o.curves);
    return curves.length ? curves : null;
  }

  /** Makes (or remakes) the current copy at this distance: one undo step. */
  private async make(distance: number): Promise<void> {
    const copy = this.copy;
    if (!copy) return;
    const ticket = ++this.ticket;
    let curves: OffsetCurve[] | null;
    try {
      curves = await this.curvesAt(copy, distance);
    } catch (error) {
      if (ticket === this.ticket) this.host.notify(error instanceof Error ? error.message : String(error), "error");
      return;
    }
    if (ticket !== this.ticket || this.done || copy !== this.copy) return;
    if (!curves) return this.host.notify("Aucun trait à cette distance : elle est trop grande pour la forme.", "info");
    const current = this.host.geometry();
    const base = copy.created.length ? removeEntities(current, copy.created) : current;
    const { geometry, created } = addOffsetCurves(base, curves, allConstruction(base, copy.source));
    const record: OffsetRecord = { id: copy.id, name: copy.name, curves: created, source: copy.source, distance, both: false, join: "sharp" };
    geometry.offsets = [...(base.offsets ?? []).filter((o) => o.id !== copy.id), record];
    this.applying = true;
    const stored = this.host.apply(geometry, `${copy.name} : ${formatLength(Math.abs(distance), this.host.unit())}.`);
    this.applying = false;
    if (!stored) return;
    copy.created = created;
    copy.distance = distance;
    this.setDistance(distance);
    this.placeArrow(distance);
  }

  private setDistance(value: number): void {
    this.distance = value;
    storeDistance(value);
  }

  /** The arrow on the copy, pointing away from the curves copied (into the face for a positive distance). */
  private placeArrow(distance: number): void {
    const copy = this.copy;
    const path = copy?.paths[0];
    const handle = path ? handleFor([path]) : null;
    if (!copy || !handle) return void (this.arrow.object.visible = false);
    const side = copy.sides[0]!;
    const n = this.host.direction([handle.normal[0] * side, handle.normal[1] * side]);
    this.arrow.place(this.host.world(handle.at), n, distance, formatLength(Math.abs(distance), this.host.unit()));
  }

  /** A click on the label: the calculator, with the current distance in it; its result moves the copy there. */
  private openCalculator(anchor: { x: number; y: number }): void {
    const copy = this.copy;
    if (!copy) return;
    this.closeField();
    openCalculator({
      container: this.host.container(),
      anchor,
      value: Math.abs(copy.distance),
      unit: this.host.unit(),
      title: "Distance du décalage",
      locked: true,
      allowNegative: true,
      onSubmit: (value) => {
        if (value === 0) return false;
        // As for a typed value: the sign of the result is relative to the side the copy is on (minus: the other side).
        void this.make((copy.distance < 0 ? -1 : 1) * value);
        return true;
      },
    });
  }

  /**
   * The value is typed in place of the arrow's label (a click on it, or a digit pressed): no dialog. Entrée moves
   * the copy there, on the side it is on (a minus sign: the other side); Échap or a click elsewhere leaves it.
   */
  private ask(first?: string): void {
    const copy = this.copy;
    if (!copy || !this.arrow.object.visible) return;
    this.closeField();
    const unit = this.host.unit();
    const label = this.arrow.label.getBoundingClientRect();
    const box = this.host.container().getBoundingClientRect();
    const field = el("input", {
      type: "text",
      inputmode: "decimal",
      class: "cad-dimension absolute z-40 w-32 text-center focus:outline-none aria-invalid:border-red-500",
      value: first ?? trim(toDisplay(Math.abs(copy.distance), unit), 4),
      "aria-label": "Distance du décalage",
      autocomplete: "off",
      // A calculation: « ( » stays what it is (digit-keys.ts).
      "data-expression": "",
    });
    field.style.left = `${label.left - box.left}px`;
    field.style.top = `${label.top - box.top}px`;
    field.addEventListener("pointerdown", (event) => event.stopPropagation());
    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      // The digits of the digit row without Maj (AZERTY) are typed by digit-keys.ts, for every number field.
      if (event.key === "Escape") this.closeField();
      if (event.key !== "Enter") return;
      // Sums are taken too (« 250-180 », « (180+20)/2 », « 1 m - 20 cm »), with the units of the calculator.
      let typed: number;
      try {
        typed = evaluateExpression(field.value, unit);
      } catch (error) {
        field.setAttribute("aria-invalid", "true");
        field.title = error instanceof ExpressionError ? error.message : "Valeur non comprise.";
        return;
      }
      if (typed === 0) return field.setAttribute("aria-invalid", "true");
      this.closeField();
      void this.make((copy.distance < 0 ? -1 : 1) * typed);
    });
    field.addEventListener("blur", () => this.closeField());
    this.host.container().append(field);
    this.field = field;
    this.arrow.label.style.visibility = "hidden";
    field.focus();
    // A digit typed starts the value: the next ones go after it.
    if (first === undefined) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
  }

  private closeField(): void {
    const field = this.field;
    this.field = null;
    field?.remove();
    this.arrow.label.style.visibility = "";
  }

  /** A digit or a minus sign typed while a copy is shown starts typing its distance. */
  typeValue(key: string): boolean {
    if (!this.copy || !this.arrow.object.visible || this.field) return false;
    this.ask(key);
    return true;
  }

  overArrow(event: PointerEvent): boolean {
    return this.arrow.hovered(event);
  }

  dragStart(event: PointerEvent): boolean {
    if (!this.copy || !this.arrow.dragStart(event)) return false;
    const committed = this.host.geometry();
    const base = this.copy.created.length ? removeEntities(committed, this.copy.created) : committed;
    this.drag = { committed, base, value: this.copy.distance };
    this.host.display(base, null);
    void this.showAt(this.copy.distance);
    return true;
  }

  /** While dragging: the copy follows the arrow (shown, not stored). */
  dragMove(event: PointerEvent): boolean {
    if (!this.drag) return false;
    const value = this.arrow.dragMove(event);
    if (value !== null && value !== this.drag.value) {
      this.drag.value = value;
      this.placeArrow(value);
      void this.showAt(value);
    }
    return true;
  }

  private async showAt(value: number): Promise<void> {
    const copy = this.copy;
    const drag = this.drag;
    if (!copy || !drag) return;
    const ticket = ++this.ticket;
    try {
      const curves = await this.curvesAt(copy, value);
      if (ticket === this.ticket && this.drag === drag) this.host.display(drag.base, curves ? offsetPreview(curves) : null);
    } catch {
      // A value the kernel refuses is skipped while dragging.
    }
  }

  /** The arrow is released: the copy is stored at the distance reached. */
  dragEnd(): boolean {
    const drag = this.drag;
    if (!this.arrow.dragEnd() || !drag) return false;
    this.drag = null;
    this.host.display(drag.committed, null);
    if (drag.value !== this.copy?.distance) void this.make(drag.value);
    return true;
  }

  /** After an undo or redo: a copy taken back is forgotten (its arrow goes). */
  sync(): void {
    const copy = this.copy;
    if (!copy || this.applying) return;
    const known = new Set(this.host.geometry().curves.map((c) => c.id));
    if (copy.created.length && copy.created.every((id) => known.has(id)) && copy.source.every((id) => known.has(id))) return;
    this.copy = null;
    this.arrow.object.visible = false;
  }

  /** Échap: the tool ends; the copies made stay. */
  cancel(): void {
    if (this.done) return;
    this.dispose();
    this.host.closed();
  }

  dispose(): void {
    this.done = true;
    this.ticket++;
    if (this.drag) this.host.display(this.drag.committed, null);
    this.drag = null;
    this.closeField();
    closeCalculator();
    this.arrow.dispose();
  }
}

/** The digit of a key of the digit row or the keypad, whatever the keyboard layout (null for another key). */
export function typedDigit(event: Pick<KeyboardEvent, "code" | "key">): string | null {
  if (/^[0-9]$/.test(event.key)) return event.key;
  // A sign of a sum, a point or a comma stays what it is (on an AZERTY keyboard « ( » and « - » are on the 5 and 6 keys).
  if (/^[-+*/.,()]$/.test(event.key)) return null;
  const code = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  return code ? code[1]! : null;
}

/** « Arête décalée n », after the offsets of the sketch. */
function offsetEdgeName(g: SketchGeometry): string {
  const used = new Set((g.offsets ?? []).map((o) => o.name));
  let n = 1;
  while (used.has(`Arête décalée ${n}`)) n++;
  return `Arête décalée ${n}`;
}
