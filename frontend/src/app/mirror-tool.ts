/**
 * "Symétrie" (as Curic Mirror): mirror copies of the chosen bodies and
 * sketches across a plane perpendicular to X, Y or Z. The plane goes against
 * a side of the selection (the copies come right next to it) or through its
 * centre, or at a typed position; it is drawn in the view. A click on a body
 * or a sketch adds it to what is copied, or removes it. The originals stay;
 * a sketch's copy is a new sketch, in the same undo step.
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type Axis, type Feature, type MirrorFeature } from "../document/types";
import type { Box } from "../features/curic";
import { mirrorSketch, sketchBox } from "../sketcher/sketch-transform";
import { el } from "../ui/dom";
import { AXIS_OPTIONS, boxOfBodies, freshFeatureIds, PlaneMarker, unionBox } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

export class MirrorTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private targets: string[];
  private sketches: string[];
  private axis: Axis;
  private position: number;
  private readonly marker: PlaneMarker;

  constructor(ctx: ToolContext, editing: MirrorFeature | null, selected: string[], sketches: string[] = []) {
    super(ctx, "Symétrie", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "mi");
    this.name = editing?.name ?? uniqueName(doc, "Symétrie");
    const last = ctx.bodies().at(-1)?.id;
    this.sketches = editing ? [] : [...sketches];
    this.targets = editing?.targets ?? (selected.length || sketches.length ? [...selected] : last ? [last] : []);
    this.axis = editing?.axis ?? 0;
    this.marker = new PlaneMarker(ctx.viewport);
    // A new mirror starts against the + side: the copies come right next to the originals.
    this.position = editing?.position ?? this.sidePosition("max");
  }

  private box(): Box | null {
    const doc = this.ctx.doc();
    const boxes = this.sketches.map((id) => findFeature(doc, id)).map((f) => (f?.type === "sketch" ? sketchBox(f) : null));
    return unionBox([boxOfBodies(this.ctx.viewport, this.targets), ...boxes]);
  }

  private sidePosition(where: "min" | "center" | "max"): number {
    const box = this.box();
    if (!box) return 0;
    const [lo, hi] = [box[0][this.axis] as number, box[1][this.axis] as number];
    return Number((where === "min" ? lo : where === "max" ? hi : (lo + hi) / 2).toFixed(4));
  }

  /** The copies: one mirror operation for the bodies, a new sketch for each sketch. */
  private features(): Feature[] {
    const doc = this.ctx.doc();
    const list: Feature[] = [];
    if (this.targets.length) list.push({ id: this.id, type: "mirror", name: this.name, targets: [...this.targets], axis: this.axis, position: this.position });
    const slots = freshFeatureIds(doc, "sk", "Esquisse", this.sketches.length);
    this.sketches.forEach((id, i) => {
      const sketch = findFeature(doc, id);
      const copy = sketch?.type === "sketch" ? mirrorSketch(sketch, this.axis, this.position, slots[i]!.id, `${sketch.name} (symétrie)`) : null;
      if (copy) list.push(copy);
    });
    return list;
  }

  protected feature(): Feature | string {
    if (this.targets.length === 0 && this.sketches.length === 0) return "Cliquez les corps ou les esquisses à copier en symétrie.";
    return this.features()[0] ?? "Ces esquisses sont en biais par rapport à ce plan : choisissez un autre axe.";
  }

  protected override companions(): Feature[] {
    return this.features().slice(1);
  }

  protected override render(): void {
    super.render();
    this.marker.show(this.axis, this.position, this.box());
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const place = (label: string, where: "min" | "center" | "max") => {
      const button = el("button", { type: "button", class: "h-7 flex-1 rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, label);
      button.addEventListener("click", () => {
        this.position = this.sidePosition(where);
        changed();
      });
      return button;
    };
    const doc = this.ctx.doc();
    const names = [...this.targets.map((id) => bodyLabel(doc, id)), ...this.sketches.map((id) => findFeature(doc, id)?.name ?? id)];
    return [
      this.info(names.length ? `Copiés (${names.length}) : ${names.join(", ")}` : "Rien de choisi."),
      this.selectRow("Axe", String(this.axis), AXIS_OPTIONS, (v) => {
        this.axis = Number(v) as Axis;
        this.position = this.sidePosition("max");
        changed();
      }),
      this.numberRow(
        "Plan à",
        this.position,
        this.ctx.unit(),
        (v) => {
          this.position = v;
          changed();
        },
        true,
      ),
      el("div", { class: "flex gap-1" }, place("Côté −", "min"), place("Centre", "center"), place("Côté +", "max")),
      this.info("Cliquez un corps ou une esquisse dans la vue pour l'ajouter ou le retirer. Le plan orange est le miroir."),
    ];
  }

  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (!target) return;
    if (target.kind === "sketch") {
      if (this.editing) return;
      const i = this.sketches.indexOf(target.id);
      if (i >= 0) this.sketches.splice(i, 1);
      else this.sketches.push(target.id);
    } else {
      // The copies shown by the preview are not originals.
      if (featureOfBody(target.id) === this.id) return;
      const i = this.targets.indexOf(target.id);
      if (i >= 0) this.targets.splice(i, 1);
      else this.targets.push(target.id);
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.marker.hide();
  }
}
