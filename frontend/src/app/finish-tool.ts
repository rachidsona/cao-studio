/**
 * « Finitions » (groupe Menuiserie) : habiller un meuble — les corps choisis, sinon tout le meuble affiché — de joues,
 * de fileurs jusqu'aux murs, d'un bandeau jusqu'au plafond et d'une plinthe sous son socle, ajustés à sa taille et à
 * la pièce (features/finish-parts.ts). Une opération « Finitions » dont chaque planche est un corps, de la matière du
 * meuble ; l'aperçu est en direct, OK la met dans l'historique, et elle se rouvre pour être retouchée. « Relevé de
 * chantier » prend ce qu'on a mesuré sur place (features/wall-survey.ts) : de combien chaque mur avance en bas, à
 * mi-hauteur et en haut, et au fond ; de combien le plafond descend à gauche, au milieu et à droite. Le fileur et le
 * bandeau sont alors recoupés à la demande, et le panneau dit quand le meuble ne rentre pas.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import { isHardwareBody } from "../document/hardware";
import { uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type CadDocument, type Feature, type TrimFeature } from "../document/types";
import { FINISH_DEFAULTS, finishParts, type Box, type FinishOptions } from "../features/finish-parts";
import { NO_CEILING, NO_WALL, type CeilingSurvey, type WallSurvey } from "../features/wall-survey";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

const FRONTS: [string, string][] = [
  ["1,-1", "Vers −Y (de face)"],
  ["1,1", "Vers +Y"],
  ["0,-1", "Vers −X"],
  ["0,1", "Vers +X"],
];

export class FinishTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private readonly source: string[];
  private o: FinishOptions;
  private notes: string[] = [];

  constructor(ctx: ToolContext, editing: TrimFeature | null, bodies: string[]) {
    super(ctx, "Finitions", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "fi");
    this.name = editing?.name ?? uniqueName(doc, "Finitions");
    this.o = structuredClone(editing?.settings ?? FINISH_DEFAULTS);
    // The furniture: the bodies chosen, else every displayed body but the room, the hardware and these finishings.
    const own = (id: string) => featureOfBody(id) === this.id;
    this.source = editing?.source ?? (bodies.length ? bodies : ctx.viewport.displayedBodies.filter((id) => !own(id) && !bodyInfo(doc, id).room && !isHardwareBody(doc, id)));
  }

  private boxOf(id: string): Box | null {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]], [...b[1]]] : null;
  }

  protected feature(): Feature | string {
    const doc = this.ctx.doc();
    const boxes = (ids: string[]) => ids.map((id) => this.boxOf(id)).filter((b): b is Box => b !== null);
    const furniture = boxes(this.source);
    const walls = boxes(this.ctx.viewport.displayedBodies.filter((id) => bodyInfo(doc, id).room && !bodyInfo(doc, id).light));
    if (!furniture.length) return "Aucun meuble affiché à habiller : sélectionnez ses corps.";
    const { parts, notes } = finishParts(furniture, walls, this.o);
    this.notes = notes;
    if (!parts.length) return notes[0] ?? "Rien à ajouter avec ces réglages.";
    return { id: this.id, type: "trim", name: this.name, parts, source: this.source, settings: structuredClone(this.o) } satisfies TrimFeature;
  }

  /** The boards are of the furniture's material (its first body that has one), unless given one already. */
  protected override decorate(doc: CadDocument): CadDocument {
    const material = this.source.map((id) => bodyInfo(doc, id).material).find(Boolean);
    const f = doc.features.find((x) => x.id === this.id);
    if (!material || f?.type !== "trim") return doc;
    const bare = f.parts.flatMap((p, i) => (p.hardware ? [] : [`${this.id}#${i}`])).filter((id) => !bodyInfo(doc, id).material);
    return bare.length ? setBodyInfo(doc, bare, { material }) : doc;
  }

  private set(change: (o: FinishOptions) => void): void {
    change(this.o);
    this.render();
    this.schedulePreview();
  }

  /** The rows of what was measured on site: each wall at three heights and at the back, the ceiling at three places. */
  private surveyRows(): HTMLElement[] {
    const unit = this.ctx.unit();
    const s = this.o.survey;
    if (!s) return [];
    const wall = (side: "left" | "right", name: string): HTMLElement[] => {
      const w = s[side] ?? NO_WALL;
      const row = (label: string, key: keyof WallSurvey) => this.numberRow(`${name} — ${label}`, w[key], unit, (v) => this.set((x) => (x.survey = { ...x.survey, [side]: { ...NO_WALL, ...x.survey?.[side], [key]: v } })), true);
      return [row("en bas", "low"), row("à mi-hauteur", "mid"), row("en haut", "high"), row("au fond (hors d'équerre)", "back")];
    };
    const c = s.ceiling ?? NO_CEILING;
    const top = (label: string, key: keyof CeilingSurvey) => this.numberRow(`Plafond — ${label}`, c[key], unit, (v) => this.set((x) => (x.survey = { ...x.survey, ceiling: { ...NO_CEILING, ...x.survey?.ceiling, [key]: v } })), true);
    return [
      this.info("De combien le mur avance vers le meuble, par rapport au mur dessiné (négatif : il s'écarte) ; de combien le plafond descend (négatif : il remonte)."),
      ...wall("left", "Mur gauche"),
      ...wall("right", "Mur droit"),
      top("à gauche", "left"),
      top("au milieu", "mid"),
      top("à droite", "right"),
    ];
  }

  /** A line of the panel: what does not fit stands out. */
  private note(text: string): HTMLElement {
    return /ne rentre pas|ne passe pas/.test(text) ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", "data-survey-problem": "" }, text) : this.info(text);
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const o = this.o;
    const built = this.feature();
    const count = typeof built === "string" ? 0 : (built as TrimFeature).parts.length;
    return [
      this.info(`${this.source.length} corps du meuble. ${count ? `${count} planche${count > 1 ? "s" : ""} de finition.` : ""}`),
      this.selectRow("Face avant", `${o.front.axis},${o.front.sign}`, FRONTS, (v) => this.set((x) => {
        const [axis, sign] = v.split(",").map(Number) as [0 | 1, -1 | 1];
        x.front = { axis, sign };
      })),
      this.numberRow("Épaisseur des planches", o.thickness, unit, (v) => v > 0 && this.set((x) => (x.thickness = v))),
      this.checkRow("Joue gauche", o.ends.left, (v) => this.set((x) => (x.ends.left = v))),
      this.checkRow("Joue droite", o.ends.right, (v) => this.set((x) => (x.ends.right = v))),
      o.ends.left || o.ends.right ? this.numberRow("Dépassement des joues en haut", o.ends.above, unit, (v) => v >= 0 && this.set((x) => (x.ends.above = v))) : null,
      this.checkRow("Fileurs jusqu'aux murs", o.fillers.on, (v) => this.set((x) => (x.fillers.on = v))),
      o.fillers.on ? this.numberRow("Écart maximal d'un fileur", o.fillers.max, unit, (v) => v > 0 && this.set((x) => (x.fillers.max = v))) : null,
      this.checkRow("Relevé de chantier (faux aplomb, hors d'équerre, plafond)", !!o.survey, (v) => this.set((x) => (v ? (x.survey = {}) : delete x.survey))),
      ...this.surveyRows(),
      this.checkRow("Bandeau haut (jusqu'au plafond s'il y en a un)", o.cornice.on, (v) => this.set((x) => (x.cornice.on = v))),
      o.cornice.on ? this.numberRow("Hauteur du bandeau sans plafond", o.cornice.height, unit, (v) => v > 0 && this.set((x) => (x.cornice.height = v))) : null,
      this.checkRow("Plinthe (sous un socle)", o.plinth.on, (v) => this.set((x) => (x.plinth.on = v))),
      o.plinth.on ? this.numberRow("Hauteur de plinthe", o.plinth.height, unit, (v) => v > 0 && this.set((x) => (x.plinth.height = v))) : null,
      o.plinth.on ? this.numberRow("Retrait de la plinthe", o.plinth.recess, unit, (v) => v >= 0 && this.set((x) => (x.plinth.recess = v))) : null,
      this.checkRow("Pieds réglables (sous le socle)", !!o.feet?.on, (v) => this.set((x) => (x.feet = { on: v }))),
      ...this.notes.map((n) => this.note(n)),
      this.info("Les murs et le plafond sont ceux de la Pièce relevée, de l'Implantation de cuisine ou de l'Assistant Dressing. Gauche et droite sont vus de devant."),
    ];
  }

  /** Opens the panel with its preview. */
  open(): void {
    this.start();
    this.schedulePreview();
  }
}
