/**
 * « Découpes du plan de travail » : sur un plan cliqué (ou sélectionné), l'évier, la plaque de cuisson, le robinet ou
 * un passe-câble choisis dans un catalogue, placés le long du plan et depuis son bord avant
 * (features/worktop-cutouts.ts). Chaque découpe prend les cotes de la notice — largeur, profondeur, rayon des angles —
 * et se garde sous un nom dans « Mes découpes » (my-cutouts.ts). Un usinage du plan, qui suit la planche ; se rouvre
 * pour être modifié.
 */
import { bodyLabel } from "../../document/operations";
import type { Feature, MachiningFeature } from "../../document/types";
import { APPLIANCES, cutoutOps, cutShape, placeCutout, type Cutout } from "../../features/worktop-cutouts";
import { askName } from "../door-menu";
import { forgetMyCutout, keepMyCutout, myCutouts } from "./my-cutouts";
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

  /** `touched`: the cut-out changed by hand — no longer the plan's own, a kitchen made again keeps it as it is. */
  private changed(touched?: Cutout): void {
    if (touched) delete touched.auto;
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const b = this.box;
    const depth = b ? Math.min(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0;
    const problems = this.made()?.problems ?? [];
    const mine = myCutouts();
    const list = this.cutouts.flatMap((c, i) => {
      const remove = el("button", { type: "button", class: REMOVE, title: "Retirer", "aria-label": `Retirer la découpe ${i + 1}` }, "✕");
      remove.addEventListener("click", () => (this.cutouts.splice(i, 1), this.changed()));
      // Another appliance: its catalogue sizes again.
      const appliance = this.selectRow(`Découpe ${i + 1}`, c.appliance, APPLIANCES.map((a) => [a.id, a.label]), (v) => {
        this.cutouts[i] = { appliance: v, along: c.along, front: null };
        this.changed();
      });
      const shape = cutShape(c);
      if (!shape) return [];
      const front = c.front ?? shape.front ?? (depth - shape.depth) / 2;
      // Its own sizes, from the appliance's leaflet: kept with the cut-out, over the catalogue's.
      const sizes = shape.round
        ? [this.numberRow("Diamètre", shape.width, unit, (v) => ((c.diameter = v), this.changed(c)))]
        : [
            this.numberRow("Largeur", shape.width, unit, (v) => ((c.size = [v, shape.depth]), this.changed(c))),
            this.numberRow("Profondeur", shape.depth, unit, (v) => ((c.size = [shape.width, v]), this.changed(c))),
            this.numberRow("Rayon des angles", shape.radius, unit, (v) => ((c.radius = Math.max(0, v)), this.changed(c)), true),
          ];
      const keep = el("button", { type: "button", class: "h-7 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-cutout-keep": String(i), title: "Garder ces cotes sous un nom, pour les reposer dans tous vos projets" }, "Garder dans Mes découpes…");
      keep.addEventListener("click", (event) => {
        askName(event.clientX, event.clientY, c.name ?? shape.name, (name) => {
          const { along: _along, ...cut } = c;
          keepMyCutout({ ...cut, name, front: c.front });
          c.name = name;
          delete c.auto;
          this.ctx.notify(`« ${name} » gardée dans Mes découpes.`, "success");
          this.changed();
        }, { label: "Nom de la découpe", attr: "data-cutout-name" });
      });
      return [
        el("div", { class: "flex items-center gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700" }, el("div", { class: "min-w-0 flex-1" }, appliance), remove),
        c.name ? this.info(`« ${c.name} »`) : null,
        this.numberRow("Milieu ← bout", c.along, unit, (v) => ((c.along = v), this.changed(c))),
        this.numberRow("Bord avant →", front, unit, (v) => ((c.front = v), this.changed(c)), true),
        ...sizes,
        keep,
      ];
    });
    const add = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Ajouter une découpe" },
      el("option", { value: "" }, "+ Ajouter une découpe…"), ...APPLIANCES.map((a) => el("option", { value: a.id }, a.label)),
      mine.length ? el("optgroup", { label: "Mes découpes" }, ...mine.map((m, k) => el("option", { value: `my:${k}` }, m.name))) : null);
    add.addEventListener("change", () => {
      if (!add.value || !this.box) return;
      // One of one's own: placed as its appliance is, with its sizes.
      const own = add.value.startsWith("my:") ? mine[Number(add.value.slice(3))] : undefined;
      const placed = placeCutout(this.box, this.cutouts, own?.appliance ?? add.value, this.front());
      this.cutouts.push(own ? { ...own, along: placed.along } : placed);
      this.changed();
    });
    const kept = mine.map((m) => {
      const forget = el("button", { type: "button", class: REMOVE, title: "Oublier", "aria-label": `Oublier ${m.name}` }, "✕");
      forget.addEventListener("click", () => (forgetMyCutout(m.name), this.render()));
      const shape = cutShape({ ...m, along: 0 });
      return el("div", { class: "flex items-center gap-1.5 text-xs" }, el("span", { class: "min-w-0 flex-1 truncate" }, `${m.name}${shape ? ` — ${shape.round ? `Ø${Math.round(shape.width)}` : `${Math.round(shape.width)} × ${Math.round(shape.depth)}, R${Math.round(shape.radius)}`}` : ""}`), forget);
    });
    return [
      this.info(this.target ? `Plan : ${bodyLabel(this.ctx.doc(), this.target)}${b ? ` — ${Math.round(this.length())} × ${Math.round(depth)} mm` : ""}` : "Cliquez le plan de travail."),
      this.selectRow("Bord avant", String(this.front()), [["-1", "Côté −Y / −X"], ["1", "Côté +Y / +X"]], (v) => ((this.frontSign = Number(v) as -1 | 1), this.changed())),
      ...list,
      add,
      ...(kept.length ? [el("p", { class: "border-t border-gray-200 pt-2 text-xs font-medium dark:border-gray-700" }, "Mes découpes"), ...kept] : []),
      ...problems.map((p) => el("p", { class: "bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950 dark:text-red-200" }, p)),
      this.info("Cotes de découpe courantes : remplacez-les par celles de la notice de l'appareil (largeur, profondeur, rayon des angles), puis gardez-les dans Mes découpes. Les positions sont celles du milieu de la découpe, depuis le bout du plan où X (ou Y) est le plus petit."),
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
