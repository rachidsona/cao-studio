/**
 * Outil « Façades » : habiller un caisson d'une porte, de deux portes ou de tiroirs (avec leurs caissons sur
 * coulisses), en applique ou encastrés, avec le jeu et l'épaisseur voulus ; charnières et poignées percées à la
 * demande. Les portes sont plates, à cadre (panneau en retrait), cannelées, à tasseaux (rainures dans leur face,
 * features/door-decor.ts) ou vitrées (cadre en profilé alu autour d'un verre trempé, au choix du verre et du cadre). Une porte seule s'ouvre à gauche, à droite, vers le haut (relevable, sur compas) ou vers le bas (abattant) ;
 * « Sans poignée » remplace les poignées par une gorge en profilé alu derrière le chant haut de chaque façade. Aperçu du noyau, puis une opération « Façades » dans l'historique, liée au caisson (elle suit ses cotes).
 */
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../features/glass-door";
import { DECOR_LABELS } from "../features/door-decor";
import { decorRows } from "../sketcher/partition-door-style";
import { bodyInfo } from "../document/materials";
import { uniqueId, uniqueName } from "../document/operations";
import { cabinetStandard, frontsTo } from "../document/standards";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature } from "../document/types";
import { frontMass } from "../document/hardware";
import { frontsHardware, frontsMaterials, frontsParts, GORGE, liftStay } from "../features/fronts-parts";
import { formatLength } from "../measurements/units";
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
    const made: FrontsFeature = { id: this.id, type: "fronts", name: this.name, ...s };
    const doc = this.ctx.doc();
    const hardware = frontsHardware(made, cabinet, (part) => frontMass(doc, made, part));
    const doors = s.layout !== "drawers";
    const glass = doors && s.style === "glass";
    const gorge = s.grip === "gorge";
    // A lift-up door: what its stays are chosen from.
    const door = s.layout === "door" && s.side === "top" ? frontsParts(made, cabinet)[0] : undefined;
    const [high, mass] = door ? [door.to[2] - door.from[2], frontMass(doc, made, 0)] : [0, 0];
    const stay = door ? liftStay(high, mass) : null;
    const lift = door ? `Porte relevable de ${mass.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg, haute de ${formatLength(high, this.ctx.unit())} : facteur ${Math.round(high * mass)}${stay ? "" : " — plus qu'une paire de compas ne tient, voyez la fiche du fabricant"}.` : null;
    return [
      this.selectRow("Caisson", s.cabinet, this.cabinets().map((c): [string, string] => [c.id, c.name]), (v) => set("cabinet", v)),
      // Drawers are not glazed: a glass door made drawers becomes plain.
      this.selectRow("Disposition", s.layout, [["door", "Une porte"], ["doors", "Deux portes"], ["drawers", "Tiroirs"]], (v) => {
        s.layout = v as FrontsFeature["layout"];
        if (s.layout === "drawers" && s.style === "glass") Object.assign(s, styleChange("flat", s));
        changed();
      }),
      s.layout === "door" ? this.selectRow("Ouverture", s.side ?? "left", [["left", "Charnières à gauche"], ["right", "Charnières à droite"], ["top", "Relevable (charnières en haut)"], ["bottom", "Abattant (charnières en bas)"]], (v) => set("side", v as FrontsFeature["side"])) : null,
      s.layout === "drawers" ? this.numberRow("Tiroirs", s.drawers, "plain", (v) => set("drawers", Math.max(1, Math.min(8, Math.round(v))))) : null,
      this.selectRow("Pose", s.mount, [["overlay", "En applique (devant)"], ["inset", "Encastrées (dans l'ouverture)"]], (v) => set("mount", v as FrontsFeature["mount"])),
      this.numberRow("Jeu", s.gap, this.ctx.unit(), (v) => ((s.gap = Math.max(0, v)), this.schedulePreview())),
      this.numberRow("Épaisseur", s.thickness, this.ctx.unit(), (v) => ((s.thickness = Math.max(1, v)), this.schedulePreview())),
      // A door: plain, or glazed (an aluminium frame round tempered glass).
      // Plain, framed, fluted, slatted — or, a door, glazed (an aluminium frame round tempered glass).
      this.selectRow(doors ? "Style des portes" : "Style des façades", s.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre (panneau en retrait)"], ...DECOR_LABELS, ...(doors ? [["glass", "Vitrée (cadre alu)"] as [string, string]] : [])], (v) => (Object.assign(s, styleChange(v as DoorStyle, s)), changed())),
      s.style === "frame" ? this.numberRow("Largeur du cadre", s.frameWidth ?? 70, this.ctx.unit(), (v) => ((s.frameWidth = v), this.schedulePreview())) : null,
      s.style === "frame" ? this.numberRow("Retrait du panneau", s.frameDepth ?? 6, this.ctx.unit(), (v) => ((s.frameDepth = v), this.schedulePreview())) : null,
      ...decorRows(s, (change) => (Object.assign(s, change), this.schedulePreview()), (label, mm, set) => this.numberRow(label, mm, this.ctx.unit(), set, label.startsWith("Bordure"))),
      glass ? this.numberRow("Largeur du cadre alu", s.frameWidth ?? GLASS_FRAME, this.ctx.unit(), (v) => ((s.frameWidth = Math.max(1, v)), this.schedulePreview())) : null,
      glass ? this.selectRow("Verre (trempé 4 mm)", s.glass ?? "clear", [...GLASS_KINDS], (v) => set("glass", v as FrontsFeature["glass"])) : null,
      glass ? this.selectRow("Cadre", s.profile ?? "brushed", [...PROFILE_FINISHES], (v) => set("profile", v as FrontsFeature["profile"])) : null,
      s.layout === "drawers" ? null : this.checkRow(glass ? "Charnières (pour cadre alu)" : "Percer les charnières (boîtiers Ø35)", s.hinges, (v) => set("hinges", v)),
      this.checkRow("Sans poignée (gorge en profilé alu)", gorge, (v) => (v ? (s.grip = "gorge") : delete s.grip, changed())),
      gorge ? this.info(`Chaque façade laisse ${formatLength(GORGE.space, this.ctx.unit())} de prise de main au-dessus de son chant haut ; le profilé se pose entre les côtés, en retrait de ${formatLength(GORGE.depth, this.ctx.unit())}.`) : this.checkRow("Percer les poignées (entraxe 128)", s.handles, (v) => set("handles", v)),
      lift ? this.info(lift) : null,
      this.info(hardware.length ? `Quincaillerie : ${hardware.map((h) => `${h.quantity} × ${h.name.toLowerCase()}`).join(", ")}.` : "Pas de quincaillerie."),
    ];
  }
}
