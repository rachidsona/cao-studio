/**
 * Values of the sketch's dimensions: placing the measurement of the selection as a dimension ("Cote" tool),
 * the keypad that changes a value (locked: a driving dimension; unlocked: the shape resized once), and the
 * dimension texts, which a click opens in the keypad and a drag moves.
 */
import { solveSketch } from "../constraints/solver";
import type { DimensionConstraint, SketchConstraint, SketchGeometry } from "../document/sketch";
import { openCalculator } from "../ui/calculator";
import { dimensionLineDistance, matchingDimension, nextSideDimension, placementOffset, selectionSpec, type Annotation, type DimensionSpec } from "./annotations";
import { pruneBodyPoints } from "./body-points";
import { addConstraint, measure, removeEntities, setDimensionValue, type Vec2 } from "./edit";
import type { SketchMode } from "./mode";

/** What a value typed in the keypad applies to: an existing dimension, or a new one. */
interface ValueTarget {
  dimensionId?: string;
  spec?: DimensionSpec;
  value: number;
  angle: boolean;
  signed: boolean;
  title: string;
}

export class SketchValues {
  constructor(private readonly mode: SketchMode) {}

  /** Placed dimension whose drawn lines are under the pointer, if any. */
  pickDimension(p: Vec2): { id: string; distance: number } | null {
    const px = this.mode.viewport.worldPerPixel();
    let best: { id: string; distance: number } | null = null;
    for (const a of this.mode.annotations) {
      if (!a.dimensionId) continue;
      const distance = dimensionLineDistance(a, p, px);
      if (distance <= this.mode.tolerance() && (!best || distance < best.distance)) best = { id: a.dimensionId, distance };
    }
    return best;
  }

  private done(): void {
    this.mode.selection.clear();
    this.mode.render();
    this.mode.host.changed();
  }

  /** Turns the measurement of the selection into a dimension that stays on screen (its value is changed by clicking it). */
  placeMeasurement(): void {
    const { mode } = this;
    const spec = selectionSpec(mode.geometry, [...mode.selection]);
    if (!spec) return;
    if (matchingDimension(mode.geometry, spec)) {
      mode.host.notify("Cette cote est déjà posée : cliquez sa valeur pour la modifier.", "info");
      return this.done();
    }
    const value = Number(measure(mode.geometry, { ...spec, id: "", value: 0 } as DimensionConstraint).toFixed(6));
    const added = addConstraint(mode.geometry, { ...spec, value } as unknown as Omit<SketchConstraint, "id">);
    // A dimension the sketch already determines would over-constrain it: place it as a
    // reference dimension instead (shown between parentheses, never imposed).
    let overConstrained = false;
    try {
      overConstrained = solveSketch(added.geometry).state !== "ok";
    } catch {
      overConstrained = true;
    }
    if (overConstrained) {
      const reference = addConstraint(mode.geometry, { ...spec, value, driving: false } as unknown as Omit<SketchConstraint, "id">);
      if (mode.apply(reference.geometry)) mode.host.notify("Cette valeur est déjà imposée par l'esquisse : cote de référence ajoutée (entre parenthèses).", "info");
      return this.done();
    }
    if (!mode.apply(added.geometry)) return;
    this.done();
  }

  private editValue(target: ValueTarget, anchor: { x: number; y: number }): void {
    openCalculator({
      container: this.mode.host.calculatorContainer(),
      anchor,
      value: target.value,
      unit: target.angle ? "deg" : this.mode.host.unit(),
      title: target.title,
      locked: true,
      allowNegative: target.signed,
      onSubmit: (value, locked) => this.applyValue(target, value, locked),
      // As in Fusion: the value is applied, then the other side of the contour is asked for (width, then height…).
      onNext: (value, locked) => {
        const spec = target.spec ?? (target.dimensionId ? this.mode.geometry.constraints.find((c) => c.id === target.dimensionId) : undefined);
        if (!this.applyValue(target, value, locked)) return false;
        const next = spec && !target.angle ? nextSideDimension(this.mode.geometry, spec as DimensionSpec) : null;
        if (next) this.editValue({ ...next, angle: false, signed: false, title: "Cote" }, anchor);
        return true;
      },
    });
  }

  /** Applies a typed value. Locked: the value becomes (or updates) a driving dimension. Unlocked: the shape is resized once and the dimension dropped. */
  private applyValue(target: ValueTarget, value: number, locked: boolean): boolean {
    const { mode } = this;
    let geometry: SketchGeometry;
    let id: string;
    if (target.dimensionId) {
      geometry = setDimensionValue(mode.geometry, target.dimensionId, value);
      id = target.dimensionId;
    } else if (target.spec) {
      const added = addConstraint(mode.geometry, { ...target.spec, value } as unknown as Omit<SketchConstraint, "id">);
      geometry = added.geometry;
      id = added.id;
    } else return false;
    if (!locked) {
      try {
        const solved = solveSketch(geometry);
        if (solved.state === "conflicting" || solved.state === "failed") return false;
        geometry = removeEntities(solved.geometry, [id]);
      } catch {
        return false;
      }
    }
    const ok = mode.apply(geometry);
    if (ok && mode.kind === "dimension" && target.spec) {
      mode.selection.clear();
      mode.render();
    }
    return ok;
  }

  /** Pointer pressed on a dimension text: a click opens the keypad, a drag moves the dimension. */
  pointerDown(annotation: Annotation, down: PointerEvent): void {
    const { mode } = this;
    const start = { x: down.clientX, y: down.clientY };
    const id = annotation.role === "driving" ? annotation.dimensionId : undefined;
    const base = mode.geometry;
    let moved = false;
    const onMove = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
      moved = true;
      if (!id) return;
      const p = mode.toSketch(event);
      const offset = p ? placementOffset(annotation, p) : null;
      if (offset === null) return;
      mode.geometry = { ...base, constraints: base.constraints.map((c) => (c.id === id && "value" in c ? { ...c, offset } : c)) };
      mode.render();
    };
    const onUp = (event: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moved) {
        // Presentation only: stored in the document without solving again.
        if (id && mode.geometry !== base) mode.host.commit(mode.featureId, pruneBodyPoints(mode.geometry));
        return;
      }
      const anchor = { x: event.clientX, y: event.clientY };
      const common = { value: annotation.value, angle: annotation.angle, signed: annotation.angle };
      if (id) this.editValue({ ...common, dimensionId: id, title: "Cote" }, anchor);
      else if (annotation.spec) this.editValue({ ...common, spec: annotation.spec, title: "Nouvelle cote" }, anchor);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}
