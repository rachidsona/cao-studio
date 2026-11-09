/**
 * Outil « Implantation » : une cuisine entière le long d'un mur (I), de deux murs en angle (L) ou de trois (U), avec
 * un îlot si on veut, calculée par features/kitchen-layout.ts — meubles bas et hauts (des caissons ordinaires), leurs
 * façades, plan de travail découpé pour l'évier et la plaque, électroménager, crédence, plinthes, fileurs et murs.
 * Posée sur une Pièce relevée, elle en prend les murs (longueurs, plafond) et contourne portes, fenêtres, retombées
 * et rampants (features/room-runs.ts). Le panneau dit l'ergonomie : triangle d'activité, passage, plaque. Tout arrive
 * dans l'historique en une seule annulation et reste modifiable pièce par pièce.
 */
import { decorateKitchen, kitchenPlan, type KitchenRoom } from "../../document/kitchen-plan";
import { fromKitchenLayout, layoutProblems } from "../../document/layout-check";
import { MATERIALS } from "../../document/materials";
import type { CadDocument, Feature, RoomFeature } from "../../document/types";
import { KITCHEN, kitchenProblem, type KitchenSettings } from "../../features/kitchen-layout";
import { wallName } from "../../features/room-plan";
import { roomRuns } from "../../features/room-runs";
import { el } from "../../ui/dom";
import { PanelTool, type ToolContext } from "../panel-tool";

/** Kept for the session: the last kitchen set. */
let last: KitchenSettings = { ...KITCHEN, appliances: true, fridge: true, splashback: true, kick: true, corner: "dead", island: 0, passage: 1100 };

export class KitchenTool extends PanelTool {
  private readonly s: KitchenSettings = { ...last };
  private frontMaterial = "lacquer-white";
  private worktopMaterial = "solid-oak";
  /** The surveyed room and the wall of it that is the kitchen's wall A ("": the lengths typed here). */
  private roomWall = "";

  constructor(ctx: ToolContext) {
    super(ctx, "Implantation de cuisine", null);
    const room = this.rooms()[0];
    if (room) this.roomWall = `${room.id}:0`;
  }

  private rooms(): RoomFeature[] {
    return this.ctx.doc().features.filter((f): f is RoomFeature => f.type === "room" && !f.suppressed);
  }

  /** The room's walls the kitchen stands against, with the lengths and the ceiling copied into the settings. */
  private room(): KitchenRoom | string | null {
    if (!this.roomWall) return null;
    const [id, index] = this.roomWall.split(":");
    const room = this.rooms().find((r) => r.id === id);
    if (!room) return null;
    const runs = roomRuns(room, Number(index), this.s.layout);
    if (typeof runs === "string") return runs;
    this.s.lengthA = runs.walls.A!.length;
    if (runs.walls.B) this.s.lengthB = runs.walls.B.length;
    if (runs.walls.C) this.s.lengthC = runs.walls.C.length;
    this.s.wallHeight = room.height;
    return runs;
  }

  private problem(): string | null {
    const room = this.room();
    return typeof room === "string" ? room : kitchenProblem(this.s);
  }

  private plan() {
    const room = this.room();
    return kitchenPlan(this.ctx.doc(), this.s, this.frontMaterial, this.worktopMaterial, room && typeof room !== "string" ? room : undefined);
  }

  protected feature(): Feature | string {
    return this.problem() ?? this.plan().features[0] ?? "Rien à implanter.";
  }

  protected override companions(): Feature[] {
    return this.problem() ? [] : this.plan().features.slice(1);
  }

  /** Materials, names, and the walls and appliances on their layers (made when missing). */
  protected override decorate(doc: CadDocument): CadDocument {
    return this.problem() ? doc : decorateKitchen(doc, this.plan());
  }

  protected override blocker(): string | null {
    if (this.problem()) return null;
    const bad = this.plan().features.map((f) => this.ctx.status(f.id)).find((st) => st && st.state !== "ok");
    return bad ? (bad.message ?? "Cette implantation est impossible.") : null;
  }

  private set<K extends keyof KitchenSettings>(key: K, value: KitchenSettings[K]): void {
    this.s[key] = value;
    last = { ...this.s };
    this.render();
    this.schedulePreview();
  }

  private list(title: string, lines: string[], tone: "ok" | "warn" | "info"): HTMLElement | null {
    if (!lines.length) return null;
    const color = tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : tone === "warn" ? "text-amber-800 dark:text-amber-200" : "text-gray-600 dark:text-gray-300";
    return el("div", { class: `space-y-0.5 ${color}` }, el("p", { class: "font-semibold" }, title), ...lines.map((l) => el("p", {}, `• ${l}`)));
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const s = this.s;
    const len = (label: string, key: "lengthA" | "lengthB" | "lengthC" | "wallHeight" | "baseHeight" | "baseDepth" | "plinth" | "worktopThickness" | "island" | "passage") =>
      this.numberRow(label, s[key] ?? 0, unit, (v) => this.set(key, Math.max(0, v)));
    const problem = this.problem();
    const plan = problem ? null : this.plan();
    const units = plan?.layout.units ?? [];
    const base = units.filter((u) => !u.name.startsWith("Haut")).length;
    const materials = MATERIALS.filter((m) => m.id !== "hdf").map((m): [string, string] => [m.id, m.name]);
    const roomOptions: [string, string][] = [["", "Saisies ici"], ...this.rooms().flatMap((r) => r.walls.map((_, i): [string, string] => [`${r.id}:${i}`, `${r.name} : ${wallName(i)} en mur A`]))];
    const fromRoom = !!this.roomWall;
    const check = (label: string, key: "appliances" | "fridge" | "ovenColumn" | "splashback" | "kick") => this.checkRow(label, !!s[key], (v) => this.set(key, v));
    return [
      this.selectRow("Disposition", s.layout, [["I", "Un mur (I)"], ["L", "Deux murs en angle (L)"], ["U", "Trois murs (U)"]], (v) => this.set("layout", v as KitchenSettings["layout"])),
      roomOptions.length > 1 ? this.selectRow("Murs", this.roomWall, roomOptions, (v) => ((this.roomWall = v), this.render(), this.schedulePreview())) : null,
      fromRoom ? this.info(`Murs de la pièce : A ${Math.round(s.lengthA)} mm${s.layout !== "I" ? `, B ${Math.round(s.lengthB)} mm (le mur d'avant)` : ""}${s.layout === "U" ? `, C ${Math.round(s.lengthC ?? 0)} mm (le mur d'après)` : ""} ; plafond ${Math.round(s.wallHeight)} mm.`) : null,
      fromRoom ? null : len("Mur A", "lengthA"),
      fromRoom || s.layout === "I" ? null : len("Mur B", "lengthB"),
      fromRoom || s.layout !== "U" ? null : len("Mur C", "lengthC"),
      fromRoom ? null : len("Plafond", "wallHeight"),
      len("Hauteur des bas", "baseHeight"),
      len("Profondeur", "baseDepth"),
      len("Socle", "plinth"),
      len("Plan de travail", "worktopThickness"),
      s.layout === "I" ? null : this.selectRow("Angle", s.corner ?? "dead", [["dead", "Angle mort fermé (fileurs)"], ["unit", "Meuble d'angle (porte de 45 cm)"]], (v) => this.set("corner", v as KitchenSettings["corner"])),
      this.selectRow("Façades des bas", s.fronts, [["mixed", "Tiroirs et portes, en alternance"], ["drawers", "Tiroirs partout"], ["doors", "Portes partout"]], (v) => this.set("fronts", v as KitchenSettings["fronts"])),
      this.selectRow("Matière des façades", this.frontMaterial, materials, (v) => ((this.frontMaterial = v), this.schedulePreview())),
      this.selectRow("Plan de travail en", this.worktopMaterial, materials, (v) => ((this.worktopMaterial = v), this.schedulePreview())),
      this.checkRow("Meubles hauts au-dessus", s.wallUnits, (v) => this.set("wallUnits", v)),
      check("Électroménager (évier, lave-vaisselle, plaque, four, hotte)", "appliances"),
      s.appliances ? check("Colonne réfrigérateur", "fridge") : null,
      s.appliances ? check("Four en colonne (sinon sous la plaque)", "ovenColumn") : null,
      check("Crédence", "splashback"),
      check("Plinthes", "kick"),
      len("Îlot (0 : aucun)", "island"),
      s.island ? len("Passage devant l'îlot", "passage") : null,
      this.info(problem ?? `${base} meuble(s) bas et colonnes${s.wallUnits ? `, ${units.length - base} haut(s)` : ""}. Modules de 600 d'abord, puis le plus grand qui tient.${fromRoom ? "" : " Le mur A part de l'origine vers +X ; les meubles sont devant (Y < 0)."}`),
      plan ? this.list("Ergonomie", plan.layout.ergonomics.ok, "ok") : null,
      plan ? this.list("À revoir", [...plan.layout.ergonomics.warn, ...plan.problems, ...layoutProblems(fromKitchenLayout(plan.layout)).map((p) => p.message)], "warn") : null,
      plan ? this.list("La pièce", plan.layout.notes, "info") : null,
    ];
  }
}
