/**
 * « Découpes du plan de travail » : sur un plan cliqué (ou sélectionné), l'évier, la plaque de cuisson, le robinet ou
 * un passe-câble choisis dans un catalogue, placés le long du plan et depuis son bord avant
 * (features/worktop-cutouts.ts). Un usinage du plan, qui suit la planche ; se rouvre pour être modifié.
 */
import { bodyLabel } from "../../document/operations";
import type { Feature, MachiningFeature } from "../../document/types";
import { APPLIANCES, cutoutOps, placeCutout, type Cutout } from "../../features/worktop-cutouts";
import { el } from "../../ui/dom";
import { freshFeatureIds } from "../curic-common";
import { PanelTool, type ToolContext } from "../panel-tool";
import type { Box } from "../../features/joinery";

const REMOVE = "size-8 shrink-0 border border-gray-300 hover:bg-red-50 hover:text-red-700 dark:border-gray-600 dark:hover:bg-red-950";

export class CutoutTool extends PanelTool {
  private target: string | null;
  private box: Box | null = null;
  private cutouts: Cutout[];
  private frontSign: -1 | 1 | null;

  constructor(ctx: ToolContext, editing: MachiningFeature | null, selected: string[] = []) {
    super(ctx, "Découpes du plan de travail", editing);
    this.target = editing?.target ?? selected[0] ?? null;
    this.cutouts = structuredClone(editing?.cutouts ?? []);
    this.frontSign = editing?.frontSign ?? null;
    // Edited: the machined body stands in the view for the worktop (same box, the cuts go through).
    if (this.target) this.remember(this.target, editing?.id);
  }

  private remember(id: string, shown?: string): void {
    const b = (this.ctx.viewport.bodyMesh(id) ?? (shown ? this.ctx.viewport.bodyMesh(shown) : undefined))?.metrics.bbox;
    this.box = b ? [[...b[0]], [...b[1]]] : null;
  }

  /** The side the worktop faces: chosen, else −Y for one running along X, +X for one along Y (as the kitchen makes them). */
  private front(): -1 | 1 {
    if (this.frontSign) return this.frontSign;
    const b = this.box;
    return b && b[1][0] - b[0][0] < b[1][1] - b[0][1] ? 1 : -1;
  }

  private length(): number {
    const b = this.box;
    return b ? Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0;
  }

  private made(): { ops: MachiningFeature["ops"]; problems: string[] } | null {
    return this.box ? cutoutOps(this.box, this.cutouts, this.front()) : null;
  }

  protected feature(): Feature | string {
    if (!this.target || !this.box) return "Cliquez le plan de travail à découper.";
    if (!this.cutouts.length) return "Ajoutez un évier, une plaque, un robinet…";
    const made = this.made();
    if (!made?.ops.length) return made?.problems[0] ?? "Aucune découpe dans le plan.";
    const slot = this.editing ?? freshFeatureIds(this.ctx.doc(), "mc", "Découpes", 1)[0]!;
    return {
      id: slot.id, type: "machining", name: slot.name, target: this.target, kind: "cutout", ops: made.ops,
      cutouts: this.cutouts.map((c) => ({ ...c })), frontSign: this.front(), anchor: [...this.box[0]], anchorHigh: [...this.box[1]],
    };
  }

  protected override blocker(): string | null {
    return this.made()?.problems[0] ?? null;
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const b = this.box;
    const depth = b ? Math.min(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0;
    const problems = this.made()?.problems ?? [];
    const list = this.cutouts.flatMap((c, i) => {
      const remove = el("button", { type: "button", class: REMOVE, title: "Retirer", "aria-label": `Retirer la découpe ${i + 1}` }, "✕");
      remove.addEventListener("click", () => (this.cutouts.splice(i, 1), this.changed()));
      const appliance = this.selectRow(`Découpe ${i + 1}`, c.appliance, APPLIANCES.map((a) => [a.id, a.label]), (v) => ((c.appliance = v), (c.front = null), this.changed()));
      const a = APPLIANCES.find((x) => x.id === c.appliance);
      const size = typeof a?.size === "number" ? a.size : (a?.size[1] ?? 0);
      const front = c.front ?? a?.front ?? (depth - size) / 2;
      return [
        el("div", { class: "flex items-center gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700" }, el("div", { class: "min-w-0 flex-1" }, appliance), remove),
        this.numberRow("Milieu ← bout", c.along, unit, (v) => ((c.along = v), this.changed())),
        this.numberRow("Bord avant →", front, unit, (v) => ((c.front = v), this.changed()), true),
      ];
    });
    const add = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Ajouter une découpe" },
      el("option", { value: "" }, "+ Ajouter une découpe…"), ...APPLIANCES.map((a) => el("option", { value: a.id }, a.label)));
    add.addEventListener("change", () => {
      if (!add.value) return;
      if (this.box) this.cutouts.push(placeCutout(this.box, this.cutouts, add.value, this.front()));
      this.changed();
    });
    return [
      this.info(this.target ? `Plan : ${bodyLabel(this.ctx.doc(), this.target)}${b ? ` — ${Math.round(this.length())} × ${Math.round(depth)} mm` : ""}` : "Cliquez le plan de travail."),
      this.selectRow("Bord avant", String(this.front()), [["-1", "Côté −Y / −X"], ["1", "Côté +Y / +X"]], (v) => ((this.frontSign = Number(v) as -1 | 1), this.changed())),
      ...list,
      add,
      ...problems.map((p) => el("p", { class: "bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950 dark:text-red-200" }, p)),
      this.info("Cotes de découpe courantes : vérifiez-les sur la notice de l'appareil. Les positions sont celles du milieu de la découpe, depuis le bout du plan où X (ou Y) est le plus petit."),
    ];
  }

  // Bodies only: the sketch of the worktop, under it, does not take the click.
  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { bodies: [face.bodyId] } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    // A click on the preview of the cut worktop is a click on the worktop itself.
    const built = this.feature();
    if (typeof built !== "string" && built.id === face.bodyId) return;
    this.target = face.bodyId;
    this.remember(face.bodyId);
    this.changed();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
