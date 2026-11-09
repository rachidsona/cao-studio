/**
 * « Électroménager » : la bibliothèque d'appareils de cuisine (features/appliance-library.ts) — fours, plaques,
 * hottes, réfrigérateurs, lave-vaisselle, micro-ondes, éviers, robinets —, chacun dessiné, à ses tailles et dans ses
 * finitions. On en choisit un, puis on clique le caisson où le poser (ou le plan de travail au-dessus) : il s'y met à
 * sa place (document/appliance-place.ts), en une annulation, et l'outil reste ouvert pour le suivant.
 */
import { withAppliance } from "../../document/appliance-place";
import { cabinetBox } from "../../document/kitchen-catalog";
import { findFeature } from "../../document/operations";
import { featureOfBody, type CabinetFeature, type Feature, type Vec3 } from "../../document/types";
import { APPLIANCE_LIBRARY, CATEGORIES, FINISH_LABELS, type ApplianceCategory } from "../../features/appliance-library";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import { applianceDrawing } from "./appliance-drawings";
import { wholeOwner } from "../move-whole";
import { PanelTool, type ToolContext } from "../panel-tool";

const CHIP = "h-6 border px-1.5 text-[11px] font-medium";
const on = "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
const off = "border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** Kept for the session: the family shown, the model, its size and finish. */
let lastCategory: ApplianceCategory = "oven";
let lastModel: string | null = null;
const lastSize: Record<string, number> = {};
const lastFinish: Record<string, string> = {};

export class ApplianceTool extends PanelTool {
  private category = lastCategory;
  private model = lastModel;

  constructor(ctx: ToolContext) {
    super(ctx, "Électroménager", null);
  }

  private get def() {
    return APPLIANCE_LIBRARY.find((d) => d.id === this.model);
  }

  protected feature(): Feature | string {
    return this.def ? `Cliquez le caisson où poser « ${this.def.name} » (ou le plan de travail au-dessus).` : "Choisissez un appareil, puis cliquez son caisson.";
  }

  protected override heading(): string {
    return "Électroménager";
  }

  protected override render(): void {
    super.render();
    // Each placing is already kept: the panel only closes.
    const buttons = this.panel.querySelectorAll<HTMLButtonElement>(":scope > div:last-child > button");
    buttons[1]?.remove();
    if (buttons[0]) buttons[0].textContent = "Fermer";
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const tabs = el(
      "div",
      { class: "flex flex-wrap gap-1", role: "tablist", "aria-label": "Familles d'électroménager" },
      ...CATEGORIES.map(({ id, label }) => {
        const b = el("button", { type: "button", role: "tab", "aria-selected": String(id === this.category), class: `${CHIP} ${id === this.category ? on : off}`, "data-appliance-family": id }, label);
        b.addEventListener("click", () => ((this.category = lastCategory = id), this.render()));
        return b;
      }),
    );
    const cards = APPLIANCE_LIBRARY.filter((d) => d.category === this.category).map((def) => {
      const chosen = def.id === this.model;
      const finish = lastFinish[def.id] ?? def.finishes[0]!;
      const size = def.sizes[lastSize[def.id] ?? 0] ?? def.sizes[0]!;
      const card = el("button", { type: "button", "aria-pressed": String(chosen), class: `block w-full border p-1.5 text-left ${chosen ? "border-sky-500 bg-sky-50/60 dark:bg-sky-950/40" : "border-gray-200 hover:border-gray-400 dark:border-gray-700"}`, "data-appliance": def.id });
      card.innerHTML = applianceDrawing(def, finish);
      card.append(el("span", { class: "block font-medium" }, def.name), el("span", { class: "block text-[10px] text-gray-500 dark:text-gray-400" }, `${size.map((v) => formatLength(v, unit).replace(/\s?(mm|cm|m)$/, "")).join(" × ")} · ${def.note}`));
      card.addEventListener("click", () => ((this.model = lastModel = def.id), this.render()));
      const extra = chosen
        ? el(
            "div",
            { class: "space-y-1 px-1 pb-1" },
            def.sizes.length > 1 ? el("div", { class: "flex flex-wrap gap-1", "aria-label": "Tailles" }, ...def.sizes.map((s, i) => this.chip(`${formatLength(s[0], unit)}`, (lastSize[def.id] ?? 0) === i, `data-appliance-size`, String(i), () => ((lastSize[def.id] = i), this.render())))) : null,
            el("div", { class: "flex flex-wrap gap-1", "aria-label": "Finitions" }, ...def.finishes.map((f) => this.chip(FINISH_LABELS[f] ?? f, f === finish, "data-appliance-finish", f, () => ((lastFinish[def.id] = f), this.render())))),
          )
        : null;
      return el("div", {}, card, extra);
    });
    return [tabs, el("div", { class: "max-h-[50vh] space-y-1 overflow-y-auto pr-0.5" }, ...cards)];
  }

  private chip(text: string, pressed: boolean, attr: string, value: string, go: () => void): HTMLElement {
    const b = el("button", { type: "button", "aria-pressed": String(pressed), class: `${CHIP} ${pressed ? on : off}`, [attr]: value }, text);
    b.addEventListener("click", go);
    return b;
  }

  /** The cabinet of the body clicked, or the one under the point clicked (the worktop over it, a wall). */
  private cabinetAt(bodyId: string, point: Vec3): CabinetFeature | null {
    const doc = this.ctx.doc();
    const owner = wholeOwner(doc, bodyId);
    const own = owner?.kind === "cabinet" ? findFeature(doc, owner.id) : undefined;
    if (own?.type === "cabinet") return own;
    // An appliance or a piece in a cabinet (its door standing out in front): that cabinet.
    const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet");
    const around = cabinets.filter((f) => {
      const [lo, hi] = cabinetBox(f);
      return [0, 1].every((i) => point[i]! >= lo[i]! - 60 && point[i]! <= hi[i]! + 60) && point[2] >= lo[2] - 1 && point[2] <= hi[2] + 1;
    });
    if (around.length) return around.sort((a, b) => a.width * a.height - b.width * b.height)[0]!;
    const under = cabinets.filter((f) => {
      const [lo, hi] = cabinetBox(f);
      return point[0] >= lo[0] - 1 && point[0] <= hi[0] + 1 && point[1] >= lo[1] - 1 && point[1] <= hi[1] + 1 && hi[2] <= point[2] + 1;
    });
    return under.sort((a, b) => cabinetBox(b)[1][2] - cabinetBox(a)[1][2])[0] ?? null;
  }

  /** The worktop over a cabinet: a thin body (not of a cabinet, nor an appliance) lying on its top, over its middle. */
  private worktopOver(c: CabinetFeature): { body: string; box: [Vec3, Vec3] } | undefined {
    const doc = this.ctx.doc();
    const [lo, hi] = cabinetBox(c);
    const [mx, my] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    let best: { body: string; box: [Vec3, Vec3] } | undefined;
    for (const id of this.ctx.viewport.displayedBodies) {
      const f = findFeature(doc, featureOfBody(id));
      if (!f || f.type === "cabinet" || f.type === "fronts" || f.type === "appliance") continue;
      const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
      if (!b) continue;
      const thick = b[1][2] - b[0][2];
      if (mx < b[0][0] || mx > b[1][0] || my < b[0][1] || my > b[1][1] || Math.abs(b[0][2] - hi[2]) > 60 || thick > 80 || thick < 10) continue;
      if (!best || b[0][2] < best.box[0][2]) best = { body: id, box: [[...b[0]] as Vec3, [...b[1]] as Vec3] };
    }
    return best;
  }

  protected override click(event: PointerEvent): void {
    const def = this.def;
    if (!def) return this.ctx.notify("Choisissez d'abord un appareil dans la bibliothèque.", "info");
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    const point: Vec3 = [face.point.x, face.point.y, face.point.z];
    const c = this.cabinetAt(face.bodyId, point);
    if (!c) return this.ctx.notify(`Cliquez un caisson (ou le plan de travail au-dessus) pour y poser « ${def.name} ».`, "info");
    const size = def.sizes[lastSize[def.id] ?? 0] ?? def.sizes[0]!;
    const finish = lastFinish[def.id] ?? def.finishes[0]!;
    const made = withAppliance(this.ctx.doc(), def.id, size, finish, c, { worktop: this.worktopOver(c) });
    if (typeof made === "string") return this.ctx.notify(made, "error");
    this.ctx.notify(`« ${def.name} » posé ${def.place === "in" ? "dans" : def.place === "stand" ? "à la place de" : def.place === "under" ? "sous" : "sur"} « ${c.name} ».${made.notes.length ? ` ${made.notes.join(" ")}` : ""}`, "success");
    this.ctx.commit(made.doc, made.id, () => this.render());
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
