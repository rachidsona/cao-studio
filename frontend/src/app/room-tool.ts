/**
 * « Pièce » (groupe Menuiserie) : le relevé de la pièce — chaque mur par sa longueur et l'angle de chaque coin (une
 * pièce pas d'équerre se relève telle qu'elle est), la hauteur sous plafond, l'épaisseur des murs — puis ce qui gêne :
 * fenêtres et portes percées dans les murs, prises, retombées de plafond et rampants. Une opération « Pièce » dont
 * chaque mur et chaque obstacle est un corps « pièce » (hors liste de débit) ; les Finitions s'ajustent à ses murs et
 * à son plafond, et le Contrôle signale le meuble qui la heurte ou cache une prise (features/room-plan.ts). « Murs pas
 * d'aplomb » prend le relevé de chantier de chaque mur — de combien sa face avance à mi-hauteur et en haut — : le mur
 * penche dans la vue, et les Finitions de tout meuble contre lui en recoupent le fileur ou la joue. « Coller un relevé »
 * remplit les murs d'après les mesures d'un télémètre laser collées telles quelles (features/room-survey.ts).
 */
import { setBodyInfo } from "../document/materials";
import { uniqueId, uniqueName } from "../document/operations";
import type { CadDocument, Feature, RoomFeature } from "../document/types";
import { closingGap, roomPieces, WALL_NAMES, type Obstacle, type RoomInput } from "../features/room-plan";
import { parseSurvey } from "../features/room-survey";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

const DEFAULT_ROOM: RoomInput = {
  walls: [
    { length: 3000, angle: 90 },
    { length: 2500, angle: 90 },
    { length: 3000, angle: 90 },
    { length: 2500, angle: 90 },
  ],
  height: 2500,
  thickness: 200,
  obstacles: [],
};

const NEW: Record<Obstacle["kind"], (wall: number) => Obstacle> = {
  window: (wall) => ({ kind: "window", wall, at: 800, width: 1200, height: 1350, sill: 900 }),
  door: (wall) => ({ kind: "door", wall, at: 200, width: 830, height: 2040 }),
  socket: (wall) => ({ kind: "socket", wall, at: 500, height: 300 }),
  beam: (wall) => ({ kind: "beam", wall, depth: 300, drop: 250 }),
  slope: (wall) => ({ kind: "slope", wall, knee: 1000, depth: 1500 }),
};
const KIND_NAMES: Record<Obstacle["kind"], string> = { window: "Fenêtre", door: "Porte", socket: "Prise", beam: "Retombée", slope: "Rampant" };
/** The fields of each obstacle, with their label. */
const FIELDS: Record<Obstacle["kind"], [string, string][]> = {
  window: [["at", "Depuis le début du mur"], ["width", "Largeur"], ["height", "Hauteur"], ["sill", "Allège (hauteur du bas)"]],
  door: [["at", "Depuis le début du mur"], ["width", "Largeur"], ["height", "Hauteur"]],
  socket: [["at", "Depuis le début du mur"], ["height", "Hauteur"]],
  beam: [["depth", "Avancée dans la pièce"], ["drop", "Retombée sous le plafond"]],
  slope: [["knee", "Hauteur au mur"], ["depth", "Distance jusqu'au plafond"]],
};

export class RoomTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private room: RoomInput;
  /** « Murs pas d'aplomb »: the rows of each wall's out of plumb are shown. */
  private plumb: boolean;
  /** « Coller un relevé »: the field where a laser meter's measures are pasted is shown. */
  private pasting = false;

  constructor(ctx: ToolContext, editing: RoomFeature | null) {
    super(ctx, "Pièce", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "pc");
    this.name = editing?.name ?? uniqueName(doc, "Pièce");
    this.room = structuredClone(editing ? { walls: editing.walls, height: editing.height, thickness: editing.thickness, obstacles: editing.obstacles } : DEFAULT_ROOM);
    this.plumb = this.room.walls.some((w) => w.plumb);
  }

  protected feature(): Feature | string {
    if (!this.room.walls.length) return "Ajoutez au moins un mur.";
    return { id: this.id, type: "room", name: this.name, ...structuredClone(this.room) } satisfies RoomFeature;
  }

  /** Every body of the room is part of the room: out of the cut list, the quote and the machining files. */
  protected override decorate(doc: CadDocument): CadDocument {
    const count = roomPieces(this.room).pieces.length;
    return setBodyInfo(doc, Array.from({ length: count }, (_, i) => `${this.id}#${i}`), { room: true });
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const r = this.room;
    const small = "h-7 border border-gray-300 px-2 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
    const button = (label: string, run: () => void) => {
      const b = el("button", { type: "button", class: small }, label);
      b.addEventListener("click", run);
      return b;
    };
    // Out of plumb: how far its face comes into the room at mid-height and at the top (0 and 0: none kept).
    const lean = (w: RoomInput["walls"][number], key: "mid" | "high", v: number) => {
      const next = { mid: 0, high: 0, ...w.plumb, [key]: v };
      if (Math.abs(next.mid) < 1e-9 && Math.abs(next.high) < 1e-9) delete w.plumb;
      else w.plumb = next;
      this.changed();
    };
    const walls = r.walls.flatMap((w, i) => [
      this.numberRow(`Mur ${WALL_NAMES[i] ?? i + 1} : longueur`, w.length, unit, (v) => v > 0 && ((w.length = v), this.changed())),
      i < r.walls.length - 1 || r.walls.length >= 3
        ? this.numberRow(`Angle ${WALL_NAMES[i] ?? i + 1}/${WALL_NAMES[(i + 1) % r.walls.length] ?? i + 2} (90 : d'équerre)`, w.angle, "deg", (v) => v > 0 && v < 360 && ((w.angle = v), this.changed()))
        : null,
      ...(this.plumb
        ? [
            this.numberRow(`Mur ${WALL_NAMES[i] ?? i + 1} : avance à mi-hauteur`, w.plumb?.mid ?? 0, unit, (v) => lean(w, "mid", v), true),
            this.numberRow(`Mur ${WALL_NAMES[i] ?? i + 1} : avance en haut`, w.plumb?.high ?? 0, unit, (v) => lean(w, "high", v), true),
          ]
        : []),
    ]);
    const gap = r.walls.length >= 3 ? closingGap(r) : 0;
    const wallOptions: [string, string][] = r.walls.map((_, i) => [String(i), `Mur ${WALL_NAMES[i] ?? i + 1}`]);
    const obstacles = r.obstacles.flatMap((o, k) => [
      el("div", { class: "flex items-center justify-between pt-1 font-medium" }, `${KIND_NAMES[o.kind]} ${k + 1}`, button("✕", () => ((r.obstacles = r.obstacles.filter((x) => x !== o)), this.changed()))),
      this.selectRow("Sur le mur", String(o.wall), wallOptions, (v) => ((o.wall = Number(v)), this.changed())),
      ...FIELDS[o.kind].map(([key, label]) => this.numberRow(label, (o as unknown as Record<string, number>)[key]!, unit, (v) => v >= 0 && (((o as unknown as Record<string, number>)[key] = v), this.changed()))),
    ]);
    return [
      this.info("Le mur A part de l'origine vers +X, la pièce à sa droite (vers −Y) ; les murs suivants tournent à droite de l'angle relevé."),
      this.numberRow("Hauteur sous plafond", r.height, unit, (v) => v > 0 && ((r.height = v), this.changed())),
      this.numberRow("Épaisseur des murs", r.thickness, unit, (v) => v > 0 && ((r.thickness = v), this.changed())),
      this.checkRow("Murs pas d'aplomb (relevé de chantier)", this.plumb, (v) => {
        this.plumb = v;
        if (!v) for (const w of r.walls) delete w.plumb;
        this.changed();
      }),
      this.plumb ? this.info("De combien la face de chaque mur avance dans la pièce, à mi-hauteur et en haut, par rapport au pied du mur (négatif : il penche en arrière). Les Finitions recoupent fileurs et joues contre lui.") : null,
      ...walls,
      this.pasting ? this.survey() : null,
      el("div", { class: "flex gap-1" }, this.pasting ? null : button("Coller un relevé…", () => ((this.pasting = true), this.render())), button("+ Mur", () => ((r.walls = [...r.walls, { length: 2000, angle: 90 }]), this.changed())), r.walls.length > 1 ? button("− Dernier mur", () => ((r.walls = r.walls.slice(0, -1)), (r.obstacles = r.obstacles.filter((o) => o.wall < r.walls.length)), this.changed())) : null),
      gap > 1 ? this.info(`La pièce ne se ferme pas : ${Math.round(gap)} mm entre la fin du dernier mur et le début du premier. Vérifiez les longueurs et les angles relevés.`) : null,
      el("div", { class: "flex flex-wrap gap-1 pt-1" }, ...(Object.keys(NEW) as Obstacle["kind"][]).map((kind) => button(`+ ${KIND_NAMES[kind]}`, () => ((r.obstacles = [...r.obstacles, NEW[kind](0)]), this.changed())))),
      ...obstacles,
    ];
  }

  /** The measures of a laser meter pasted (text or CSV of its app): the walls replaced by them, their openings kept. */
  private survey(): HTMLElement {
    const field = el("textarea", { rows: "5", class: "w-full border border-gray-300 bg-white p-1.5 font-mono text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Relevé collé", "data-room-survey": "", placeholder: "Un mur par ligne : longueur, puis l'angle du coin\n3,452 m\n2,498 m 91,5°\n…" });
    field.addEventListener("keydown", (event) => event.stopPropagation());
    const take = el("button", { type: "button", class: "h-7 flex-1 btn-accent text-xs font-medium" }, "Remplacer les murs");
    take.addEventListener("click", () => {
      const walls = parseSurvey(field.value);
      if (typeof walls === "string") return this.ctx.notify(walls, "error");
      this.room.walls = walls;
      this.room.obstacles = this.room.obstacles.filter((o) => o.wall < walls.length);
      this.pasting = false;
      this.ctx.notify(`${walls.length} mur(s) repris du relevé.`, "success");
      this.changed();
    });
    const cancel = el("button", { type: "button", class: "h-7 flex-1 border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Annuler");
    cancel.addEventListener("click", () => ((this.pasting = false), this.render()));
    return el("div", { class: "space-y-1 border border-sky-200 p-1.5 dark:border-sky-900" }, el("p", { class: "text-gray-600 dark:text-gray-300" }, "Collez le relevé du télémètre (texte ou CSV de son application) : mètres, centimètres ou millimètres, l'angle de chaque coin s'il est mesuré (90° sinon)."), field, el("div", { class: "flex gap-1" }, cancel, take));
  }

  /** A project has its room: after OK the tool closes, rather than proposing a second room over the first. */
  protected override again(): void {
    this.close();
    void this.ctx.preview(null);
  }

  /** Opens the panel with its preview. */
  open(): void {
    this.start();
    this.schedulePreview();
  }
}
