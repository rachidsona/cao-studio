/**
 * La forme en train d'être tracée dans l'esquisse (ligne, rectangle, cercle…) : où tombe son prochain point — sur
 * l'accrochage du pointeur, ou là où les cotes tapées le mettent (typed-dims.ts) —, les touches qui tapent ces cotes,
 * et le point posé, par un clic ou par Entrée : la forme continue, ou elle est faite, avec une cote pour chaque
 * valeur tapée.
 */
import { openCalculator } from "../ui/calculator";
import type { Annotation } from "./annotations";
import { typedDigit } from "./edge-offset-tool";
import type { Vec2 } from "./edit";
import type { SketchMode } from "./mode";
import type { PointerSnap } from "./smart-snap";
import { TypedDims, typedFields, withTypedDimensions, type DimField } from "./typed-dims";

export class ShapeEntry {
  /** The dimensions typed while a shape is drawn (as Fusion's). */
  readonly typed = new TypedDims();
  /** Where the pointer was last, in the sketch. */
  private cursor: Vec2 | null = null;

  constructor(
    private readonly mode: SketchMode,
    /** Where a pointer position lands: on a point or a curve, in line with a point, or on the grid. */
    private readonly snapAt: (p: Vec2) => PointerSnap,
    /** A point laid but not drawn yet is aligned with too (null: the shape is drawn, none left). */
    private readonly aligned: (at: Vec2 | null) => void,
  ) {}

  /** Where a pointer position lands, the dimensions typed in force: they place the point, the pointer gives the rest. */
  landing(p: Vec2): PointerSnap {
    const { mode } = this;
    this.cursor = p;
    const s = this.snapAt(p);
    const anchor = mode.tool?.anchor(mode.geometry);
    if (!mode.tool || !anchor || this.typed.empty) return s;
    const pos = this.typed.constrain(mode.tool.name, mode.host.unit(), anchor, s.pos);
    return Math.hypot(pos[0] - s.pos[0], pos[1] - s.pos[1]) < 1e-9 ? s : { pos, guides: [] };
  }

  /** The live measurements of the shape being drawn, as the fields one types in. */
  fields(annotations: Annotation[]): Annotation[] {
    const { mode } = this;
    if (!mode.tool?.anchor(mode.geometry)) return annotations;
    const line = mode.preview?.lines.length === 1 ? (mode.preview.lines[0] as [Vec2, Vec2]) : null;
    return this.typed.decorate(mode.tool.name, mode.host.unit(), annotations, line, mode.viewport.worldPerPixel());
  }

  /** A field of the shape clicked: the calculator on its value; ✓ keeps it (as Tab), and the shape takes it. */
  openField(a: Annotation, event: PointerEvent): void {
    const { mode } = this;
    const tool = mode.tool;
    if (!tool || !a.field) return;
    const field = a.field.id as DimField;
    const angle = field === "a";
    const r = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    openCalculator({
      container: mode.host.calculatorContainer(),
      anchor: r ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: event.clientX + 12, y: event.clientY },
      value: a.value,
      unit: angle ? "deg" : mode.host.unit(),
      title: a.field.name,
      locked: true,
      noLock: true,
      allowNegative: angle,
      onSubmit: (value) => {
        this.typed.set(tool.name, field, value);
        if (this.cursor) mode.preview = tool.move(mode.geometry, this.landing(this.cursor));
        mode.showShape(mode.preview);
        mode.render();
        return true;
      },
    });
  }

  /**
   * A key while a shape is drawn (its first point clicked): a digit goes into the field in blue, Tab keeps the value
   * and takes the next field, Retour arrière erases, Entrée lays the shape with what is typed. False: not for it.
   */
  key(event: KeyboardEvent): boolean {
    const { mode } = this;
    const tool = mode.tool;
    if (!tool || !tool.anchor(mode.geometry) || !typedFields(tool.name).length) return false;
    const digit = typedDigit(event) ?? (/^[.,]$/.test(event.key) ? event.key : null);
    if (digit !== null) this.typed.type(tool.name, digit);
    else if (event.key === "Tab") this.typed.next(tool.name, mode.host.unit());
    else if (event.key === "Backspace") {
      if (!this.typed.erase(tool.name)) return false;
    } else if (event.key === "Enter" && !this.typed.empty && this.cursor) return this.lay(this.landing(this.cursor)), true;
    else return false;
    if (this.cursor) mode.preview = tool.move(mode.geometry, this.landing(this.cursor));
    // A value typed that takes the shape beyond the screen: the view steps back to show it whole, with its fields.
    mode.showShape(mode.preview);
    mode.render();
    return true;
  }

  /** A point of the shape, clicked or laid by Entrée: the shape goes on, or is made — with a dimension for each value typed. */
  lay(at: PointerSnap): void {
    const { mode } = this;
    const tool = mode.tool;
    if (!tool) return;
    try {
      const values = this.typed.values(tool.name, mode.host.unit());
      const result = tool.click(mode.geometry, at);
      this.aligned(result.kind === "commit" ? null : at.pos);
      if (result.kind === "commit") {
        this.typed.reset();
        // A finished shape (rectangle, circle, arc, closed polyline): the tool stays for the next one, until Échap
        // or « Terminer ».
        if (mode.apply(withTypedDimensions(result.geometry, result.created, tool.name, values))) mode.preview = null;
      } else mode.preview = result.preview;
    } catch (error) {
      mode.host.notify(error instanceof Error ? error.message : String(error), "error");
      tool.reset();
      this.typed.reset();
      this.aligned(null);
    }
    mode.render();
    mode.host.changed();
  }
}
