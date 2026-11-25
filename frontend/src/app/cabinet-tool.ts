/**
 * "Caisson" (furniture): a kitchen unit, wardrobe or cupboard from its outer
 * dimensions, with a preset to start from (kitchen base or wall unit, tall
 * unit, wardrobe, cupboard). Every part is a board of its own, computed live
 * by the kernel; a new cabinet is placed next to the existing ones. It follows
 * the project's construction standard (document/standards.ts), another one, or
 * none (set by hand). A new cabinet can come with its doors (« Portes » : plain, or glazed — an aluminium frame round
 * the glass chosen, black glass in a black frame for the « Vitrine » model): its Façades are made with it, one door
 * up to 600 mm wide, two beyond, and changed afterwards with the Façades tool. OK adds the operation (one undo step);
 * it is edited again from the timeline.
 */
import { cabinetKeptClear } from "../document/cabinet-clear";
import { bodyInfo, setBodyInfo } from "../document/materials";
import { uniqueId, uniqueName } from "../document/operations";
import { cabinetStandard, cabinetTo, findStandard, frontsTo } from "../document/standards";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature, type GlassKind, type ProfileFinish, type Vec3 } from "../document/types";
import { cabinetPartNames, cabinetProblem } from "../features/cabinet-parts";
import { frontsMaterials } from "../features/fronts-parts";
import { GLASS_FRAME, GLASS_KINDS, PROFILE_FINISHES } from "../features/glass-door";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";
import { allStandards, workshopStandards } from "./workshop/standards-panel";

type Settings = Omit<CabinetFeature, "id" | "type" | "name" | "origin" | "hidden" | "suppressed">;
/** The doors a new cabinet comes with: none, plain boards, or glazed (the glass and the finish of its aluminium frame). */
type Doors = { kind: "none" | "flat" | "glass"; glass: GlassKind; profile: ProfileFinish };
/** A cabinet up to this wide (mm) has one door, a wider one two. */
const ONE_DOOR = 600;

const PRESETS: { id: string; label: string; settings: Settings; doors?: Doors }[] = [
  { id: "base", label: "Bas de cuisine 600 × 870 (socle 150)", settings: { width: 600, height: 870, depth: 580, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" } },
  { id: "wall", label: "Haut de cuisine 600 × 700", settings: { width: 600, height: 700, depth: 350, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" } },
  { id: "tall", label: "Colonne 600 × 2200", settings: { width: 600, height: 2200, depth: 580, thickness: 18, back: "applied", backThickness: 3, shelves: 4, plinth: 150, construction: "sides-through" } },
  { id: "wardrobe", label: "Penderie 1000 × 2400", settings: { width: 1000, height: 2400, depth: 600, thickness: 19, back: "inset", backThickness: 8, shelves: 1, plinth: 80, construction: "sides-through" } },
  { id: "cupboard", label: "Placard 800 × 2000", settings: { width: 800, height: 2000, depth: 450, thickness: 18, back: "inset", backThickness: 8, shelves: 4, plinth: 0, construction: "sides-through" } },
  { id: "showcase-black", label: "Vitrine à portes en verre noir 800 × 2000", settings: { width: 800, height: 2000, depth: 400, thickness: 18, back: "inset", backThickness: 8, shelves: 4, plinth: 80, construction: "sides-through" }, doors: { kind: "glass", glass: "black", profile: "black" } },
  { id: "wall-black", label: "Haut vitré en verre noir 600 × 700", settings: { width: 600, height: 700, depth: 350, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" }, doors: { kind: "glass", glass: "black", profile: "black" } },
];

/** Last settings used, kept for the next cabinet of the session; and its doors. */
let last: Settings = { ...(PRESETS[0] as (typeof PRESETS)[number]).settings };
let lastDoors: Doors = { kind: "none", glass: "clear", profile: "brushed" };

export class CabinetTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private settings: Settings;
  private origin: Vec3;
  /** « Remplir une largeur » (Mozaik's AutoFill): `total` mm made of equal cabinets at most `max` wide. */
  private fill = { on: false, total: 2400, max: 600 };
  /** The doors made with a new cabinet. */
  private doors: Doors = { ...lastDoors };

  constructor(ctx: ToolContext, editing: CabinetFeature | null) {
    super(ctx, "Caisson", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "cb");
    this.name = editing?.name ?? uniqueName(doc, "Caisson");
    if (editing) {
      const { id: _id, type: _type, name: _name, origin, hidden: _h, suppressed: _s, ...settings } = editing;
      this.settings = settings;
      this.origin = [...origin];
    } else {
      const { standard: _own, ...rest } = last;
      this.settings = rest;
      this.origin = this.nextToOthers();
      this.follow();
    }
  }

  /** The settings made to the standard the cabinet follows (the project's when it has none of its own). */
  private follow(): void {
    const s = cabinetStandard(this.ctx.doc(), { id: this.id, type: "cabinet", name: this.name, origin: this.origin, ...this.settings }, workshopStandards());
    if (s) {
      const { id: _i, type: _t, name: _n, origin: _o, ...made } = cabinetTo({ id: this.id, type: "cabinet", name: this.name, origin: this.origin, ...this.settings }, s);
      this.settings = made;
    }
  }

  /** A new cabinet goes to the right of the bodies already there, on the same floor and front line. */
  private nextToOthers(): Vec3 {
    const boxes = this.ctx
      .bodies()
      .map((b) => this.ctx.viewport.bodyMesh(b.id)?.metrics.bbox)
      .filter((b): b is NonNullable<typeof b> => !!b);
    if (boxes.length === 0) return [0, 0, 0];
    const round = (v: number) => Number(v.toFixed(3));
    return [round(Math.max(...boxes.map((b) => b[1][0]))), round(Math.min(...boxes.map((b) => b[0][1]))), round(Math.min(...boxes.map((b) => b[0][2])))];
  }

  /** How many cabinets fill the width, and the width of each. */
  private filling(): { count: number; width: number } | null {
    if (!this.fill.on || this.editing || !(this.fill.total > 0) || !(this.fill.max > 0)) return null;
    const count = Math.max(1, Math.ceil(this.fill.total / this.fill.max - 1e-9));
    return { count, width: Number((this.fill.total / count).toFixed(3)) };
  }

  protected feature(): CabinetFeature | string {
    const fill = this.filling();
    const settings = fill ? { ...this.settings, width: fill.width } : this.settings;
    const problem = cabinetProblem(settings);
    if (problem) return problem;
    const made: CabinetFeature = { id: this.id, type: "cabinet", name: this.name, origin: this.origin, ...settings };
    // A cabinet changed by hand: wider or deeper against a wall or a neighbour, slid flush — or refused, with why.
    return this.editing ? cabinetKeptClear(this.docBefore(), made) : made;
  }

  /** The other cabinets of the filled width, side by side along the width (turned with the cabinet). */
  private others(first: CabinetFeature): CabinetFeature[] {
    const fill = this.filling();
    if (!fill || fill.count < 2) return [];
    const step: Vec3 = ({ 0: [1, 0, 0], 90: [0, 1, 0], 180: [-1, 0, 0], 270: [0, -1, 0] } as const)[first.rotation ?? 0] as Vec3;
    const slots = freshFeatureIds(this.docBefore(), "cb", "Caisson", fill.count).slice(1);
    return slots.map((slot, i) => ({ ...first, id: slot.id, name: slot.name, origin: first.origin.map((v, k) => Number((v + step[k]! * fill.width * (i + 1)).toFixed(3))) as Vec3 }));
  }

  /** The doors of each new cabinet: its Façades, to its standard — one door up to 600 mm wide, two beyond. */
  private fronts(cabinets: readonly CabinetFeature[]): FrontsFeature[] {
    if (this.editing || this.doors.kind === "none") return [];
    // The document before this use of the tool: the same names however often it stores.
    const doc = this.docBefore();
    return freshFeatureIds(doc, "fr", "Façades", cabinets.length).map((slot, i) => {
      const cabinet = cabinets[i]!;
      const plain: FrontsFeature = { ...slot, type: "fronts", cabinet: cabinet.id, layout: cabinet.width > ONE_DOOR ? "doors" : "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
      const standard = cabinetStandard(doc, cabinet, workshopStandards());
      const made = standard ? frontsTo(plain, standard) : plain;
      return this.doors.kind === "glass" ? { ...made, style: "glass", frameWidth: GLASS_FRAME, glass: this.doors.glass, profile: this.doors.profile } : made;
    });
  }

  /** The other cabinets of a filled width, then the doors of them all. */
  protected override companions(): Feature[] {
    const first = this.feature();
    if (typeof first === "string") return [];
    const others = this.others(first);
    return [...others, ...this.fronts([first, ...others])];
  }

  /**
   * A top changed into rails: the back rail, a body more, in the same material as the carcass. The doors made with
   * the cabinet: their boards in its material, so the cut list and the quote are right.
   */
  protected override decorate(doc: CadDocument): CadDocument {
    const made = this.feature();
    if (typeof made === "string") return doc;
    const rear = cabinetPartNames(made).indexOf("Traverse arrière");
    const carcass = bodyInfo(doc, `${made.id}${PART_SEPARATOR}0`).material;
    const id = `${made.id}${PART_SEPARATOR}${rear}`;
    const railed = rear >= 0 && carcass && !bodyInfo(doc, id).material ? setBodyInfo(doc, [id], { material: carcass }) : doc;
    const info = { ...railed.bodyInfo };
    for (const fronts of this.fronts([made, ...this.others(made)])) {
      const cabinet = railed.features.find((f): f is CabinetFeature => f.id === fronts.cabinet && f.type === "cabinet");
      frontsMaterials(fronts, cabinet, carcass ?? undefined).forEach((material, i) => {
        const body = `${fronts.id}${PART_SEPARATOR}${i}`;
        if (!info[body]?.material) info[body] = { ...info[body], material };
      });
    }
    return { ...railed, bodyInfo: info };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Le caisson est invalide.") : null;
  }

  override confirm(): void {
    const reason = this.blocker();
    if (reason) {
      this.ctx.notify(reason, "error");
      return;
    }
    last = { ...this.settings };
    if (!this.editing) lastDoors = { ...this.doors };
    super.confirm();
  }

  private setDoors(update: Partial<Doors>): void {
    this.doors = { ...this.doors, ...update };
    this.render();
    this.schedulePreview();
  }

  private set(update: Partial<Settings>): void {
    this.settings = { ...this.settings, ...update };
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const s = this.settings;
    const length = (label: string, key: "width" | "height" | "depth" | "thickness" | "backThickness") =>
      this.numberRow(label, s[key], unit, (v) => this.set({ [key]: v } as Partial<Settings>));
    const moveTo = (i: 0 | 1 | 2, v: number) => {
      this.origin = this.origin.map((x, k) => (k === i ? v : x)) as Vec3;
      this.render();
      this.schedulePreview();
    };
    const doc = this.ctx.doc();
    const project = findStandard(doc, doc.standard, workshopStandards());
    return [
      this.selectRow(
        "Standard",
        s.standard ?? "",
        [["", project ? `Celui du projet (${project.name})` : "Celui du projet (aucun)"], ["none", "Aucun : réglé à la main"], ...allStandards(doc.standards).map((x): [string, string] => [x.id, x.name])],
        (v) => {
          const { standard: _old, ...rest } = this.settings;
          this.settings = v ? { ...rest, standard: v } : rest;
          this.follow();
          this.render();
          this.schedulePreview();
        },
      ),
      this.editing
        ? null
        : this.selectRow("Modèle", "", [["", "Choisir un modèle…"], ...PRESETS.map((p): [string, string] => [p.id, p.label])], (v) => {
            const preset = PRESETS.find((p) => p.id === v);
            if (preset?.doors) this.doors = { ...preset.doors };
            if (preset) this.set({ ...preset.settings });
          }),
      this.editing ? null : this.checkRow("Remplir une largeur (caissons égaux)", this.fill.on, (v) => ((this.fill.on = v), this.render(), this.schedulePreview())),
      this.fill.on && !this.editing ? this.numberRow("Largeur à remplir", this.fill.total, unit, (v) => ((this.fill.total = Math.max(1, v)), this.render(), this.schedulePreview())) : null,
      this.fill.on && !this.editing ? this.numberRow("Largeur max", this.fill.max, unit, (v) => ((this.fill.max = Math.max(1, v)), this.render(), this.schedulePreview())) : null,
      this.fill.on && !this.editing ? this.info(`${this.filling()?.count ?? 1} caisson(s) de ${this.filling()?.width ?? s.width} mm.`) : length("Largeur", "width"),
      length("Hauteur", "height"),
      length("Profondeur", "depth"),
      length("Épaisseur", "thickness"),
      this.numberRow("Socle", s.plinth, unit, (v) => this.set({ plinth: Math.max(0, v) }), true),
      this.selectRow("Étagères", String(s.shelves), Array.from({ length: 11 }, (_, n): [string, string] => [String(n), n === 0 ? "Aucune" : String(n)]), (v) =>
        this.set({ shelves: Number(v) }),
      ),
      this.selectRow(
        "Fond",
        s.back,
        [
          ["applied", "Vissé derrière"],
          ["inset", "Encastré entre les côtés"],
          ["none", "Sans fond"],
        ],
        (v) => this.set({ back: v as Settings["back"] }),
      ),
      s.back === "none" ? null : length("Ép. du fond", "backThickness"),
      this.selectRow(
        "Construction",
        s.construction,
        [
          ["sides-through", "Côtés toute hauteur"],
          ["top-bottom-through", "Dessus et dessous toute largeur"],
        ],
        (v) => this.set({ construction: v as Settings["construction"] }),
      ),
      this.selectRow(
        "Haut du caisson",
        s.top ?? "panel",
        [
          ["panel", "Dessus plein"],
          ["rails", "Deux traverses (évier)"],
        ],
        (v) => this.set({ top: v as NonNullable<Settings["top"]> }),
      ),
      // Two rails: the front one lying flat, or standing on its edge as the back one.
      s.top === "rails" ? this.selectRow("Traverse avant", s.railFront ?? "flat", [["flat", "Couchée"], ["edge", "Debout (sur chant)"]], (v) => this.set({ railFront: v === "edge" ? "edge" : undefined })) : null,
      // A new cabinet with its doors: its Façades are made with it.
      this.editing ? null : this.selectRow("Portes", this.doors.kind, [["none", "Sans portes"], ["flat", "Pleines"], ["glass", "Vitrées (cadre alu)"]], (v) => this.setDoors({ kind: v as Doors["kind"] })),
      !this.editing && this.doors.kind === "glass" ? this.selectRow("Verre (trempé 4 mm)", this.doors.glass, [...GLASS_KINDS], (v) => this.setDoors({ glass: v as GlassKind })) : null,
      !this.editing && this.doors.kind === "glass" ? this.selectRow("Cadre", this.doors.profile, [...PROFILE_FINISHES], (v) => this.setDoors({ profile: v as ProfileFinish })) : null,
      this.selectRow(
        "Orientation",
        String(s.rotation ?? 0),
        [
          ["0", "Face vers l'avant (−Y)"],
          ["90", "Face vers la droite (+X)"],
          ["180", "Face vers le fond (+Y)"],
          ["270", "Face vers la gauche (−X)"],
        ],
        (v) => this.set({ rotation: Number(v) as NonNullable<Settings["rotation"]> }),
      ),
      this.numberRow("Position X", this.origin[0], unit, (v) => moveTo(0, v), true),
      this.numberRow("Position Y", this.origin[1], unit, (v) => moveTo(1, v), true),
      this.numberRow("Position Z", this.origin[2], unit, (v) => moveTo(2, v), true),
      this.info(`Chaque pièce (côtés, dessus ou traverses, dessous, fond, étagères) est un corps. La position est le coin avant gauche en bas ; le caisson tourne autour de ce coin.${this.editing ? "" : " Les portes se règlent ensuite avec l'outil Façades."}`),
    ];
  }
}
