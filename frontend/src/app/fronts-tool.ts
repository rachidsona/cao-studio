/**
 * Outil « Façades » : habiller un caisson d'une porte, de deux portes ou de tiroirs (avec leurs caissons sur
 * coulisses), en applique ou encastrés, avec le jeu et l'épaisseur voulus ; charnières et poignées percées à la
 * demande. Les portes sont pleines ou vitrées (cadre en profilé alu autour d'un verre trempé, au choix du verre et du
 * cadre). Aperçu du noyau, puis une opération « Façades » dans l'historique, liée au caisson (elle suit ses cotes).
 */
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange } from "../features/glass-door";
import { bodyInfo } from "../document/materials";
import { uniqueId, uniqueName } from "../document/operations";
import { cabinetStandard, frontsTo } from "../document/standards";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature } from "../document/types";
import { frontsHardware, frontsMaterials } from "../features/fronts-parts";
import { PanelTool, type ToolContext } from "./panel-tool";
import { workshopStandards } from "./workshop/standards-panel";

export class FrontsTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private settings: Omit<FrontsFeature, "id" | "type" | "name">;

  constructor(ctx: ToolContext, editing: FrontsFeature | null) {
    super(ctx, "Façades", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "fr");
    this.name = editing?.name ?? uniqueName(doc, "Façades");
    const { id: _id, type: _type, name: _name, ...rest } = editing ?? ({} as FrontsFeature);
    this.settings = editing ? rest : { cabinet: this.cabinets().at(-1)?.id ?? "", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
    // New fronts take the mount, gap and thickness of their cabinet's standard.
    const cabinet = this.cabinets().find((c) => c.id === this.settings.cabinet);
    const standard = !editing && cabinet ? cabinetStandard(doc, cabinet, workshopStandards()) : undefined;
    if (standard) {
      const { id: _i, type: _t, name: _n, ...made } = frontsTo({ id: this.id, type: "fronts", name: this.name, ...this.settings }, standard);
      this.settings = made;
    }
  }

  private cabinets(): CabinetFeature[] {
    return this.ctx.doc().features.filter((f): f is CabinetFeature => f.type === "cabinet" && !f.suppressed);
  }

  protected feature(): FrontsFeature | string {
    if (!this.settings.cabinet) return "Créez d'abord un caisson (Meuble › Caisson) ou une Répartition.";
    return { id: this.id, type: "fronts", name: this.name, ...this.settings };
  }

  /** Parts without a material get the default one (the cabinet's for the fronts), so the cut list and quote are right. */
  protected override decorate(doc: CadDocument): CadDocument {
    const f = doc.features.find((x) => x.id === this.id);
    const cabinet = this.cabinets().find((c) => c.id === this.settings.cabinet);
    if (f?.type !== "fronts" || !cabinet) return doc;
    const materials = frontsMaterials(f, cabinet, bodyInfo(doc, `${cabinet.id}${PART_SEPARATOR}0`).material);
    const info = { ...doc.bodyInfo };
    materials.forEach((material, i) => {
      const id = `${this.id}${PART_SEPARATOR}${i}`;
      if (!info[id]?.material) info[id] = { ...info[id], material };
    });
    return { ...doc, bodyInfo: info };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Les façades sont impossibles.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const s = this.settings;
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) => {
      s[key] = value;
      changed();
    };
    const cabinet = this.cabinets().find((c) => c.id === s.cabinet);
    const hardware = frontsHardware({ id: this.id, type: "fronts", name: this.name, ...s }, cabinet);
    const doors = s.layout !== "drawers";
    const glass = doors && s.style === "glass";
    return [
      this.selectRow("Caisson", s.cabinet, this.cabinets().map((c): [string, string] => [c.id, c.name]), (v) => set("cabinet", v)),
      this.selectRow("Disposition", s.layout, [["door", "Une porte"], ["doors", "Deux portes"], ["drawers", "Tiroirs"]], (v) => set("layout", v as FrontsFeature["layout"])),
      s.layout === "drawers" ? this.numberRow("Tiroirs", s.drawers, "plain", (v) => set("drawers", Math.max(1, Math.min(8, Math.round(v))))) : null,
      this.selectRow("Pose", s.mount, [["overlay", "En applique (devant)"], ["inset", "Encastrées (dans l'ouverture)"]], (v) => set("mount", v as FrontsFeature["mount"])),
      this.numberRow("Jeu", s.gap, this.ctx.unit(), (v) => ((s.gap = Math.max(0, v)), this.schedulePreview())),
      this.numberRow("Épaisseur", s.thickness, this.ctx.unit(), (v) => ((s.thickness = Math.max(1, v)), this.schedulePreview())),
      // A door: plain, or glazed (an aluminium frame round tempered glass).
      doors ? this.selectRow("Style des portes", s.style ?? "flat", [["flat", "Plate"], ["glass", "Vitrée (cadre alu)"]], (v) => (Object.assign(s, styleChange(v === "glass" ? "glass" : "flat", s)), changed())) : null,
      glass ? this.numberRow("Largeur du cadre alu", s.frameWidth ?? GLASS_FRAME, this.ctx.unit(), (v) => ((s.frameWidth = Math.max(1, v)), this.schedulePreview())) : null,
      glass ? this.selectRow("Verre (trempé 4 mm)", s.glass ?? "clear", [...GLASS_KINDS], (v) => set("glass", v as FrontsFeature["glass"])) : null,
      glass ? this.selectRow("Cadre", s.profile ?? "brushed", [...PROFILE_FINISHES], (v) => set("profile", v as FrontsFeature["profile"])) : null,
      s.layout === "drawers" ? null : this.checkRow(glass ? "Charnières (pour cadre alu)" : "Percer les charnières (boîtiers Ø35)", s.hinges, (v) => set("hinges", v)),
      this.checkRow("Percer les poignées (entraxe 128)", s.handles, (v) => set("handles", v)),
      this.info(hardware.length ? `Quincaillerie : ${hardware.map((h) => `${h.quantity} × ${h.name.toLowerCase()}`).join(", ")}.` : "Pas de quincaillerie."),
    ];
  }
}
