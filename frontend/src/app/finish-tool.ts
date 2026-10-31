/**
 * « Finitions » (groupe Menuiserie) : habiller un meuble — les corps choisis, sinon tout le meuble affiché — de joues,
 * de fileurs jusqu'aux murs, d'un bandeau jusqu'au plafond et d'une plinthe sous son socle, ajustés à sa taille et à
 * la pièce (features/finish-parts.ts). Une opération « Finitions » dont chaque planche est un corps, de la matière du
 * meuble ; l'aperçu est en direct, OK la met dans l'historique, et elle se rouvre pour être retouchée.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import { isHardwareBody } from "../document/hardware";
import { uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type CadDocument, type Feature, type TrimFeature } from "../document/types";
import { FINISH_DEFAULTS, finishParts, type Box, type FinishOptions } from "../features/finish-parts";
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
    const walls = boxes(this.ctx.viewport.displayedBodies.filter((id) => bodyInfo(doc, id).room));
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
    const bare = f.parts.map((_, i) => `${this.id}#${i}`).filter((id) => !bodyInfo(doc, id).material);
    return bare.length ? setBodyInfo(doc, bare, { material }) : doc;
  }

  private set(change: (o: FinishOptions) => void): void {
    change(this.o);
    this.render();
    this.schedulePreview();
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
      this.checkRow("Bandeau haut (jusqu'au plafond s'il y en a un)", o.cornice.on, (v) => this.set((x) => (x.cornice.on = v))),
      o.cornice.on ? this.numberRow("Hauteur du bandeau sans plafond", o.cornice.height, unit, (v) => v > 0 && this.set((x) => (x.cornice.height = v))) : null,
      this.checkRow("Plinthe (sous un socle)", o.plinth.on, (v) => this.set((x) => (x.plinth.on = v))),
      o.plinth.on ? this.numberRow("Hauteur de plinthe", o.plinth.height, unit, (v) => v > 0 && this.set((x) => (x.plinth.height = v))) : null,
      o.plinth.on ? this.numberRow("Retrait de la plinthe", o.plinth.recess, unit, (v) => v >= 0 && this.set((x) => (x.plinth.recess = v))) : null,
      ...this.notes.map((n) => this.info(n)),
      this.info("Les murs et le plafond sont ceux de la Pièce relevée, de l'Implantation de cuisine ou de l'Assistant Dressing. Gauche et droite sont vus de devant."),
    ];
  }

  /** Opens the panel with its preview. */
  open(): void {
    this.start();
    this.schedulePreview();
  }
}
