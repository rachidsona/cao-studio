/**
 * Outil « Implantation » : une cuisine entière le long d'un mur (I) ou de deux murs en angle (L), calculée par
 * features/kitchen-layout.ts — meubles bas et hauts (des caissons ordinaires), leurs façades, plan de travail,
 * fileurs et murs. Tout arrive dans l'historique en une seule annulation et reste modifiable pièce par pièce ; les
 * murs vont sur le calque « Pièce » et restent hors du débit et du devis.
 */
import { decorateKitchen, kitchenPlan } from "../document/kitchen-plan";
import { MATERIALS } from "../document/materials";
import type { CadDocument, Feature } from "../document/types";
import { KITCHEN, kitchenLayout, kitchenProblem, type KitchenSettings } from "../features/kitchen-layout";
import { PanelTool, type ToolContext } from "./panel-tool";

export class KitchenTool extends PanelTool {
  private readonly s: KitchenSettings = { ...KITCHEN };
  private frontMaterial = "lacquer-white";
  private worktopMaterial = "solid-oak";

  constructor(ctx: ToolContext) {
    super(ctx, "Implantation de cuisine", null);
  }

  private plan() {
    return kitchenPlan(this.ctx.doc(), this.s, this.frontMaterial, this.worktopMaterial);
  }

  protected feature(): Feature | string {
    return kitchenProblem(this.s) ?? this.plan().features[0] ?? "Rien à implanter.";
  }

  protected override companions(): Feature[] {
    return kitchenProblem(this.s) ? [] : this.plan().features.slice(1);
  }

  /** Materials, names, and the walls on the "Pièce" layer (made when missing). */
  protected override decorate(doc: CadDocument): CadDocument {
    return kitchenProblem(this.s) ? doc : decorateKitchen(doc, this.plan());
  }

  protected override blocker(): string | null {
    if (kitchenProblem(this.s)) return null;
    const bad = this.plan().features.map((f) => this.ctx.status(f.id)).find((st) => st && st.state !== "ok");
    return bad ? (bad.message ?? "Cette implantation est impossible.") : null;
  }

  private set<K extends keyof KitchenSettings>(key: K, value: KitchenSettings[K]): void {
    this.s[key] = value;
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const s = this.s;
    const len = (label: string, key: "lengthA" | "lengthB" | "wallHeight" | "baseHeight" | "baseDepth" | "plinth" | "worktopThickness") =>
      this.numberRow(label, s[key], unit, (v) => this.set(key, Math.max(0, v)));
    const { units, boxes } = kitchenLayout(s);
    const base = units.filter((u) => u.name.startsWith("Bas")).length;
    const fillers = boxes.filter((b) => b.kind === "filler").length;
    const materials = MATERIALS.filter((m) => m.id !== "hdf").map((m): [string, string] => [m.id, m.name]);
    return [
      this.selectRow("Disposition", s.layout, [["I", "Un mur (I)"], ["L", "Deux murs en angle (L)"]], (v) => this.set("layout", v as KitchenSettings["layout"])),
      len("Mur A", "lengthA"),
      s.layout === "L" ? len("Mur B", "lengthB") : null,
      len("Plafond", "wallHeight"),
      len("Hauteur des bas", "baseHeight"),
      len("Profondeur", "baseDepth"),
      len("Socle", "plinth"),
      len("Plan de travail", "worktopThickness"),
      this.selectRow("Façades des bas", s.fronts, [["mixed", "Tiroirs et portes, en alternance"], ["drawers", "Tiroirs partout"], ["doors", "Portes partout"]], (v) => this.set("fronts", v as KitchenSettings["fronts"])),
      this.selectRow("Matière des façades", this.frontMaterial, materials, (v) => ((this.frontMaterial = v), this.schedulePreview())),
      this.selectRow("Plan de travail en", this.worktopMaterial, materials, (v) => ((this.worktopMaterial = v), this.schedulePreview())),
      this.checkRow("Meubles hauts au-dessus", s.wallUnits, (v) => this.set("wallUnits", v)),
      this.info(kitchenProblem(s) ?? `${base} meuble(s) bas${s.wallUnits ? `, ${units.length - base} haut(s)` : ""}, ${fillers} fileur(s). Modules de 600 d'abord, puis le plus grand qui tient. Le mur A part de l'origine vers +X ; les meubles sont devant (Y < 0).`),
    ];
  }
}
