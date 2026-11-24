/**
 * Outil « Façades » : habiller un caisson d'une porte, de deux portes ou de tiroirs (avec leurs caissons sur
 * coulisses), en applique ou encastrés, avec le jeu et l'épaisseur voulus ; charnières et poignées percées à la
 * demande. Les portes sont plates, à cadre (panneau en retrait), cannelées, à tasseaux (rainures dans leur face,
 * features/door-decor.ts) ou vitrées (cadre en profilé alu autour d'un verre trempé, au choix du verre et du cadre). Une porte seule s'ouvre à gauche, à droite, vers le haut (relevable, sur compas) ou vers le bas (abattant) ;
 * « Sans poignée » remplace les poignées par une gorge en profilé alu derrière le chant haut de chaque façade. Aperçu du noyau, puis une opération « Façades » dans l'historique, liée au caisson (elle suit ses cotes).
 * Un clic sur un caisson dans la vue le choisit ; d'autres cliqués ensuite reçoivent les mêmes façades, une opération
 * chacun, en une seule annulation (Maj + clic retire un caisson choisi).
 */
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES, styleChange, type DoorStyle } from "../features/glass-door";
import { DECOR_LABELS } from "../features/door-decor";
import { decorRows } from "../sketcher/partition-door-style";
import { bodyInfo } from "../document/materials";
import { uniqueId, uniqueName } from "../document/operations";
import { cabinetStandard, frontsTo } from "../document/standards";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature } from "../document/types";
import { chooseBody, freshFeatureIds, removing } from "./curic-common";
import { frontMass } from "../document/hardware";
import { frontsHardware, frontsMaterials, frontsParts, GORGE, liftStay } from "../features/fronts-parts";
import { formatLength } from "../measurements/units";
import { PanelTool, type ToolContext } from "./panel-tool";
import { workshopStandards } from "./workshop/standards-panel";

export class FrontsTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private settings: Omit<FrontsFeature, "id" | "type" | "name">;
  /** The other cabinets clicked, each given the same fronts, a step made with this one. */
  private more: string[] = [];
  /** A cabinet clicked yet: the first click replaces the one chosen by default, the next ones add theirs. */
  private clicked = false;

  constructor(ctx: ToolContext, editing: FrontsFeature | null, onCabinet?: string) {
    super(ctx, "Façades", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "fr");
    this.name = editing?.name ?? uniqueName(doc, "Façades");
    const { id: _id, type: _type, name: _name, ...rest } = editing ?? ({} as FrontsFeature);
    this.settings = editing ? rest : { cabinet: onCabinet ?? this.cabinets().at(-1)?.id ?? "", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
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
    if (!this.settings.cabinet) return this.cabinets().length ? "Cliquez le caisson à habiller." : "Créez d'abord un caisson (Meuble › Caisson) ou une Répartition.";
    return { id: this.id, type: "fronts", name: this.name, ...this.settings };
  }

  /** The steps of the other cabinets chosen, ids after this one's. */
  private others(): { id: string; name: string }[] {
    const doc = this.docBefore();
    return freshFeatureIds({ ...doc, features: [...doc.features, { id: this.id, type: "fronts", name: this.name, ...this.settings }] }, "fr", "Façades", this.more.length);
  }

  protected override companions(): FrontsFeature[] {
    return this.others().map((n, i) => ({ id: n.id, type: "fronts", name: n.name, ...this.settings, cabinet: this.more[i]! }));
  }

  /** Parts without a material get the default one (the cabinet's for the fronts), so the cut list and quote are right. */
  protected override decorate(doc: CadDocument): CadDocument {
    const info = { ...doc.bodyInfo };
    for (const made of [this.id, ...this.others().map((n) => n.id)]) {
      const f = doc.features.find((x) => x.id === made);
      const cabinet = f?.type === "fronts" ? this.cabinets().find((c) => c.id === f.cabinet) : undefined;
      if (f?.type !== "fronts" || !cabinet) continue;
      frontsMaterials(f, cabinet, bodyInfo(doc, `${cabinet.id}${PART_SEPARATOR}0`).material).forEach((material, i) => {
        const id = `${made}${PART_SEPARATOR}${i}`;
        if (!info[id]?.material) info[id] = { ...info[id], material };
      });
    }
    return { ...doc, bodyInfo: info };
  }

  protected override blocker(): string | null {
    for (const id of [this.id, ...this.others().map((n) => n.id)]) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "Les façades sont impossibles.";
    }
    return null;
  }

  /** The cabinet a body is part of — one of its own, or of the fronts made for it — or null. */
  private cabinetOf(bodyId: string): string | null {
    const ids = [this.id, ...this.others().map((n) => n.id)];
    const at = ids.indexOf(featureOfBody(bodyId));
    if (at >= 0) return [this.settings.cabinet, ...this.more][at] ?? null;
    const f = this.ctx.doc().features.find((x) => x.id === featureOfBody(bodyId));
    return f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : null;
  }

  /** A cabinet clicked in the view: chosen (the first click), added (the next ones), or, Maj + clic, taken off. */
  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    const cabinet = face ? this.cabinetOf(face.bodyId) : null;
    if (!cabinet) return;
    const chosen = this.clicked || this.editing || this.more.length ? [this.settings.cabinet, ...this.more].filter(Boolean) : [];
    const next = chooseBody(chosen, cabinet, [], removing(event), !!this.editing);
    this.clicked = true;
    this.settings.cabinet = next[0] ?? "";
    this.more = next.slice(1);
    this.render();
    this.schedulePreview();
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    const cabinet = face ? this.cabinetOf(face.bodyId) : null;
    this.ctx.viewport.setHoverHighlight(cabinet ? { bodies: this.ctx.viewport.displayedBodies.filter((id) => featureOfBody(id) === cabinet) } : null);
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
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
    const glass = s.style === "glass";
    const gorge = s.grip === "gorge";
    // A lift-up door: what its stays are chosen from.
    const door = s.layout === "door" && s.side === "top" ? frontsParts(made, cabinet)[0] : undefined;
    const [high, mass] = door ? [door.to[2] - door.from[2], frontMass(doc, made, 0)] : [0, 0];
    const stay = door ? liftStay(high, mass) : null;
    const lift = door ? `Porte relevable de ${mass.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg, haute de ${formatLength(high, this.ctx.unit())} : facteur ${Math.round(high * mass)}${stay ? "" : " — plus qu'une paire de compas ne tient, voyez la fiche du fabricant"}.` : null;
    const names = [s.cabinet, ...this.more].map((id) => `« ${this.cabinets().find((c) => c.id === id)?.name ?? id} »`);
    return [
      this.more.length
        ? this.info(`${names.length} caissons : ${names.join(", ")}, les mêmes façades sur chacun. Cliquez-en d'autres pour les ajouter ; Maj + clic sur un caisson choisi le retire.`)
        : this.selectRow("Caisson", s.cabinet, this.cabinets().map((c): [string, string] => [c.id, c.name]), (v) => set("cabinet", v)),
      this.editing || this.more.length ? null : this.info("Ou cliquez le caisson dans la vue, puis d'autres l'un après l'autre : OK leur met à tous ces façades, en une seule annulation."),
      // Doors and drawers alike may be glazed: the style stays when one becomes the other.
      this.selectRow("Disposition", s.layout, [["door", "Une porte"], ["doors", "Deux portes"], ["drawers", "Tiroirs"]], (v) => {
        s.layout = v as FrontsFeature["layout"];
        changed();
      }),
      s.layout === "door" ? this.selectRow("Ouverture", s.side ?? "left", [["left", "Charnières à gauche"], ["right", "Charnières à droite"], ["top", "Relevable (charnières en haut)"], ["bottom", "Abattant (charnières en bas)"]], (v) => set("side", v as FrontsFeature["side"])) : null,
      s.layout === "drawers" ? this.numberRow("Tiroirs", s.drawers, "plain", (v) => set("drawers", Math.max(1, Math.min(8, Math.round(v))))) : null,
      // Doors: a drawer over them (the height of its front; 0: none), English drawers behind them (0: none).
      doors && !(s.side === "top" || s.side === "bottom") ? this.numberRow("Tiroir au-dessus (0 : sans)", s.topDrawer ?? 0, this.ctx.unit(), (v) => (v > 0 ? (s.topDrawer = v) : delete s.topDrawer, changed())) : null,
      doors ? this.numberRow("Tiroirs à l'anglaise (0 : sans)", s.innerDrawers ?? 0, "plain", (v) => (Math.round(v) > 0 ? (s.innerDrawers = Math.min(5, Math.round(v))) : delete s.innerDrawers, changed())) : null,
      this.selectRow("Pose", s.mount, [["overlay", "En applique (devant)"], ["inset", "Encastrées (dans l'ouverture)"]], (v) => set("mount", v as FrontsFeature["mount"])),
      this.numberRow("Jeu", s.gap, this.ctx.unit(), (v) => ((s.gap = Math.max(0, v)), this.schedulePreview())),
      this.numberRow("Épaisseur", s.thickness, this.ctx.unit(), (v) => ((s.thickness = Math.max(1, v)), this.schedulePreview())),
      // Plain, framed, fluted, slatted — or glazed (an aluminium frame round tempered glass), doors and drawers alike.
      this.selectRow(doors ? "Style des portes" : "Style des façades", s.style ?? "flat", [["flat", "Plate"], ["frame", "À cadre (panneau en retrait)"], ...DECOR_LABELS, ["glass", "Vitrée (cadre alu)"]], (v) => (Object.assign(s, styleChange(v as DoorStyle, s)), changed())),
      s.style === "frame" ? this.numberRow("Largeur du cadre", s.frameWidth ?? 70, this.ctx.unit(), (v) => ((s.frameWidth = v), this.schedulePreview())) : null,
      s.style === "frame" ? this.numberRow("Retrait du panneau", s.frameDepth ?? 6, this.ctx.unit(), (v) => ((s.frameDepth = v), this.schedulePreview())) : null,
      ...decorRows(s, (change) => (Object.assign(s, change), changed()), (label, mm, set) => this.numberRow(label, mm, this.ctx.unit(), set, label.startsWith("Bordure"))),
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
