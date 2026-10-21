/**
 * "Caisson" (furniture): a kitchen unit, wardrobe or cupboard from its outer
 * dimensions, with a preset to start from (kitchen base or wall unit, tall
 * unit, wardrobe, cupboard). Every part is a board of its own, computed live
 * by the kernel; a new cabinet is placed next to the existing ones. OK adds
 * the operation (one undo step); it is edited again from the timeline.
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { CabinetFeature, Vec3 } from "../document/types";
import { cabinetProblem } from "../features/cabinet-parts";
import { PanelTool, type ToolContext } from "./panel-tool";

type Settings = Omit<CabinetFeature, "id" | "type" | "name" | "origin" | "hidden" | "suppressed">;

const PRESETS: { id: string; label: string; settings: Settings }[] = [
  { id: "base", label: "Bas de cuisine 600 × 870 (socle 150)", settings: { width: 600, height: 870, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 150, construction: "sides-through" } },
  { id: "wall", label: "Haut de cuisine 600 × 700", settings: { width: 600, height: 700, depth: 350, thickness: 18, back: "applied", backThickness: 3, shelves: 2, plinth: 0, construction: "sides-through" } },
  { id: "tall", label: "Colonne 600 × 2200", settings: { width: 600, height: 2200, depth: 580, thickness: 18, back: "applied", backThickness: 3, shelves: 4, plinth: 150, construction: "sides-through" } },
  { id: "wardrobe", label: "Penderie 1000 × 2400", settings: { width: 1000, height: 2400, depth: 600, thickness: 19, back: "inset", backThickness: 8, shelves: 1, plinth: 80, construction: "sides-through" } },
  { id: "cupboard", label: "Placard 800 × 2000", settings: { width: 800, height: 2000, depth: 450, thickness: 18, back: "inset", backThickness: 8, shelves: 4, plinth: 0, construction: "sides-through" } },
];

/** Last settings used, kept for the next cabinet of the session. */
let last: Settings = { ...(PRESETS[0] as (typeof PRESETS)[number]).settings };

export class CabinetTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private settings: Settings;
  private origin: Vec3;

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
      this.settings = { ...last };
      this.origin = this.nextToOthers();
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

  protected feature(): CabinetFeature | string {
    const problem = cabinetProblem(this.settings);
    if (problem) return problem;
    return { id: this.id, type: "cabinet", name: this.name, origin: this.origin, ...this.settings };
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
    super.confirm();
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
    return [
      this.editing
        ? null
        : this.selectRow("Modèle", "", [["", "Choisir un modèle…"], ...PRESETS.map((p): [string, string] => [p.id, p.label])], (v) => {
            const preset = PRESETS.find((p) => p.id === v);
            if (preset) this.set({ ...preset.settings });
          }),
      length("Largeur", "width"),
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
      this.numberRow("Position X", this.origin[0], unit, (v) => moveTo(0, v), true),
      this.numberRow("Position Y", this.origin[1], unit, (v) => moveTo(1, v), true),
      this.numberRow("Position Z", this.origin[2], unit, (v) => moveTo(2, v), true),
      this.info("Chaque pièce (côtés, dessus, dessous, fond, étagères) est un corps. La position est le coin avant gauche en bas."),
    ];
  }
}
